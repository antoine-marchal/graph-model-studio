/**
 * The `markdownStudio` frontmatter key: read, and written back as a span edit. Only the text of
 * that key changes; other keys, comments, quoting and key order of the frontmatter stay byte for
 * byte. Inside the key, values are changed through the YAML document model (`setIn` / `deleteIn`
 * per changed leaf), so comments and formatting of untouched entries survive too.
 */
import { isMap, isScalar, parseDocument, visit, type Document } from "yaml";
import { STUDIO_VERSION, type StudioMeta } from "./schema";

export const META_KEY = "markdownStudio";
const FM_RE = /^---(\r?\n)([\s\S]*?)(\r?\n)---[ \t]*(?:\r?\n|$)/;

export interface Frontmatter {
  /** Offsets of the YAML body inside the source. */
  bodyStart: number;
  bodyEnd: number;
  body: string;
  eol: string;
}

export function findFrontmatter(source: string): Frontmatter | null {
  const m = FM_RE.exec(source);
  if (!m) return null;
  const bodyStart = 3 + m[1].length;
  return { bodyStart, bodyEnd: bodyStart + m[2].length, body: m[2], eol: m[1] };
}

export interface MetaRead {
  meta: StudioMeta | null;
  diagnostics: string[];
  /** The schema version is newer than this editor: enhancements are kept but not editable. */
  readOnly: boolean;
}

export function readMeta(source: string): MetaRead {
  const fm = findFrontmatter(source);
  if (!fm) return { meta: null, diagnostics: [], readOnly: false };
  const doc = parseDocument(fm.body, { prettyErrors: false });
  if (doc.errors.length) return { meta: null, diagnostics: [`Frontmatter YAML: ${doc.errors[0].message}`], readOnly: true };
  const value = doc.toJS({ maxAliasCount: 50 })?.[META_KEY];
  if (value === undefined || value === null) return { meta: null, diagnostics: [], readOnly: false };
  if (typeof value !== "object" || Array.isArray(value)) return { meta: null, diagnostics: [`${META_KEY} must be a mapping`], readOnly: true };
  const version = Number(value.version ?? STUDIO_VERSION);
  if (!Number.isInteger(version) || version > STUDIO_VERSION) {
    return { meta: value as StudioMeta, diagnostics: [`${META_KEY} version ${value.version} is newer than this editor (${STUDIO_VERSION}): layout is shown read-only`], readOnly: true };
  }
  return { meta: { ...value, version } as StudioMeta, diagnostics: [], readOnly: false };
}

type Path = (string | number)[];

/** Leaf-level differences: objects recurse, everything else (arrays, scalars) is replaced whole. */
function diff(a: unknown, b: unknown, path: Path, out: { set: [Path, unknown][]; del: Path[] }): void {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (obj(a) && obj(b)) {
    for (const key of Object.keys(a)) if (!(key in b) || b[key] === undefined) out.del.push([...path, key]);
    for (const [key, value] of Object.entries(b)) if (value !== undefined) diff(a[key], value, [...path, key], out);
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.set.push([path, b]);
}

/** Small scalar-only maps (boxes, margins, connector ends) are written inline: `{ x: 10, y: 20 }`. */
function inlineSmallMaps(doc: Document): void {
  visit(doc, {
    Map(_key, node, path) {
      if (path.length < 4) return;
      if (node.items.length <= 6 && node.items.every((p) => isScalar(p.value))) node.flow = true;
    },
  });
}

/**
 * `source` with its `markdownStudio` key set to `meta` (null removes the key, and a frontmatter
 * left empty by it). A source without frontmatter gets one.
 */
export function writeMeta(source: string, meta: StudioMeta | null): string {
  const fm = findFrontmatter(source);
  const eol = fm?.eol ?? (source.includes("\r\n") ? "\r\n" : "\n");
  if (!fm) {
    if (!meta) return source;
    const doc = parseDocument("");
    doc.contents = doc.createNode({ [META_KEY]: meta }) as any;
    inlineSmallMaps(doc);
    return `---${eol}${toYaml(doc, eol)}---${eol}${source.startsWith("\n") || source.startsWith("\r\n") || !source ? "" : eol}${source}`;
  }
  const doc = parseDocument(fm.body);
  if (doc.errors.length) throw new Error(`Frontmatter YAML is invalid: ${doc.errors[0].message}`);
  const current = doc.toJS()?.[META_KEY];
  const oldPair = isMap(doc.contents) ? doc.contents.items.find((p) => isScalar(p.key) && p.key.value === META_KEY) : undefined;
  const oldSpan = oldPair ? pairSpan(fm.body, oldPair) : null;
  if (!meta) {
    const span = oldSpan;
    if (!span) return source;
    const body = fm.body.slice(0, span[0]) + fm.body.slice(span[1]).replace(/^\r?\n/, "");
    if (!body.trim()) {
      const after = source.slice(fm.bodyEnd).replace(/^\r?\n---[ \t]*(\r?\n)?/, "");
      return after.replace(/^\r?\n/, "");
    }
    return source.slice(0, fm.bodyStart) + body.replace(/(\r?\n)+$/, "") + source.slice(fm.bodyEnd);
  }
  const ops = { set: [] as [Path, unknown][], del: [] as Path[] };
  diff(current ?? {}, meta, [META_KEY], ops);
  if (current === undefined || current === null || typeof current !== "object") ops.set = [[[META_KEY], meta]];
  if (!ops.set.length && !ops.del.length) return source;
  for (const path of ops.del) doc.deleteIn(path);
  for (const [path, value] of ops.set) doc.setIn(path, doc.createNode(value));
  inlineSmallMaps(doc);
  // Splice only the markdownStudio entry of the re-serialized document into the original text.
  const fresh = parseDocument(toYaml(doc, "\n"));
  const freshPair = isMap(fresh.contents) ? fresh.contents.items.find((p) => isScalar(p.key) && p.key.value === META_KEY) : undefined;
  const freshText = toYaml(fresh, "\n");
  const freshSpan = freshPair && pairSpan(freshText, freshPair);
  if (!freshSpan) throw new Error(`could not write ${META_KEY}`);
  const entry = freshText.slice(freshSpan[0], freshSpan[1]).replace(/\n+$/, "").replace(/\n/g, eol);
  let body: string;
  if (oldSpan) {
    const tail = fm.body.slice(oldSpan[1]);
    body = fm.body.slice(0, oldSpan[0]) + entry + (tail && !/^\r?\n/.test(tail) ? eol : "") + tail;
  } else {
    body = fm.body.replace(/(\r?\n)+$/, "") + (fm.body.trim() ? eol : "") + entry;
  }
  return source.slice(0, fm.bodyStart) + body + source.slice(fm.bodyEnd);
}

const toYaml = (doc: Document, eol: string): string => doc.toString({ lineWidth: 0, flowCollectionPadding: true }).replace(/\n/g, eol);

/** Text span of a top-level pair: from its key to the end of its last value line (line break excluded). */
function pairSpan(text: string, pair: any): [number, number] | null {
  const start = pair.key?.range?.[0];
  const valueEnd = pair.value?.range?.[1] ?? pair.key?.range?.[1];
  if (typeof start !== "number" || typeof valueEnd !== "number") return null;
  let end = valueEnd;
  while (end > start && /\s/.test(text[end - 1])) end--;
  // Trailing comment on the last value line belongs to the entry.
  const eolAt = text.indexOf("\n", end);
  const restOfLine = text.slice(end, eolAt < 0 ? text.length : eolAt);
  if (/^\s*#/.test(restOfLine)) end += restOfLine.replace(/\r$/, "").length;
  return [start, end];
}
