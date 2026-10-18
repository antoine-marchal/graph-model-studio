import type { CorporateMaster } from '@corporate-slides/core';
import { tr } from '@corporate-slides/core';
import type { PackageInventory } from './ooxml.js';

const fmt = (n: number) => n.toFixed(2);

export function extractionReport(m: CorporateMaster, inv: PackageInventory, notes: string[]): string {
  const L: string[] = [];
  L.push(`# Rapport d'extraction — ${m.name}`, '');
  L.push(`- ${tr('Fichier source', 'Source file')} : \`${m.source.file}\``);
  L.push(`- SHA-256 : \`${m.source.sha256}\``);
  L.push(tr(`- Importé le : ${m.source.importedAt}`, `- Imported on: ${m.source.importedAt}`));
  L.push(`- Extracteur : ${m.source.extractor.name} ${m.source.extractor.version}`);
  L.push(`- Dimensions : ${m.dimensions.width} × ${m.dimensions.height} in (ratio ${m.constraints.aspectRatio})`);
  L.push(tr(`- Masques : ${m.masters.length} · Dispositions : ${m.layouts.length} · Diapositives d'exemple : ${inv.slideCount}`, `- Masters: ${m.masters.length} · Layouts: ${m.layouts.length} · Sample slides: ${inv.slideCount}`));
  L.push(tr(`- Méthode de fidélité : **${m.fidelity.method}** — ${m.fidelity.description}`, `- Fidelity method: **${m.fidelity.method}** — ${m.fidelity.description}`), '');
  L.push('## Masques', '', tr('| Id | Partie OOXML | Dispositions | Utilisé par les diapositives du gabarit | Principal |', '| Id | OOXML part | Layouts | Used by the template slides | Primary |'), '|---|---|---|---|---|');
  for (const ms of m.masters) {
    const usage = inv.masters.find((x) => x.part === ms.part)?.usage ?? 0;
    L.push(`| ${ms.id} | \`${ms.part}\` | ${ms.layoutIds.length} | ${usage} | ${ms.primary ? 'oui' : ''} |`);
  }
  L.push('', tr('## Thème', '## Theme'), '', '| Emplacement | Couleur |', '|---|---|');
  for (const [k, v] of Object.entries(m.theme.colors)) L.push(`| \`theme.${k}\` | #${v} |`);
  L.push('', tr(`Polices : titres **${m.theme.fonts.heading}**, corps **${m.theme.fonts.body}**.`, `Fonts: headings **${m.theme.fonts.heading}**, body **${m.theme.fonts.body}**.`), '');
  L.push('## Dispositions', '', tr('| Id | Nom | Alias | Masque | Partie | Espaces réservés | Objets statiques |', '| Id | Name | Aliases | Master | Part | Placeholders | Static objects |'), '|---|---|---|---|---|---|---|');
  for (const l of m.layouts) {
    L.push(
      `| \`${l.id}\` | ${l.name} | ${l.aliases.map((a) => `\`${a}\``).join(', ')} | ${l.masterId} | \`${l.sourcePart}\` | ${l.placeholders.map((p) => p.key).join(', ') || '—'} | ${l.objects.length} |`,
    );
  }
  L.push('', '## Ressources', '', tr('| Id | Fichier | Partie d’origine | Aperçu navigateur |', '| Id | File | Original part | Browser preview |'), '|---|---|---|---|');
  for (const a of m.assets) L.push(`| ${a.id} | \`${a.file}\` | \`${a.originalPart}\` | ${a.preview ? `\`${a.preview}\`` : a.format === 'emf' || a.format === 'wmf' ? '⚠ indisponible' : 'natif'} |`);
  if (notes.length) L.push('', '## Notes', '', ...notes.map((n) => `- ${n}`));
  L.push('', tr('## Avertissements', '## Warnings'), '');
  L.push(...(m.warnings.length ? m.warnings.map((w) => `- ${w}`) : [tr('Aucun.', 'None.')]));
  for (const l of m.layouts) if (l.warnings.length) L.push(...l.warnings.map((w) => `- [${l.id}] ${w}`));
  return L.join('\n') + '\n';
}

export function compatibilityReport(m: CorporateMaster, inv: PackageInventory): string {
  const L: string[] = [];
  L.push(tr(`# Rapport de compatibilité — ${m.name}`, `# Compatibility report — ${m.name}`), '');
  L.push(tr('## Méthode utilisée par les présentations générées', '## Method used by the generated presentations'), '');
  L.push(tr('| Méthode | Utilisée | Détail |', '| Method | Used | Detail |'), '|---|---|---|');
  L.push(tr(`| Héritage natif des masques d'origine | non | pptxgenjs-plus ne peut pas importer les masques d'un fichier existant |`, `| Native inheritance of the original masters | no | pptxgenjs-plus cannot import the masters of an existing file |`));
  L.push(tr(`| Définitions de masques reconstruites | **oui** | ${m.layouts.length} dispositions recréées (arrière-plans, formes, images, numéros de diapositive, espaces réservés natifs) |`, `| Reconstructed master definitions | **yes** | ${m.layouts.length} layouts recreated (backgrounds, shapes, pictures, slide numbers, native placeholders) |`));
  L.push(tr(`| Approximation aplatie (image) | non | aucune disposition n'est aplatie en image |`, `| Flattened approximation (picture) | no | no layout is flattened to a picture |`), '');
  L.push(tr('## Fonctionnalités OOXML détectées dans les masques et dispositions', '## OOXML features found in masters and layouts'), '');
  if (!inv.features.length) L.push(tr('Aucune fonctionnalité non prise en charge détectée.', 'No unsupported feature found.'));
  else {
    L.push(tr('| Fonctionnalité | Occurrences | Parties | Impact |', '| Feature | Occurrences | Parts | Impact |'), '|---|---|---|---|');
    for (const f of inv.features) {
      const parts = f.parts.length > 4 ? `${f.parts.slice(0, 4).map((p) => `\`${p}\``).join(', ')} … (+${f.parts.length - 4})` : f.parts.map((p) => `\`${p}\``).join(', ');
      L.push(`| ${f.feature} | ${f.count} | ${parts} | ${f.impact} |`);
    }
  }
  if (inv.externalRelationships.length) {
    L.push('', '## Relations externes (non suivies)', '', ...inv.externalRelationships.map((r) => `- ${r}`));
  }
  L.push('', tr('## Compatibilité pptx-masters → pptxgenjs-plus', '## pptx-masters → pptxgenjs-plus compatibility'), '');
  L.push(tr('- Format `defineSlideMaster` : compatible (vérifié par génération + ouverture PowerPoint).', '- `defineSlideMaster` format: compatible (checked by generating + opening in PowerPoint).'));
  L.push(tr('- Marges de texte : tableau TRBL en pouces dans les deux bibliothèques.', '- Text margins: TRBL array in inches in both libraries.'));
  L.push(tr('- Thème : couleurs et polices transmises via `pres.theme.themeColors` / `headFontFace` / `bodyFontFace`.', '- Theme: colors and fonts passed through `pres.theme.themeColors` / `headFontFace` / `bodyFontFace`.'));
  L.push(tr('- Noms d’espaces réservés non uniques dans le gabarit : renommés par clé stable (`body`, `body-2`…).', '- Non-unique placeholder names in the template: renamed by stable key (`body`, `body-2`…).'));
  L.push(tr('- EMF/WMF : type MIME absent de `[Content_Types].xml` chez pptxgenjs-plus 4.3.4 → corrigé par l’adaptateur OOXML isolé.', '- EMF/WMF: MIME type missing from `[Content_Types].xml` in pptxgenjs-plus 4.3.4 → fixed by the isolated OOXML adapter.'));
  return L.join('\n') + '\n';
}

export function slideMastersDoc(m: CorporateMaster): string {
  const L: string[] = [];
  L.push(tr(`# Masques corporate — référence pour développeurs et agents IA`, `# Corporate masters — reference for developers and AI agents`), '');
  L.push(`Source : \`${m.source.file}\` · ${m.layouts.length} dispositions · ${m.dimensions.width} × ${m.dimensions.height} in.`, '');
  L.push(tr('## Règles', '## Rules'), '');
  L.push(tr('- Toujours référencer une disposition par son **id** ou un **alias** ci-dessous (`layout: content`).', '- Always reference a layout by its **id** or an **alias** below (`layout: content`).'));
  L.push(tr('- Lier le texte aux espaces réservés (`placeholder: title`, `body`, `body-2`, `subtitle`…) plutôt que de positionner librement.', '- Bind text to placeholders (`placeholder: title`, `body`, `body-2`, `subtitle`…) rather than positioning freely.'));
  L.push('- Couleurs : jetons `theme.<emplacement>` ou `theme.<emplacement>.<variante>` uniquement (variantes : lighter80, lighter60, lighter40, lighter25, darker25, darker50).');
  L.push(`- Polices : \`theme.heading\` (${m.theme.fonts.heading}) et \`theme.body\` (${m.theme.fonts.body}).`);
  L.push(tr(`- Zone de contenu sûre : x ${fmt(m.constraints.safeArea.x)}, y ${fmt(m.constraints.safeArea.y)}, l ${fmt(m.constraints.safeArea.w)}, h ${fmt(m.constraints.safeArea.h)} in.`, `- Safe content area: x ${fmt(m.constraints.safeArea.x)}, y ${fmt(m.constraints.safeArea.y)}, w ${fmt(m.constraints.safeArea.w)}, h ${fmt(m.constraints.safeArea.h)} in.`));
  L.push(tr('- Valider avec `slides validate <fichier>` avant export.', '- Validate with `slides validate <file>` before exporting.'), '');
  L.push('## Dispositions', '');
  for (const l of m.layouts) {
    L.push(`### \`${l.id}\` — ${l.name}`, '');
    if (l.aliases.length) L.push(`Alias : ${l.aliases.map((a) => `\`${a}\``).join(', ')}  `);
    L.push(`${tr('Masque', 'Master')} : ${l.masterId} · ${tr('Partie', 'Part')} : \`${l.sourcePart}\`  `);
    if (l.background.color) L.push(`Fond : #${l.background.color}  `);
    if (l.placeholders.length) {
      L.push('', tr('| Clé | Type | x | y | l | h | Police | Taille |', '| Key | Type | x | y | w | h | Font | Size |'), '|---|---|---|---|---|---|---|---|');
      for (const p of l.placeholders) {
        L.push(`| \`${p.key}\` | ${p.type} | ${fmt(p.x)} | ${fmt(p.y)} | ${fmt(p.w)} | ${fmt(p.h)} | ${p.style.fontFace ?? ''} | ${p.style.fontSize ?? p.levels?.[0]?.fontSize ?? ''} |`);
      }
    } else L.push('', tr('Aucun espace réservé.', 'No placeholder.'));
    L.push('');
  }
  return L.join('\n');
}

export const STYLE_GUIDE_TEMPLATE = (m: CorporateMaster) => tr(`# Guide de style — ${m.name}

> Ce fichier est à vous : il n'est **jamais écrasé** lors d'une nouvelle extraction.
> Ajoutez ici les règles éditoriales que le validateur ne peut pas déduire du gabarit.

## Typographie
- Titres : ${m.theme.fonts.heading}, ${m.constraints.fontSizes.title[0]}–${m.constraints.fontSizes.title[1]} pt.
- Corps : ${m.theme.fonts.body}, ${m.constraints.fontSizes.body[0]}–${m.constraints.fontSizes.body[1]} pt.

## Couleurs
- Couleur principale : \`theme.dk2\` (#${m.theme.colors.dk2 ?? '??????'}).
- Accent : \`theme.accent1\` (#${m.theme.colors.accent1 ?? '??????'}).

## À faire / à éviter
- Un message par diapositive.
- Ne pas déplacer ni masquer le logo.
`, `# Style guide — ${m.name}

> This file is yours: it is **never overwritten** by a new extraction.
> Add here the editorial rules the validator cannot infer from the template.

## Typography
- Headings: ${m.theme.fonts.heading}, ${m.constraints.fontSizes.title[0]}–${m.constraints.fontSizes.title[1]} pt.
- Body: ${m.theme.fonts.body}, ${m.constraints.fontSizes.body[0]}–${m.constraints.fontSizes.body[1]} pt.

## Colors
- Main color: \`theme.dk2\` (#${m.theme.colors.dk2 ?? '??????'}).
- Accent: \`theme.accent1\` (#${m.theme.colors.accent1 ?? '??????'}).

## Do / don't
- One message per slide.
- Do not move or hide the logo.
`);

/** TypeScript module registering the reconstructed masters on a pptxgenjs-plus instance (generated, for developers). */
export function generatedMastersTs(m: CorporateMaster): string {
  const masters = m.layouts.map((l) => ({
    title: l.id,
    background: l.background.color ? { color: l.background.color } : l.background.assetId ? { path: `assets/${m.assets.find((a) => a.id === l.background.assetId)?.file.split('/').pop()}` } : undefined,
    slideNumber: l.slideNumber ?? undefined,
    objects: [
      ...l.objects.filter((o) => o.role !== 'footer' && o.role !== 'date').map((o) => o.object),
      ...l.placeholders.map((p) => ({ placeholder: { options: { name: p.key, type: p.type === 'title' ? 'title' : p.type === 'pic' ? 'pic' : 'body', x: p.x, y: p.y, w: p.w, h: p.h }, text: '' } })),
    ],
  }));
  return `// Generated by Corporate Slides Studio from ${m.source.file} (sha256 ${m.source.sha256.slice(0, 12)}).
// Do not edit: re-run "Corporate Slides: Import PowerPoint Template" instead.
// Image paths are relative to this directory; pass \`baseDir\` to resolve them.
import type PptxGenJS from 'pptxgenjs-plus';
import { tr } from '@corporate-slides/core';

export const THEME = ${JSON.stringify(m.theme, null, 2)} as const;

export const LAYOUT_IDS = ${JSON.stringify(m.layouts.map((l) => l.id))} as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

const MASTERS = ${JSON.stringify(masters, null, 1)};

export function registerCorporateMasters(pptx: PptxGenJS, baseDir: string): void {
  pptx.defineLayout({ name: 'CORPORATE', width: ${m.dimensions.width}, height: ${m.dimensions.height} });
  pptx.layout = 'CORPORATE';
  for (const def of MASTERS) {
    const fix = (o: Record<string, any>) => (o.image?.path ? { image: { ...o.image, path: baseDir + '/' + o.image.path } } : o);
    pptx.defineSlideMaster({ ...def, objects: def.objects.map(fix) } as any);
  }
}
`;
}
