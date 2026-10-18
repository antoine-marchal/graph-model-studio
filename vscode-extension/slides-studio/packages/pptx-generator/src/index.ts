import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { RULES, validateDocument, type CorporateMaster, type Diagnostic, type SlideDocument, type ValidateOptions, tr } from '@corporate-slides/core';
import { buildPresentation, type CompileOptions, type CompileStats } from './compile.js';
import { postProcess, validatePackage, type PackageCheck } from './compatibility.js';

export * from './compile.js';
export * from './compatibility.js';

export interface ExportReport {
  generatedAt: string;
  output: string;
  fidelity: CorporateMaster['fidelity'];
  stats: CompileStats;
  package: PackageCheck;
  compatibilityFixes: string[];
  diagnostics: Diagnostic[];
  fontWarnings: string[];
}

export interface ExportOptions extends CompileOptions, ValidateOptions {
  output: string;
  /** Export even when blocking validation errors exist. */
  force?: boolean;
  /** Fonts installed on the machine (lower-case), for font warnings. */
  installedFonts?: Set<string>;
}

export class BlockingDiagnosticsError extends Error {
  constructor(public diagnostics: Diagnostic[]) {
    super(`${diagnostics.length} ${tr('erreur(s) bloquante(s)', 'blocking error(s)')} : ${diagnostics.slice(0, 3).map((d) => d.message).join(' ; ')}`);
  }
}

/** SlideDocument → master adapter → pptxgenjs-plus → OOXML adapter → validated .pptx + report. */
export async function exportPptx(doc: SlideDocument, master: CorporateMaster, opts: ExportOptions): Promise<ExportReport> {
  const diagnostics = validateDocument(doc, master, opts);
  const blocking = diagnostics.filter((d) => d.severity === 'error');
  if (blocking.length && !opts.force) throw new BlockingDiagnosticsError(blocking);

  const { pres, stats } = buildPresentation(doc, master, opts);
  pres.compression = 'best';
  const raw = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const { buffer, fixes } = await postProcess(raw, { layoutMedia: stats.layoutMedia, adjustments: stats.adjustments });
  const pkg = await validatePackage(buffer);
  if (!pkg.ok) throw new Error(tr(`Paquet PPTX invalide : ${pkg.errors.slice(0, 5).join(' ; ')}`, `Invalid PPTX package: ${pkg.errors.slice(0, 5).join('; ')}`));
  await mkdir(dirname(opts.output), { recursive: true });
  await writeFile(opts.output, buffer);

  const fontWarnings: string[] = [];
  if (opts.installedFonts) {
    for (const f of new Set([master.theme.fonts.heading, master.theme.fonts.body])) {
      if (!opts.installedFonts.has(f.toLowerCase())) fontWarnings.push(tr(`Police « ${f} » non installée sur ce poste : PowerPoint utilisera une police de substitution`, `Font “${f}” not installed on this machine: PowerPoint will use a substitute font`));
    }
  }
  return { generatedAt: new Date().toISOString(), output: opts.output, fidelity: master.fidelity, stats, package: pkg, compatibilityFixes: fixes, diagnostics, fontWarnings };
}

export function reportToMarkdown(r: ExportReport, master: CorporateMaster): string {
  const s = r.stats;
  const L: string[] = [tr(`# Rapport d'export`, '# Export report'), '', `- ${tr('Fichier', 'File')} : \`${r.output}\``, tr(`- Généré le : ${r.generatedAt}`, `- Generated on: ${r.generatedAt}`), `- ${tr('Gabarit', 'Template')} : ${master.source.file} (sha256 ${master.source.sha256.slice(0, 12)}…)`];
  L.push(tr(`- Méthode des masques : **${r.fidelity.method}** — ${r.fidelity.description}`, `- Master method: **${r.fidelity.method}** — ${r.fidelity.description}`), '');
  L.push(tr('## Contenu', '## Content'), '', tr('| Mesure | Valeur |', '| Measure | Value |'), '|---|---|');
  L.push(`| ${tr('Diapositives', 'Slides')} | ${s.slides} |`, tr(`| Textes natifs | ${s.nativeText} (dont ${s.placeholderBound} liés à un espace réservé) |`, `| Native texts | ${s.nativeText} (${s.placeholderBound} bound to a placeholder) |`), tr(`| Formes natives | ${s.nativeShapes} |`, `| Native shapes | ${s.nativeShapes} |`), `| ${tr('Images', 'Pictures')} | ${s.nativeImages} |`, tr(`| Tableaux natifs | ${s.nativeTables} |`, `| Native tables | ${s.nativeTables} |`), tr(`| Éléments aplatis | ${s.flattened.length} |`, `| Flattened elements | ${s.flattened.length} |`));
  L.push(`| ${tr('Dispositions utilisées', 'Layouts used')} | ${s.layoutsUsed.map((l) => `\`${l}\``).join(', ')} |`, '');
  L.push(tr('## Paquet OOXML', '## OOXML package'), '', tr(`- Validation structurelle : ${r.package.ok ? '✅ valide' : '❌ invalide'} (XML bien formé, relations, types de contenu)`, `- Structural validation: ${r.package.ok ? '✅ valid' : '❌ invalid'} (well-formed XML, relationships, content types)`));
  L.push(`- ${tr('Dimensions', 'Size')} : ${r.package.slideSize ? `${r.package.slideSize.cx} × ${r.package.slideSize.cy} EMU` : '?'}`);
  L.push(tr(`- Correctifs de compatibilité : ${r.compatibilityFixes.length ? r.compatibilityFixes.join(' ; ') : 'aucun'}`, `- Compatibility fixes: ${r.compatibilityFixes.length ? r.compatibilityFixes.join('; ') : 'none'}`), '');
  L.push(tr('| Partie | Disposition | Formes | Images | Tableaux | Espaces réservés |', '| Part | Layout | Shapes | Pictures | Tables | Placeholders |'), '|---|---|---|---|---|---|');
  for (const sl of r.package.slides) L.push(`| ${sl.part} | ${sl.layout} | ${sl.shapes} | ${sl.pictures} | ${sl.tables} | ${sl.placeholders} |`);
  L.push('', tr('## Fonctionnalités non prises en charge', '## Unsupported features'), '');
  L.push(...(s.unsupported.length ? s.unsupported.map((u) => `- ${u}`) : [tr('- Aucune dans ce document.', '- None in this document.')]));
  L.push(tr(`- Fonctionnalités du gabarit non reproduites : ${master.unsupported.map((u) => u.feature).join(', ') || 'aucune'} (voir compatibility-report.md)`, `- Template features not reproduced: ${master.unsupported.map((u) => u.feature).join(', ') || 'none'} (see compatibility-report.md)`));
  L.push('', tr('## Polices', '## Fonts'), '', ...(r.fontWarnings.length ? r.fontWarnings.map((w) => `- ⚠ ${w}`) : [tr('- Polices du thème disponibles.', '- Theme fonts available.')]));
  L.push('', tr('## Conformité corporate et mise en page', '## Corporate compliance and layout'), '');
  if (!r.diagnostics.length) L.push(tr('Aucun problème détecté.', 'No issue found.'));
  else {
    L.push(tr('| Gravité | Règle | Diapositive | Élément | Message |', '| Severity | Rule | Slide | Element | Message |'), '|---|---|---|---|---|');
    for (const d of r.diagnostics) L.push(`| ${d.severity === 'error' ? `❌ ${tr('erreur', 'error')}` : `⚠ ${tr('avertissement', 'warning')}`} | ${RULES[d.rule]?.label ?? d.rule} | ${d.slideIndex !== undefined ? d.slideIndex + 1 : ''} | ${d.elementId ?? ''} | ${d.message} |`);
  }
  L.push('', tr('> Les débordements de texte sont estimés (métriques de police approchées) ; seul un rendu PowerPoint/LibreOffice fait foi.', '> Text overflows are estimated (approximate font metrics); only a PowerPoint/LibreOffice rendering is authoritative.'));
  return L.join('\n') + '\n';
}
