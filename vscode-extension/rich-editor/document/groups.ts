/**
 * `::: id` … `:::` groups (Slides Studio's syntax): the body only holds content, everything else
 * lives in the `markdownStudio` frontmatter under the same id.
 *
 *   objects.<id>               positioned object (text box, shape, picture); the group is its text
 *   headers|footers.<kind>.id  header / footer text (not in the text flow)
 *   placeholders: [<id>]       text of the master placeholder <id> (not in the text flow)
 *   blocks.<id>  (or nothing)  the blocks of the group share these properties (style, alignment…)
 *
 * Fences are blanked before remark parses (same length: source offsets stay exact), so a group
 * needs no blank lines around its content; blocks nest, each `:::` closes the innermost one.
 */
import type { BlockProps, StoryDef, StorySet, StudioMeta } from "./schema";

/** Meta the parser classifies groups with (the webview's current frontmatter, or the file's). */
let currentMeta: () => StudioMeta | null | undefined = () => null;
export const setGroupMeta = (get: () => StudioMeta | null | undefined): void => void (currentMeta = get);
export const groupMeta = () => currentMeta();
/** Run `fn` (a parse) with groups classified by `meta`. */
export function withGroupMeta<T>(meta: StudioMeta | null | undefined, fn: () => T): T {
  const previous = currentMeta;
  currentMeta = () => meta;
  try {
    return fn();
  } finally {
    currentMeta = previous;
  }
}

/** Block groups replaced by their blocks (which carry the group in `data.msBlock`), at every depth. */
export function unwrapBlockGroups(list: any[]): any[] {
  return list.flatMap((n) => {
    if (Array.isArray(n.children) && n.type !== "paragraph" && n.type !== "heading") n.children = unwrapBlockGroups(n.children);
    return n.type === "studioGroup" ? n.children : [n];
  });
}

const OPEN_RE = /^:{3,}[ \t]*([A-Za-z][\w-]{0,63})[ \t]*$/;
const CLOSE_RE = /^:{3,}[ \t]*$/;
const CODE_FENCE_RE = /^\s*(```|~~~)/;

export interface GroupRange {
  id: string;
  /** Fences included. */
  outer: { start: number; end: number };
  /** Between the fences (the content source). */
  inner: { start: number; end: number };
}

/** The source with group fences blanked, and the groups (closed ones only, in source order). */
export function maskGroups(src: string): { masked: string; groups: GroupRange[] } {
  const groups: GroupRange[] = [];
  const open: { id: string; start: number; len: number; next: number }[] = [];
  let masked = src;
  const blank = (a: number, len: number) => (masked = masked.slice(0, a) + " ".repeat(len) + masked.slice(a + len));
  let inCode = false;
  let at = 0;
  for (;;) {
    const nl = src.indexOf("\n", at);
    const end = nl < 0 ? src.length : nl;
    const text = src.slice(at, end).replace(/\r$/, "");
    if (CODE_FENCE_RE.test(text)) inCode = !inCode;
    else if (!inCode) {
      const o = OPEN_RE.exec(text);
      if (o) open.push({ id: o[1], start: at, len: text.length, next: nl < 0 ? end : nl + 1 });
      else if (open.length && CLOSE_RE.test(text)) {
        // Only closed groups are masked: an unclosed opener stays text (and is reported).
        const g = open.pop()!;
        groups.push({ id: g.id, outer: { start: g.start, end: at + text.length }, inner: { start: g.next, end: Math.max(g.next, at) } });
        blank(g.start, g.len);
        blank(at, text.length);
      }
    }
    if (nl < 0) break;
    at = nl + 1;
  }
  groups.sort((x, y) => x.outer.start - y.outer.start);
  return { masked, groups };
}

export type GroupKind = "object" | "break" | "story" | "placeholder" | "block";

/** What a group id stands for, from the frontmatter. */
export function groupKind(id: string, meta: StudioMeta | null | undefined): GroupKind {
  if (meta?.objects?.[id]) return "object";
  if (meta?.breaks?.[id]) return "break";
  for (const set of [meta?.headers, meta?.footers]) for (const s of Object.values(set ?? {})) if (s?.id === id) return "story";
  if (meta?.placeholders?.includes(id)) return "placeholder";
  return "block";
}

const startOf = (n: any): number => n.position?.start.offset ?? -1;
const endOf = (n: any): number => n.position?.end.offset ?? -1;

/**
 * Root children → children with `::: id` groups: objects become `studioObject`, stories and
 * placeholders `studioStory` (raw Markdown, outside the flow), block groups `studioGroup` whose
 * blocks carry `msBlock` ({ id, …blocks.<id> }). `offset`: where `src` starts in the parsed text.
 */
export function wrapGroups(children: any[], groups: GroupRange[], src: string, meta: StudioMeta | null | undefined, offset = 0): any[] {
  const inside = (g: GroupRange, h: GroupRange) => h !== g && h.outer.start >= g.inner.start && h.outer.end <= g.inner.end;
  const build = (list: any[], gs: GroupRange[]): any[] => {
    const tops = gs.filter((g) => !gs.some((h) => inside(h, g)));
    const out: any[] = [];
    let i = 0;
    for (const g of tops) {
      while (i < list.length && startOf(list[i]) - offset < g.outer.start) out.push(list[i++]);
      const members: any[] = [];
      while (i < list.length && endOf(list[i]) - offset <= g.outer.end) members.push(list[i++]);
      const position = { start: offsetPoint(src, g.outer.start, offset), end: offsetPoint(src, g.outer.end, offset) };
      const kind = groupKind(g.id, meta);
      const body = build(members, gs.filter((h) => inside(g, h)));
      if (kind === "story" || kind === "placeholder") {
        out.push({ type: "studioStory", id: g.id, markdown: src.slice(g.inner.start, g.inner.end).replace(/\r?\n$/, ""), position });
      } else if (kind === "break") {
        const { page, ...props } = meta!.breaks![g.id];
        out.push({ type: "studioBreak", id: g.id, kind: page ? "page" : "section", props: page ? undefined : props, position });
      } else if (kind === "object") {
        out.push({ type: "studioObject", id: g.id, children: body, position, data: { hasEnd: true } });
      } else {
        const props = { ...meta?.blocks?.[g.id], id: g.id };
        for (const b of body) {
          if (b.type === "studioGroup" || b.type === "studioObject" || b.type === "studioStory" || b.type === "html") continue;
          if (b.data?.msBlock?.id) continue;
          const msBlock = { ...b.data?.msBlock, ...props };
          b.data = { ...b.data, msBlock, hProperties: { ...b.data?.hProperties, dataMsBlock: JSON.stringify(msBlock) } };
        }
        out.push({ type: "studioGroup", id: g.id, children: body, position });
      }
    }
    while (i < list.length) out.push(list[i++]);
    return out;
  };
  return groups.length ? build(children, groups) : children;
}

function offsetPoint(src: string, at: number, offset: number) {
  const before = src.slice(0, at);
  const line = before.split("\n").length;
  return { line, column: at - before.lastIndexOf("\n"), offset: at + offset };
}

/** Id of the `::: id` group holding a document story's text. */
export const storyGroupId = (kind: "headers" | "footers", variant: keyof StorySet): string => `${kind === "headers" ? "header" : "footer"}${variant === "default" ? "" : `-${variant}`}`;

/**
 * Meta as the layout reads it: document stories get their group text (`texts`, by id) and their
 * `blocks.<id>` properties, placeholders their text in `fields`. Never written back.
 */
export function withGroupTexts(meta: StudioMeta | null, texts: Record<string, string>): StudioMeta | null {
  if (!meta) return meta;
  const fill = (set: StorySet | undefined): StorySet | undefined =>
    set && (Object.fromEntries(Object.entries(set).map(([k, s]) => [k, s?.id ? ({ ...s, markdown: s.markdown ?? texts[s.id] ?? "", block: meta.blocks?.[s.id] } as StoryDef) : s])) as StorySet);
  const fields = { ...meta.fields };
  for (const k of meta.placeholders ?? []) if (texts[k] !== undefined) fields[k] = texts[k];
  return { ...meta, headers: fill(meta.headers), footers: fill(meta.footers), fields: Object.keys(fields).length ? fields : undefined };
}

/** `blocks` entries that are not block groups (stories, placeholders): kept when blocks are rebuilt from the text. */
export function nonGroupBlocks(meta: StudioMeta | null | undefined): Record<string, BlockProps> {
  return Object.fromEntries(Object.entries(meta?.blocks ?? {}).filter(([id]) => groupKind(id, meta) !== "block"));
}

/** Group fences around Markdown (a story / placeholder / block text). */
export const fenced = (id: string, markdown: string): string => `::: ${id}\n${markdown.replace(/\s+$/, "")}${markdown.trim() ? "\n" : ""}:::`;
