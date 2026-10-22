import { buildMdModel } from './markdown.js';

/** A foldable line range of a `.deck` source (0-based, inclusive). */
export interface DeckFold {
  start: number;
  end: number;
  /** `frontmatter`: a YAML header (folded when the file opens); `element`: one `elements:` entry; `block`: a `:::` block. */
  kind: 'frontmatter' | 'elements' | 'element' | 'block';
}

/**
 * Folding of a Markdown deck: each YAML header (deck and slide) from its first to its last line, so
 * the `---` fences and the first key stay visible, its `elements:` list and each entry of it, and
 * every `:::` block (nested ones too).
 */
export function deckFoldingRanges(text: string): DeckFold[] {
  const lineStarts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') lineStarts.push(k + 1);
  const lineOf = (o: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= o) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const out: DeckFold[] = [];
  const model = buildMdModel(text);
  for (const fm of [model.docFm, ...model.slides.map((s) => s.fm)]) {
    if (!fm || fm.end <= fm.start) continue;
    const start = lineOf(fm.start), end = lineOf(fm.end - 1);
    if (end > start) out.push({ start, end, kind: 'frontmatter' });
    // `elements:` and each `- ` entry at its first indentation.
    let list = -1, indent: string | null = null, item = -1;
    const close = (to: number) => {
      if (item >= 0 && to > item) out.push({ start: item, end: to, kind: 'element' });
      item = -1;
    };
    for (let l = start; l <= end; l++) {
      const t = lines[l] ?? '';
      if (list < 0) {
        if (/^elements:\s*$/.test(t)) list = l;
        continue;
      }
      const m = /^(\s*)- /.exec(t);
      if (t && !/^\s/.test(t) && !t.startsWith('-')) {
        // Next top-level key: the list ends here.
        close(l - 1);
        if (l - 1 > list) out.push({ start: list, end: l - 1, kind: 'elements' });
        list = -1;
        indent = null;
        if (/^elements:\s*$/.test(t)) list = l;
        continue;
      }
      if (m && (indent === null || m[1] === indent)) {
        close(l - 1);
        indent ??= m[1]!;
        item = l;
      }
    }
    if (list >= 0) {
      close(end);
      if (end > list) out.push({ start: list, end, kind: 'elements' });
    }
  }
  // `:::` blocks: every fence opens, a bare one closes the innermost (outside code fences).
  const stack: number[] = [];
  let code = false;
  lines.forEach((t, l) => {
    if (/^\s*(```|~~~)/.test(t)) code = !code;
    if (code) return;
    if (/^:{3,}\s*[^:\s]/.test(t)) stack.push(l);
    else if (/^:{3,}\s*$/.test(t) && stack.length) {
      const s = stack.pop()!;
      if (l > s) out.push({ start: s, end: l, kind: 'block' });
    }
  });
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}
