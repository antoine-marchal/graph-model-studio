import { findLayout, type CorporateMaster, tr } from '@corporate-slides/core';
import { documentToDsl, sourceKindOf } from '@corporate-slides/parser';

/** Pick a layout reference: alias when the template provides it, else the first layout id. */
function pick(m: CorporateMaster, ...aliases: string[]): string {
  for (const a of aliases) if (findLayout(m, a)) return a;
  return m.layouts[0]!.id;
}

/** Starter source for "New Presentation" (Markdown or DSL depending on the file extension). */
export function newPresentationSource(fileName: string, m: CorporateMaster, title: string, contentLayout?: string): string {
  const titleL = pick(m, 'title');
  const contentL = contentLayout ?? pick(m, 'content');
  if (sourceKindOf(fileName) === 'dsl') {
    return documentToDsl({
      version: '1',
      metadata: { title },
      masterRef: 'corporate',
      themeRef: 'default',
      dimensions: m.dimensions,
      slides: [
        { id: 'cover', layout: titleL, elements: [
          { id: 'title', type: 'text', placeholder: 'title', paragraphs: [{ runs: [{ text: title }] }] },
          { id: 'subtitle', type: 'text', placeholder: 'subtitle', paragraphs: [{ runs: [{ text: tr('Sous-titre', 'Subtitle') }] }] },
        ] },
        { id: 'slide-2', layout: contentL, elements: [
          { id: 'title', type: 'text', placeholder: 'title', paragraphs: [{ runs: [{ text: tr('Titre de la diapositive', 'Slide title') }] }] },
          { id: 'body', type: 'text', placeholder: 'body', paragraphs: [{ runs: [{ text: tr('Premier point', 'First point') }], list: 'bullet' }, { runs: [{ text: tr('Second point', 'Second point') }], list: 'bullet' }] },
        ] },
      ],
    });
  }
  return `---
title: ${JSON.stringify(title)}
master: corporate
theme: default
---

---
id: cover
layout: ${titleL}
---

# ${title}

${tr('Sous-titre', 'Subtitle')}

---
id: slide-2
layout: ${contentL}
---

# ${tr('Titre de la diapositive', 'Slide title')}

- ${tr('Premier point', 'First point')}
- ${tr('Second point', 'Second point')}
`;
}
