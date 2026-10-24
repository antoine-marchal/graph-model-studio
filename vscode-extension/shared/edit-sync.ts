/**
 * Versioned text edits between an editor webview and the extension host. An edit is a list of
 * replacements in the text of `baseVersion`. When the document moved on meanwhile (another panel,
 * the text editor, git…), the edit is rebased onto the current text if it touches none of the
 * changed region; otherwise it is a conflict and nothing is written.
 */
import { minimalEdit } from "./minimal-edit";

export interface TextChange {
  start: number;
  end: number;
  text: string;
}

/** Replacements must be sorted and disjoint (as produced by `changesBetween`). */
export function applyChanges(text: string, changes: readonly TextChange[]): string {
  let out = "";
  let at = 0;
  for (const c of changes) {
    if (c.start < at || c.end < c.start || c.end > text.length) throw new Error("invalid text change");
    out += text.slice(at, c.start) + c.text;
    at = c.end;
  }
  return out + text.slice(at);
}

export function changesBetween(before: string, after: string): TextChange[] {
  const e = minimalEdit(before, after);
  return e ? [e] : [];
}

/**
 * `mine` (against `base`) moved onto `theirs`, or null when both touch the same region. Edits that
 * only meet at a boundary are ambiguous (two insertions at one point) and also conflict.
 */
export function rebaseChanges(base: string, theirs: string, mine: readonly TextChange[]): TextChange[] | null {
  const external = minimalEdit(base, theirs);
  if (!external) return [...mine];
  const delta = external.text.length - (external.end - external.start);
  const out: TextChange[] = [];
  for (const c of mine) {
    if (c.end <= external.start && !(c.end === external.start && (c.start === c.end || external.start === external.end))) out.push(c);
    else if (c.start >= external.end && !(c.start === external.end && (c.start === c.end || external.start === external.end))) out.push({ start: c.start + delta, end: c.end + delta, text: c.text });
    else return null;
  }
  return out;
}

export function validChanges(value: unknown, length: number): value is TextChange[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  let at = 0;
  for (const c of value) {
    if (!c || typeof c !== "object") return false;
    const { start, end, text } = c as TextChange;
    if (!Number.isInteger(start) || !Number.isInteger(end) || typeof text !== "string") return false;
    if (start < at || end < start || end > length) return false;
    at = end;
  }
  return true;
}
