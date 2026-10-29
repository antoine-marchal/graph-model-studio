/**
 * Picture size as a Pandoc attribute right after the image: `![Chart](chart.png){width=60%}`
 * (percent of the text width, or px). Plain Markdown, no comment; readers that ignore the attribute
 * show it as text.
 */

const ATTR = /^\{\s*width\s*=\s*"?(\d+(?:\.\d+)?(?:%|px)?)"?\s*\}/;

/** mdast phrasing children: an image's `{width=…}` text moves to `image.data.width` (hast `width`). */
export function attachImageWidths(children: any[]): any[] {
  if (!children.some((c) => c.type === "image")) return children;
  const out: any[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    out.push(child);
    const next = children[i + 1];
    const m = child.type === "image" && next?.type === "text" ? ATTR.exec(next.value) : null;
    if (!m) continue;
    child.data = { ...child.data, width: m[1], hProperties: { ...child.data?.hProperties, width: m[1] } };
    const rest = next.value.slice(m[0].length);
    if (rest) out.push({ ...next, value: rest });
    i++;
  }
  return out;
}

/** `width` attribute value as written after the image (`60%`, `320px` → `320px`), or "" when none / invalid. */
export function imageWidthAttr(value: unknown): string {
  const m = /^(\d+(?:\.\d+)?)(%|px)?$/.exec(String(value ?? "").trim());
  return m ? `${m[1]}${m[2] ?? "px"}` : "";
}

/** Width in the unit of `full` (pt or px) for a `width` value; undefined when none. */
export function resolveImageWidth(value: unknown, full: number, pxToUnit = (px: number) => px): number | undefined {
  const w = imageWidthAttr(value);
  if (!w) return undefined;
  const n = parseFloat(w);
  return w.endsWith("%") ? (full * n) / 100 : Math.min(full, pxToUnit(n));
}
