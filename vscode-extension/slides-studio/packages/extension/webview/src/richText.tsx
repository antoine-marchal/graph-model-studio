import type { CSSProperties, ReactNode } from 'react';
import type { TextRun } from '@corporate-slides/core';
import { capsCss, PPI } from '@corporate-slides/renderer';
import { useEditor } from './store';
import type { RunFormat } from './Format';

/* Rich-text helpers shared by the text box editor (Canvas) and the table editor. */

/** Run formats kept as they are while editing. */
export function runExtra(run: TextRun): Partial<TextRun> | null {
  const e: Partial<TextRun> = {};
  if (run.strike) e.strike = true;
  if (run.highlight) e.highlight = run.highlight;
  if (run.baseline) e.baseline = run.baseline;
  return Object.keys(e).length ? e : null;
}
const runExtraCss = (e: Partial<TextRun>, hex: (token: string) => string | null): CSSProperties => ({
  textDecoration: e.strike ? 'line-through' : undefined,
  background: e.highlight && hex(e.highlight) ? `#${hex(e.highlight)}` : undefined,
  verticalAlign: e.baseline,
  fontSize: e.baseline ? '0.66em' : undefined,
});

export function RunView({ run, hex }: { run: TextRun; hex: (token: string) => string | null }) {
  let node: ReactNode = run.text;
  if (run.underline) node = <u>{node}</u>;
  if (run.italic) node = <i>{node}</i>;
  if (run.bold) node = <b>{node}</b>;
  if (run.size) node = <span data-size={run.size} style={{ fontSize: (run.size / 72) * PPI }}>{node}</span>;
  if (run.caps) node = <span data-caps={run.caps} style={capsCss(run.caps)}>{node}</span>;
  if (run.font) node = <span data-font={run.font} style={{ fontFamily: fontCss(run.font) }}>{node}</span>;
  // Formats without an editor command (font, strike, highlight, super / subscript) ride on a span.
  const extra = runExtra(run);
  if (extra) node = <span data-run={JSON.stringify(extra)} style={runExtraCss(extra, hex)}>{node}</span>;
  return run.color ? <span data-color={run.color} style={{ color: hex(run.color) ? `#${hex(run.color)}` : undefined }}>{node}</span> : <>{node}</>;
}

/** CSS family of a font value (`theme.heading` / `theme.body` resolve through the master). */
export function fontCss(font: string): string {
  const m = useEditor.getState().master;
  const f = font === 'theme.heading' ? m?.theme.fonts.heading : font === 'theme.body' ? m?.theme.fonts.body : font;
  return `"${f}", Arial, sans-serif`;
}

/** A caret inside a word selects the word (PowerPoint formats the word under the caret). */
function wordAtCaret(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return !!sel?.rangeCount;
  const n = sel.anchorNode;
  if (!n || n.nodeType !== Node.TEXT_NODE || !root.contains(n)) return false;
  const t = n.textContent ?? '';
  let a = sel.anchorOffset, b = a;
  while (a > 0 && /[\p{L}\p{N}_'-]/u.test(t[a - 1]!)) a--;
  while (b < t.length && /[\p{L}\p{N}_'-]/u.test(t[b]!)) b++;
  if (a === b) return false;
  const r = document.createRange();
  r.setStart(n, a);
  r.setEnd(n, b);
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}

/**
 * Apply size / color to the selected text (wrapping each selected piece of each line in a span), or
 * strip every mark. Bold / italic / underline go through the native commands, which toggle.
 */
export function formatSelection(root: HTMLElement, f: RunFormat, hex: (token: string) => string | null): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !wordAtCaret(root) || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  if (f !== 'clear' && (f.bold !== undefined || f.italic !== undefined || f.underline !== undefined)) {
    document.execCommand(f.bold !== undefined ? 'bold' : f.italic !== undefined ? 'italic' : 'underline');
    return true;
  }
  // Text boxes have one block per paragraph; a table cell is a single line.
  const lines = root.querySelector(':scope > [data-line]') ? [...root.children].filter((l) => range.intersectsNode(l)) : [root];
  const made: Node[] = [];
  for (const line of lines) {
    const r = document.createRange();
    r.selectNodeContents(line);
    if (line.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
    if (line.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
    if (r.collapsed) continue;
    const frag = r.extractContents();
    let node: Node;
    if (f === 'clear') node = document.createTextNode(frag.textContent ?? '');
    else {
      const key = f.size !== undefined ? 'size' : f.caps !== undefined ? 'caps' : f.font !== undefined ? 'font' : 'color';
      const value = key === 'size' ? f.size : key === 'caps' ? f.caps : key === 'font' ? f.font : f.color;
      // The new value replaces the same mark inside the selection; null only removes it.
      frag.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((el) => el.replaceWith(...el.childNodes));
      const span = document.createElement('span');
      if (value !== null && value !== undefined) {
        span.dataset[key] = String(value);
        if (key === 'size') span.style.fontSize = `${(Number(value) / 72) * PPI}px`;
        else if (key === 'caps') Object.assign(span.style, capsCss(String(value)));
        else if (key === 'font') span.style.fontFamily = fontCss(String(value));
        else if (hex(String(value))) span.style.color = `#${hex(String(value))}`;
      }
      span.append(frag);
      node = span;
    }
    r.insertNode(node);
    made.push(node);
  }
  if (made.length) {
    const nr = document.createRange();
    nr.setStartBefore(made[0]!);
    nr.setEndAfter(made[made.length - 1]!);
    sel.removeAllRanges();
    sel.addRange(nr);
  }
  return true;
}

/**
 * Text between the start of the caret's block and a collapsed caret ('' when the selection is not
 * collapsed or outside `root`). `isBlock` tells which ancestor is the block (a line, a cell).
 */
export function textBeforeCaret(root: HTMLElement, isBlock: (n: Node) => boolean): string {
  const s = window.getSelection();
  if (!s || !s.isCollapsed || !s.anchorNode || !root.contains(s.anchorNode)) return '';
  let block: Node | null = s.anchorNode;
  while (block && block !== root && !isBlock(block)) block = block.parentNode;
  const range = document.createRange();
  range.selectNodeContents(block ?? root);
  range.setEnd(s.anchorNode, s.anchorOffset);
  return range.toString();
}
