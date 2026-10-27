/**
 * mdast grouping of Markdown Studio markers (markers.ts) and styled inline spans. Runs inside
 * remarkGroupDirectives, so the editor, the line-number gutter and the DOCX compiler see the same
 * top-level blocks:
 *
 *   ms:block            → `data.msBlock` on the next block, whose position starts at the marker
 *   ms:object … end     → `studioObject` { id, children: body }
 *   ms:pagebreak        → `studioBreak` { kind: "page" }
 *   ms:section          → `studioBreak` { kind: "section", props }
 *   <span style|data-ms-style> … </span> → `styledSpan` { style, msStyle }
 *
 * A marker that fails to parse stays an `html` node (shown and saved verbatim) with
 * `data.msError` set.
 */
import { isStudioComment, parseMarker } from "./markers";

const startOf = (n: any) => n.position?.start;
const endOf = (n: any) => n.position?.end;
const span = (a: any, b: any) => (startOf(a) && endOf(b) ? { start: startOf(a), end: endOf(b) } : undefined);

function markerOf(node: any) {
  if (node?.type !== "html" || !isStudioComment(String(node.value))) return null;
  const result = parseMarker(String(node.value));
  if (result && "error" in result) {
    node.data = { ...node.data, msError: result.error };
    return null;
  }
  return result?.marker ?? null;
}

export function groupStudioChildren(children: any[]): any[] {
  const out: any[] = [];
  let stacked: { props: Record<string, unknown>; start: unknown } | undefined;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const marker = markerOf(child);
    if (!marker) {
      out.push(child);
      continue;
    }
    if (marker.kind === "block") {
      const next = children[i + 1];
      // Stacked markers (left by empty blocks) all apply to the block after the last one.
      if (markerOf(next)?.kind === "block") {
        stacked = { props: { ...stacked?.props, ...marker.props }, start: stacked?.start ?? startOf(child) };
        continue;
      }
      if (!next || markerOf(next) || next.type === "html") {
        // A marker with no block to style (left by older versions) styles nothing: dropped, so the
        // next save removes it from the source.
        stacked = undefined;
        continue;
      }
      const msBlock = { ...next.data?.msBlock, ...stacked?.props, ...marker.props };
      next.data = { ...next.data, msBlock, hProperties: { ...next.data?.hProperties, dataMsBlock: JSON.stringify(msBlock) } };
      const start = stacked?.start ?? startOf(child);
      if (start && next.position) next.position = { ...next.position, start };
      stacked = undefined;
      continue;
    }
    if (marker.kind === "object") {
      let end = -1;
      for (let j = i + 1; j < children.length; j++) {
        const m = markerOf(children[j]);
        if (!m) continue;
        if (m.kind === "endobject") end = j;
        break;
      }
      const body = end > 0 ? groupStudioChildren(children.slice(i + 1, end)) : [];
      const last = end > 0 ? children[end] : child;
      out.push({ type: "studioObject", id: marker.id, children: body, position: span(child, last), data: { hasEnd: end > 0 } });
      if (end > 0) i = end;
      continue;
    }
    if (marker.kind === "endobject") {
      child.data = { ...child.data, msError: "ms:endobject without an opening ms:object" };
      out.push(child);
      continue;
    }
    out.push({ type: "studioBreak", kind: marker.kind === "pagebreak" ? "page" : "section", props: marker.kind === "section" ? marker.props : undefined, position: child.position });
  }
  return out;
}

const SPAN_OPEN_RE = /^<span\b([^>]*)>$/i;
const STYLE_ATTR_RE = /\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/i;
const MS_STYLE_RE = /\bdata-ms-style\s*=\s*"([^"]*)"/i;
/** Inline CSS properties a styled span may carry (anything else is dropped). */
export const SPAN_PROPERTIES = ["color", "background-color", "font-size", "font-family"] as const;

export function sanitizeSpanStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(";")) {
    const [prop, ...rest] = decl.split(":");
    const name = prop?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!name || !value || !(SPAN_PROPERTIES as readonly string[]).includes(name)) continue;
    if (/[<>"\\]|url\(|expression\(/i.test(value)) continue;
    out.push(`${name}:${value}`);
  }
  return out.join(";");
}

/** Pair `<span style=…>` / `</span>` inline-html siblings into `styledSpan` nodes. */
export function groupSpans(children: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const open = child.type === "html" ? SPAN_OPEN_RE.exec(String(child.value).trim()) : null;
    if (!open) {
      out.push(child);
      continue;
    }
    // Matching close, counting nested spans.
    let depth = 0;
    let end = -1;
    for (let j = i + 1; j < children.length; j++) {
      const c = children[j];
      if (c.type !== "html") continue;
      const v = String(c.value).trim();
      if (SPAN_OPEN_RE.test(v)) depth++;
      else if (/^<\/span\s*>$/i.test(v)) {
        if (depth === 0) {
          end = j;
          break;
        }
        depth--;
      }
    }
    const attrs = open[1];
    const styleMatch = STYLE_ATTR_RE.exec(attrs);
    const style = sanitizeSpanStyle(styleMatch?.[1] ?? styleMatch?.[2] ?? "");
    const msStyle = MS_STYLE_RE.exec(attrs)?.[1];
    if (end < 0 || (!style && !msStyle)) {
      out.push(child);
      continue;
    }
    out.push({ type: "styledSpan", style, msStyle, children: groupSpans(children.slice(i + 1, end)) });
    i = end;
  }
  return out;
}

/** remark-rehype handlers for the nodes above. */
export const studioRemarkRehypeHandlers: Record<string, (state: any, node: any) => any> = {
  studioObject(state: any, node: any) {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "msObject", dataId: node.id },
      children: state.wrap(state.all(node), true),
    };
  },
  /** `::: id` block group: its blocks (they carry the group in `data-ms-block`), all with the group's source stamp. */
  studioGroup(state: any, node: any) {
    const out = state.all(node);
    if (node.data?.msBlk !== undefined) for (const el of out) if (el.type === "element") el.properties = { ...el.properties, dataMsBlk: String(node.data.msBlk) };
    return out;
  },
  /** Header / footer / placeholder text: kept as Markdown, outside the text flow. */
  studioStory(_state: any, node: any) {
    return { type: "element", tagName: "div", properties: { dataType: "msStory", dataId: node.id, dataMarkdown: node.markdown }, children: [] };
  },
  studioBreak(_state: any, node: any) {
    const id = node.id ? { dataId: node.id } : {};
    return node.kind === "page"
      ? { type: "element", tagName: "div", properties: { dataType: "msPageBreak", ...id }, children: [] }
      : { type: "element", tagName: "div", properties: { dataType: "msSection", dataProps: JSON.stringify(node.props ?? {}), ...id }, children: [] };
  },
  styledSpan(state: any, node: any) {
    return {
      type: "element",
      tagName: "span",
      properties: { ...(node.style ? { style: node.style } : {}), ...(node.msStyle ? { dataMsStyle: node.msStyle } : {}) },
      children: state.all(node),
    };
  },
};
