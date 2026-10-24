/**
 * The single replacement turning `before` into `after`: common prefix and suffix kept, offsets in
 * `before` (UTF-16, as `TextDocument.positionAt`). Hosts apply it as one WorkspaceEdit instead of
 * replacing the whole document, so cursors, folding, decorations and diffs elsewhere stay put.
 * `null` when the texts are equal. Never splits a surrogate pair.
 */
export function minimalEdit(before: string, after: string): { start: number; end: number; text: string } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (start > 0 && isHigh(before.charCodeAt(start - 1))) start--;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before.charCodeAt(endB - 1) === after.charCodeAt(endA - 1)) endB--, endA--;
  if (endB < before.length && isLow(before.charCodeAt(endB)) && endB > start) endB++, endA++;
  return { start, end: endB, text: after.slice(start, endA) };
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** Text as the document stores it: VS Code keeps one end-of-line sequence per document. */
export function withEol(text: string, crlf: boolean): string {
  return crlf ? text.replace(/\r?\n/g, '\r\n') : text;
}
