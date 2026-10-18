import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { RULES } from '@corporate-slides/core';
import { detectRenderer, discoverTemplates, importTemplate, renderPptxToPng } from '@corporate-slides/master-extractor';
import { documentToDsl } from '@corporate-slides/parser';
import { exportPptx, reportToMarkdown, BlockingDiagnosticsError } from '@corporate-slides/pptx-generator';
import { loadMasterFor, loadProject, projectRootOf, fsValidateOptions, validateProject } from './project.js';
import { newPresentationSource } from './scaffold.js';

const program = new Command();
program.name('slides').description('Corporate Slides Studio — PowerPoint as code').version('0.1.0');

const master = program.command('master').description('Gabarits corporate');

master
  .command('import [template]')
  .description("Importer un gabarit .pptx/.potx (découverte automatique si omis) vers .corporate-slides/master/")
  .option('-r, --root <dir>', 'racine du projet', '.')
  .option('--thumbnails', 'générer les vignettes de référence avec PowerPoint (si installé)')
  .action(async (template: string | undefined, o: { root: string; thumbnails?: boolean }) => {
    const root = resolve(o.root);
    let file = template;
    if (!file) {
      const found = await discoverTemplates(root);
      if (!found.length) throw new Error('Aucun gabarit .pptx/.potx trouvé dans le projet');
      file = found[0]!;
      console.log(`Gabarit découvert : ${relative(root, file)}${found.length > 1 ? ` (${found.length - 1} autre(s) ignoré(s))` : ''}`);
    }
    const r = await importTemplate(resolve(file), root, { thumbnails: o.thumbnails, log: (m) => console.log(m) });
    for (const n of r.notes) console.log(`note : ${n}`);
    console.log(`Fichiers :\n${r.files.map((f) => '  ' + relative(root, f)).join('\n')}`);
  });

master
  .command('list')
  .description('Lister les dispositions du masque importé')
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
  .description('Valider une présentation (schéma + charte corporate)')
  .option('--json', 'sortie JSON')
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
      console.log(`${p.doc.slides.length} diapositive(s) · ${errors} erreur(s) · ${diags.length - diags.filter((d) => d.severity === 'error').length} avertissement(s)`);
    }
    if (p.parseErrors.length || diags.some((d) => d.severity === 'error')) process.exitCode = 1;
  });

program
  .command('build <file>')
  .description('Générer un .pptx natif et éditable + rapport d’export')
  .option('-o, --out <file>', 'fichier de sortie (défaut : out/<nom>.pptx à côté de la source)')
  .option('--force', 'exporter malgré les erreurs bloquantes')
  .option('--render', 'rendre les diapositives générées en PNG (PowerPoint/LibreOffice local)')
  .action(async (file: string, o: { out?: string; force?: boolean; render?: boolean }) => {
    const p = await loadProject(resolve(file));
    if (p.parseErrors.length) throw new Error(`Source invalide :\n${p.parseErrors.join('\n')}`);
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
      console.log(`✅ ${relative(process.cwd(), out)} — ${report.stats.slides} diapositives, ${report.stats.nativeText} textes, ${report.stats.nativeShapes} formes, ${report.stats.nativeTables} tableaux, ${report.stats.nativeImages} images (natifs)`);
      console.log(`   paquet ${report.package.ok ? 'valide' : 'INVALIDE'} · ${report.diagnostics.length} diagnostic(s) · rapport : ${relative(process.cwd(), out.replace(/\.pptx$/, '.report.md'))}`);
      if (o.render) {
        const r = await renderPptxToPng(out, out.replace(/\.pptx$/, '-png'));
        console.log(r.renderer === 'none' ? 'Aucun moteur de rendu local (PowerPoint/LibreOffice) : rendu ignoré.' : `Rendu ${r.renderer} : ${r.files.length} image(s) dans ${relative(process.cwd(), dirname(r.files[0] ?? out))}`);
      }
    } catch (e) {
      if (e instanceof BlockingDiagnosticsError) {
        for (const d of e.diagnostics) console.error(`❌ ${d.message}`);
        console.error('Export bloqué (utilisez --force pour ignorer).');
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  });

program
  .command('preview <file>')
  .description('Générer puis rendre la présentation en PNG avec le moteur local de référence')
  .action(async (file: string) => {
    const r0 = detectRenderer();
    if (r0.kind === 'none') throw new Error('Aucun moteur de rendu local : installez PowerPoint (Windows) ou LibreOffice. Pour l’aperçu interactif, utilisez l’éditeur visuel VS Code.');
    const p = await loadProject(resolve(file));
    const out = join(dirname(resolve(file)), 'out', basename(file).replace(/\.slides\.\w+$/, '') + '.preview.pptx');
    await exportPptx(p.doc, p.master, { output: out, masterDir: p.masterDir, sourceDir: dirname(resolve(file)), force: true });
    const r = await renderPptxToPng(out, out.replace(/\.pptx$/, '-png'));
    console.log(r.files.map((f) => relative(process.cwd(), f)).join('\n'));
  });

program
  .command('convert <file>')
  .description('Convertir un .slides.md en DSL complet .slides.yaml (conversion explicite)')
  .option('-o, --out <file>')
  .action(async (file: string, o: { out?: string }) => {
    const p = await loadProject(resolve(file));
    const out = o.out ?? file.replace(/\.slides\.md$/i, '.slides.yaml');
    if (existsSync(out)) throw new Error(`${out} existe déjà`);
    await writeFile(out, documentToDsl(p.doc));
    console.log(`Écrit : ${out}`);
  });

program
  .command('new <file>')
  .description('Créer une présentation (.slides.md ou .slides.yaml) à partir du masque importé')
  .option('-t, --title <title>', 'titre', 'Nouvelle présentation')
  .action(async (file: string, o: { title: string }) => {
    if (existsSync(file)) throw new Error(`${file} existe déjà`);
    const { master: m } = await loadMasterFor(resolve(file));
    await mkdir(dirname(resolve(file)), { recursive: true });
    await writeFile(file, newPresentationSource(file, m, o.title));
    console.log(`Créé : ${file}`);
  });

program.parseAsync().catch((e: Error) => {
  console.error(`Erreur : ${e.message}`);
  process.exitCode = 1;
});

