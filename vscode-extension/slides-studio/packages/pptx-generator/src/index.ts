import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { RULES, validateDocument, type CorporateMaster, type Diagnostic, type SlideDocument, type ValidateOptions } from '@corporate-slides/core';
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
    super(`${diagnostics.length} erreur(s) bloquante(s) : ${diagnostics.slice(0, 3).map((d) => d.message).join(' ; ')}`);
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
  const { buffer, fixes } = await postProcess(raw, { layoutMedia: stats.layoutMedia });
  const pkg = await validatePackage(buffer);
  if (!pkg.ok) throw new Error(`Paquet PPTX invalide : ${pkg.errors.slice(0, 5).join(' ; ')}`);
  await mkdir(dirname(opts.output), { recursive: true });
  await writeFile(opts.output, buffer);

  const fontWarnings: string[] = [];
  if (opts.installedFonts) {
    for (const f of new Set([master.theme.fonts.heading, master.theme.fonts.body])) {
      if (!opts.installedFonts.has(f.toLowerCase())) fontWarnings.push(`Police « ${f} » non installée sur ce poste : PowerPoint utilisera une police de substitution`);
    }
  }
  return { generatedAt: new Date().toISOString(), output: opts.output, fidelity: master.fidelity, stats, package: pkg, compatibilityFixes: fixes, diagnostics, fontWarnings };
}

export function reportToMarkdown(r: ExportReport, master: CorporateMaster): string {
  const s = r.stats;
  const L: string[] = [`# Rapport d'export`, '', `- Fichier : \`${r.output}\``, `- Généré le : ${r.generatedAt}`, `- Gabarit : ${master.source.file} (sha256 ${master.source.sha256.slice(0, 12)}…)`];
  L.push(`- Méthode des masques : **${r.fidelity.method}** — ${r.fidelity.description}`, '');
  L.push('## Contenu', '', '| Mesure | Valeur |', '|---|---|');
  L.push(`| Diapositives | ${s.slides} |`, `| Textes natifs | ${s.nativeText} (dont ${s.placeholderBound} liés à un espace réservé) |`, `| Formes natives | ${s.nativeShapes} |`, `| Images | ${s.nativeImages} |`, `| Tableaux natifs | ${s.nativeTables} |`, `| Éléments aplatis | ${s.flattened.length} |`);
  L.push(`| Dispositions utilisées | ${s.layoutsUsed.map((l) => `\`${l}\``).join(', ')} |`, '');
  L.push('## Paquet OOXML', '', `- Validation structurelle : ${r.package.ok ? '✅ valide' : '❌ invalide'} (XML bien formé, relations, types de contenu)`);
  L.push(`- Dimensions : ${r.package.slideSize ? `${r.package.slideSize.cx} × ${r.package.slideSize.cy} EMU` : '?'}`);
  L.push(`- Correctifs de compatibilité : ${r.compatibilityFixes.length ? r.compatibilityFixes.join(' ; ') : 'aucun'}`, '');
  L.push('| Partie | Disposition | Formes | Images | Tableaux | Espaces réservés |', '|---|---|---|---|---|---|');
  for (const sl of r.package.slides) L.push(`| ${sl.part} | ${sl.layout} | ${sl.shapes} | ${sl.pictures} | ${sl.tables} | ${sl.placeholders} |`);
  L.push('', '## Fonctionnalités non prises en charge', '');
  L.push(...(s.unsupported.length ? s.unsupported.map((u) => `- ${u}`) : ['- Aucune dans ce document.']));
  L.push(`- Fonctionnalités du gabarit non reproduites : ${master.unsupported.map((u) => u.feature).join(', ') || 'aucune'} (voir compatibility-report.md)`);
  L.push('', '## Polices', '', ...(r.fontWarnings.length ? r.fontWarnings.map((w) => `- ⚠ ${w}`) : ['- Polices du thème disponibles.']));
  L.push('', '## Conformité corporate et mise en page', '');
  if (!r.diagnostics.length) L.push('Aucun problème détecté.');
  else {
    L.push('| Gravité | Règle | Diapositive | Élément | Message |', '|---|---|---|---|---|');
    for (const d of r.diagnostics) L.push(`| ${d.severity === 'error' ? '❌ erreur' : '⚠ avertissement'} | ${RULES[d.rule]?.label ?? d.rule} | ${d.slideIndex !== undefined ? d.slideIndex + 1 : ''} | ${d.elementId ?? ''} | ${d.message} |`);
  }
  L.push('', '> Les débordements de texte sont estimés (métriques de police approchées) ; seul un rendu PowerPoint/LibreOffice fait foi.');
  return L.join('\n') + '\n';
}
