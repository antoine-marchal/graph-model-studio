/**
 * Source markers (grammar v1). Each marker is one HTML comment on its own line — invisible in
 * every Markdown renderer, so plain readers see the linear content once:
 *
 *   <!-- ms:block {"id":"intro","style":"Lead"} -->     properties of the next block only
 *   <!-- ms:object {"id":"fig1"} -->                     a positioned object; its body (image,
 *   …body blocks…                                       text box paragraphs) follows, up to
 *   <!-- ms:endobject -->                                the end marker. No end marker (the next
 *                                                        marker is not `endobject`) = no body.
 *   <!-- ms:pagebreak -->                                explicit page break
 *   <!-- ms:section {"orientation":"landscape"} -->      starts a new section
 *
 * The payload is one JSON object. `--` (which would end the comment) is written `--`
 * inside it. A marker that fails to parse is kept verbatim (raw HTML) and reported.
 */
import { isValidId, type BlockProps, type SectionProps } from "./schema";

export type MarkerKind = "block" | "object" | "endobject" | "pagebreak" | "section";

export type Marker =
  | { kind: "block"; props: BlockProps }
  | { kind: "object"; id: string }
  | { kind: "endobject" }
  | { kind: "pagebreak" }
  | { kind: "section"; props: SectionProps };

const MARKER_RE = /^<!--\s*ms:(block|object|endobject|pagebreak|section)(?:\s+([\s\S]*?))?\s*-->$/;
/** Any `ms:` comment, recognised or not (unknown kinds are preserved and reported). */
export const isStudioComment = (html: string): boolean => /^<!--\s*ms:/.test(html.trim());

export type MarkerResult = { marker: Marker } | { error: string };

export function parseMarker(html: string): MarkerResult | null {
  const value = html.trim();
  if (!isStudioComment(value)) return null;
  const m = MARKER_RE.exec(value);
  if (!m) return { error: `Unknown Markdown Studio marker: ${value.slice(0, 60)}` };
  const kind = m[1] as MarkerKind;
  let payload: Record<string, unknown> = {};
  if (m[2]) {
    try {
      const parsed = JSON.parse(m[2]);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: `ms:${kind} payload must be a JSON object` };
      payload = parsed;
    } catch (err) {
      return { error: `ms:${kind}: invalid JSON (${err instanceof Error ? err.message : String(err)})` };
    }
  }
  switch (kind) {
    case "block":
      if (payload.id !== undefined && !isValidId(payload.id)) return { error: `ms:block: invalid id ${JSON.stringify(payload.id)}` };
      return { marker: { kind, props: payload as BlockProps } };
    case "object":
      if (!isValidId(payload.id)) return { error: `ms:object: missing or invalid id` };
      return { marker: { kind, id: payload.id } };
    case "section":
      return { marker: { kind, props: payload as SectionProps } };
    default:
      return { marker: { kind } as Marker };
  }
}

/** JSON safe inside an HTML comment, keys in a stable order. */
export function commentJson(value: object): string {
  return JSON.stringify(value).replace(/--/g, "\\u002d\\u002d").replace(/>/g, "\\u003e");
}

export function formatMarker(marker: Marker): string {
  switch (marker.kind) {
    case "block": {
      const props = compact(marker.props);
      return Object.keys(props).length ? `<!-- ms:block ${commentJson(props)} -->` : "";
    }
    case "object":
      return `<!-- ms:object ${commentJson({ id: marker.id })} -->`;
    case "section":
      return `<!-- ms:section ${commentJson(compact(marker.props))} -->`;
    default:
      return `<!-- ms:${marker.kind} -->`;
  }
}

/** Drop undefined / null entries (markers never carry defaults). */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;
}

/** Ids already taken → a fresh id from `base` (`fig`, `fig-2`, …). */
export function uniqueId(base: string, taken: Set<string>): string {
  const clean = (base.replace(/[^\w-]+/g, "-").replace(/^[^A-Za-z]+/, "") || "obj").slice(0, 48);
  if (!taken.has(clean)) return clean;
  for (let i = 2; ; i++) if (!taken.has(`${clean}-${i}`)) return `${clean}-${i}`;
}
