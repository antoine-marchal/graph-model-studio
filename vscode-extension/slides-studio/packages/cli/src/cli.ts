import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { RULES, tr } from '@corporate-slides/core';
import { detectRenderer, discoverTemplates, importTemplate, renderPptxToPng } from '@corporate-slides/master-extractor';
import { documentToDsl } from '@corporate-slides/parser';
import { exportPptx, reportToMarkdown, BlockingDiagnosticsError } from '@corporate-slides/pptx-generator';
import { loadMasterFor, loadProject, projectRootOf, fsValidateOptions, validateProject } from './project.js';
import { newPresentationSource } from './scaffold.js';
import { importPresentation } from './import.js';

const program = new Command();
program.name('slides').description('Corporate Slides Studio — PowerPoint as code').version('0.1.0');

const master = program.command('master').description(tr('Gabarits corporate', 'Corporate templates'));

master
  .command('import [template]')
  .description(tr("Importer un gabarit .pptx/.potx (découverte automatique si omis) vers .corporate-slides/master/", "Import a .pptx/.potx template (auto-discovered if omitted) into .corporate-slides/master/"))
  .option('-r, --root <dir>', 'racine du projet', '.')
  .option('--thumbnails', tr('générer les vignettes de référence avec PowerPoint (si installé)', 'render reference thumbnails with PowerPoint (if installed)'))
  .action(async (template: string | undefined, o: { root: string; thumbnails?: boolean }) => {
    const root = resolve(o.root);
    let file = template;
    if (!file) {
      const found = await discoverTemplates(root);
      if (!found.length) throw new Error(tr('Aucun gabarit .pptx/.potx trouvé dans le projet', 'No .pptx/.potx template found in the project'));
      file = found[0]!;
      console.log(`${tr('Gabarit découvert', 'Template found')} : ${relative(root, file)}${found.length > 1 ? ` (${found.length - 1} ${tr('autre(s) ignoré(s)', 'other(s) ignored')})` : ''}`);
    }
    const r = await importTemplate(resolve(file), root, { thumbnails: o.thumbnails, log: (m) => console.log(m) });
    for (const n of r.notes) console.log(`note : ${n}`);
    console.log(`Fichiers :\n${r.files.map((f) => '  ' + relative(root, f)).join('\n')}`);
  });

master
  .command('list')
  .description(tr('Lister les dispositions du masque importé', 'List the layouts of the imported master'))
  .option('-r, --root <dir>', 'racine du projet', '.')
  .action(async (o: { root: string }) => {
    const { master: m } = await loadMasterFor(resolve(o.root, 'x.slides.md'));
    console.log(`${m.name} — ${m.layouts.length} dispositions (${m.fidelity.method})`);
    for (const l of m.layouts) {
      console.log(`${l.id.padEnd(36)} ${l.aliases.length ? `[${l.aliases.join(', ')}]`.padEnd(24) : ''.padEnd(24)} ${l.name} — ${l.placeholders.map((p) => p.key).join(', ') || '∅'}`);
    }
  });

program
  .command('validate <file>')
  .description(tr('Valider une présentation (schéma + charte corporate)', 'Validate a presentation (schema + corporate brand)'))
  .option('--json', tr('sortie JSON', 'JSON output'))
  .action(async (file: string, o: { json?: boolean }) => {
    const p = await loadProject(resolve(file));
    const diags = validateProject(p);
    if (o.json) console.log(JSON.stringify({ parseErrors: p.parseErrors, diagnostics: diags }, null, 2));
    else {
      for (const e of p.parseErrors) console.log(`❌ syntaxe : ${e}`);
      for (const d of diags) {
        const where = d.source ? `${basename(file)}:${d.source.startLine}` : basename(file);
        console.log(`${d.severity === 'error' ? '❌' : '⚠ '} ${where} [${RULES[d.rule]?.label ?? d.rule}] ${d.message}`);
      }
      const errors = diags.filter((d) => d.severity === 'error').length + p.parseErrors.length;
      console.log(`${p.doc.slides.length} ${tr('diapositive(s)', 'slide(s)')} · ${errors} ${tr('erreur(s)', 'error(s)')} · ${diags.length - diags.filter((d) => d.severity === 'error').length} ${tr('avertissement(s)', 'warning(s)')}`);
    }
    if (p.parseErrors.length || diags.some((d) => d.severity === 'error')) process.exitCode = 1;
  });

program
  .command('build <file>')
  .description(tr('Générer un .pptx natif et éditable + rapport d’export', 'Generate a native, editable .pptx + export report'))
  .option('-o, --out <file>', tr('fichier de sortie (défaut : out/<nom>.pptx à côté de la source)', 'output file (default: out/<name>.pptx next to the source)'))
  .option('--force', tr('exporter malgré les erreurs bloquantes', 'export despite blocking errors'))
  .option('--render', tr('rendre les diapositives générées en PNG (PowerPoint/LibreOffice local)', 'render the generated slides to PNG (local PowerPoint/LibreOffice)'))
  .action(async (file: string, o: { out?: string; force?: boolean; render?: boolean }) => {
    const p = await loadProject(resolve(file));
    if (p.parseErrors.length) throw new Error(tr(`Source invalide :\n${p.parseErrors.join('\n')}`, `Invalid source:\n${p.parseErrors.join('\n')}`));
    const name = basename(file).replace(/\.slides\.(md|ya?ml|json)$/i, '');
    const out = resolve(o.out ?? join(dirname(file), 'out', `${name}.pptx`));
    try {
      const report = await exportPptx(p.doc, p.master, {
        output: out,
        masterDir: p.masterDir,
        sourceDir: dirname(resolve(file)),
        force: o.force,
        ...fsValidateOptions(resolve(file), projectRootOf(p.masterDir)),
      });
      await writeFile(out.replace(/\.pptx$/, '.report.md'), reportToMarkdown(report, p.master));
      await writeFile(out.replace(/\.pptx$/, '.report.json'), JSON.stringify(report, null, 2));
      const st = report.stats;
      console.log(tr(`✅ ${relative(process.cwd(), out)} — ${st.slides} diapositives, ${st.nativeText} textes, ${st.nativeShapes} formes, ${st.nativeTables} tableaux, ${st.nativeImages} images (natifs)`, `✅ ${relative(process.cwd(), out)} — ${st.slides} slides, ${st.nativeText} texts, ${st.nativeShapes} shapes, ${st.nativeTables} tables, ${st.nativeImages} pictures (native)`));
      console.log(`   paquet ${report.package.ok ? 'valide' : 'INVALIDE'} · ${report.diagnostics.length} diagnostic(s) · rapport : ${relative(process.cwd(), out.replace(/\.pptx$/, '.report.md'))}`);
      if (o.render) {
        const r = await renderPptxToPng(out, out.replace(/\.pptx$/, '-png'));
        console.log(r.renderer === 'none' ? tr('Aucun moteur de rendu local (PowerPoint/LibreOffice) : rendu ignoré.', 'No local renderer (PowerPoint/LibreOffice): rendering skipped.') : `${tr('Rendu', 'Rendering')} ${r.renderer} : ${r.files.length} image(s) ${tr('dans', 'in')} ${relative(process.cwd(), dirname(r.files[0] ?? out))}`);
      }
    } catch (e) {
      if (e instanceof BlockingDiagnosticsError) {
        for (const d of e.diagnostics) console.error(`❌ ${d.message}`);
        console.error(tr('Export bloqué (utilisez --force pour ignorer).', 'Export blocked (use --force to ignore).'));
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  });

program
  .command('preview <file>')
  .description(tr('Générer puis rendre la présentation en PNG avec le moteur local de référence', 'Generate then render the presentation to PNG with the local reference renderer'))
  .action(async (file: string) => {
    const r0 = detectRenderer();
    if (r0.kind === 'none') throw new Error(tr('Aucun moteur de rendu local : installez PowerPoint (Windows) ou LibreOffice. Pour l’aperçu interactif, utilisez l’éditeur visuel VS Code.', 'No local renderer: install PowerPoint (Windows) or LibreOffice. For the interactive preview, use the VS Code visual editor.'));
    const p = await loadProject(resolve(file));
    const out = join(dirname(resolve(file)), 'out', basename(file).replace(/\.slides\.\w+$/, '') + '.preview.pptx');
    await exportPptx(p.doc, p.master, { output: out, masterDir: p.masterDir, sourceDir: dirname(resolve(file)), force: true });
    const r = await renderPptxToPng(out, out.replace(/\.pptx$/, '-png'));
    console.log(r.files.map((f) => relative(process.cwd(), f)).join('\n'));
  });

program
  .command('convert <file>')
  .description(tr('Convertir un .slides.md en DSL complet .slides.yaml (conversion explicite)', 'Convert a .slides.md into a full .slides.yaml DSL (explicit conversion)'))
  .option('-o, --out <file>')
  .action(async (file: string, o: { out?: string }) => {
    const p = await loadProject(resolve(file));
    const out = o.out ?? file.replace(/\.slides\.md$/i, '.slides.yaml');
    if (existsSync(out)) throw new Error(tr(`${out} existe déjà`, `${out} already exists`));
    await writeFile(out, documentToDsl(p.doc));
    console.log(`${tr('Écrit', 'Written')} : ${out}`);
  });

program
  .command('new <file>')
  .description(tr('Créer une présentation (.slides.md ou .slides.yaml) à partir du masque importé', 'Create a presentation (.deck, .slides.md or .slides.yaml) from the imported master'))
  .option('-t, --title <title>', 'titre', tr('Nouvelle présentation', 'New presentation'))
  .action(async (file: string, o: { title: string }) => {
    if (existsSync(file)) throw new Error(tr(`${file} existe déjà`, `${file} already exists`));
    const { master: m } = await loadMasterFor(resolve(file));
    await mkdir(dirname(resolve(file)), { recursive: true });
    await writeFile(file, newPresentationSource(file, m, o.title));
    console.log(`${tr('Créé', 'Created')} : ${file}`);
  });

program
  .command('import <pptx>')
  .description(tr('Convertir une présentation PowerPoint en .deck avec ses masques (.corporate-slides)', 'Convert a PowerPoint presentation into a .deck with its masters (.corporate-slides)'))
  .option('-o, --out <dir>', tr('dossier de sortie (défaut : <nom> à côté du .pptx)', 'output folder (default: <name> next to the .pptx)'))
  .option('--thumbnails', tr('générer les vignettes de référence avec PowerPoint (si installé)', 'render reference thumbnails with PowerPoint (if installed)'))
  .action(async (pptx: string, o: { out?: string; thumbnails?: boolean }) => {
    const file = resolve(pptx);
    const out = resolve(o.out ?? join(dirname(file), basename(file).replace(/\.(pptx|potx)$/i, '')));
    const r = await importPresentation(file, out, { thumbnails: o.thumbnails, log: (m) => console.log(m) });
    for (const w of r.warnings) console.log(`⚠  ${w}`);
    console.log(`${tr('Écrit', 'Written')} : ${relative(process.cwd(), r.deckPath)} · ${relative(process.cwd(), r.reportPath)}`);
  });

program.parseAsync().catch((e: Error) => {
  console.error(`${tr('Erreur', 'Error')} : ${e.message}`);
  process.exitCode = 1;
});

