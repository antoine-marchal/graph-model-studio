import { groupSpans, groupStudioChildren, sanitizeSpanStyle, studioRemarkRehypeHandlers } from "../document/remarkStudio";
import { commentJson } from "../document/markers";
import { fenced, groupMeta, maskGroups, wrapGroups } from "../document/groups";
import { attachImageWidths, imageWidthAttr } from "../document/imageSize";

/**
 * Shared conversion utilities used by both the production pipeline
 * (useVSCodeSync.ts, DOMParser-based) and the test pipeline
 * (test/pipeline.ts, regex-based).
 */

/** Custom remark-rehype handlers that convert remark-math AST nodes to HTML. */
export const mathHandlers = {
  inlineMath(_state: any, node: any) {
    return {
      type: "element",
      tagName: "span",
      properties: { dataType: "mathInline", dataLatex: node.value },
      children: [{ type: "text", value: node.value }],
    };
  },
  math(_state: any, node: any) {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "mathBlock", dataLatex: node.value },
      children: [{ type: "text", value: node.value }],
    };
  },
};

/**
 * Fenced-code info strings carry more than a language (```gmc id=x view=y).
 * remark-rehype drops everything after the language, so keep it on the
 * <code> as data-meta. On the way back the meta rides inside the language
 * class (`language-<lang>BTRMKMETA<uri-encoded meta>`) because rehype-remark
 * only reads the class; restoreFenceMeta turns it back into ```lang meta.
 */
export const META_PH = "BTRMKMETA";

export function encodeFenceMeta(lang: string, meta: string): string {
  return `${lang}${META_PH}${encodeURIComponent(meta)}`;
}

export function restoreFenceMeta(md: string): string {
  return md.replace(
    new RegExp(`^(\\s*(?:\`{3,}|~{3,}))([^\\s\`]*?)${META_PH}(\\S*)$`, "gm"),
    (_m, fence, lang, meta) => `${fence}${lang} ${decodeURIComponent(meta)}`
  );
}

/**
 * Block-level raw HTML (`<!-- embed:file="…" -->` directives, `<details>`,
 * …) would otherwise be dropped by remark-rehype. It rides through the
 * editor as a code block in this pseudo-language (RawHtmlBlock node) and
 * restoreRawHtml turns the fence back into the original HTML.
 */
export const RAW_HTML_LANG = "btrmk-raw-html";

export function restoreRawHtml(md: string): string {
  return md.replace(
    new RegExp(`^([ \\t]*)(\`{3,}|~{3,})${RAW_HTML_LANG}\\n([\\s\\S]*?)\\n\\1\\2[ \\t]*$`, "gm"),
    (_m, indent, _fence, body) => (body.startsWith(indent) ? body : indent + body)
  );
}

/**
 * Toolkit directives (`<!-- embed:file="…" -->` … `<!-- embed:end -->`,
 * `<!-- link:… -->` … `<!-- link:end -->`, `<!-- embed:toc -->` …
 * `<!-- embed:toc:end -->`) are grouped with their generated content into
 * one `directiveGroup` mdast node → `<div data-type="directive">` →
 * DirectiveBlock in the editor. rehypeUnwrapDirectives turns the div back
 * into raw-HTML opener + content + closer before rehype-remark.
 * Pairing follows the toolkit: plain `end` closes the innermost opener,
 * `<key>:end` closes the innermost `<key>` opener (toc).
 */
const DIRECTIVE_RE = /^<!--\s*(?:embed|link):(\S+?)(?:\s[\s\S]*)?-->$/i;

/**
 * `<div align="center">` + blank line + blocks + blank line + `</div>` (what
 * GitHub renders as aligned blocks) is grouped the same way into an
 * `alignGroup` → `<div data-type="align">` → AlignBlock. Other standalone
 * `<div …>` / `</div>` lines take part in pairing so they don't steal an
 * align block's `</div>`, but stay raw HTML.
 */
const ALIGN_DIV_RE = /^<div\s+align=["']?(left|center|right)["']?\s*>$/i;

/**
 * Multi-column layout: `<div class="ms-columns">` holding one
 * `<div class="ms-column">` per column, each tag on its own line with blank
 * lines around it → `columnsGroup` / `columnGroup` → Columns / Column nodes.
 * The inline flex styles make other renderers (VS Code preview, export
 * fallback) show columns too; GitHub strips them and stacks the columns.
 */
export const COLUMNS_OPEN = '<div class="ms-columns" style="display:flex;gap:24px">';
export const COLUMN_OPEN = '<div class="ms-column" style="flex:1;min-width:0">';
/** Column opener with a relative width (flex-grow; 1 = equal share). */
export const columnOpen = (flex = 1) => COLUMN_OPEN.replace("flex:1", `flex:${flex}`);
const COLUMNS_DIV_RE = /^<div\s+class=["']ms-(columns|column)["']/i;
const COLUMN_FLEX_RE = /\bflex:\s*([\d.]+)/i;

function directiveToken(node: any): { close: boolean; key: string; align?: string; layout?: string; flex?: number } | null {
  if (node.type !== "html") return null;
  const value = String(node.value).trim();
  if (/^<\/div\s*>$/i.test(value)) return { close: true, key: "div" };
  if (/^<div(?:\s[^>]*)?>$/i.test(value)) {
    return {
      close: false,
      key: "div",
      align: ALIGN_DIV_RE.exec(value)?.[1].toLowerCase(),
      layout: COLUMNS_DIV_RE.exec(value)?.[1].toLowerCase(),
      flex: Number(COLUMN_FLEX_RE.exec(value)?.[1]) || undefined,
    };
  }
  const m = DIRECTIVE_RE.exec(value);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (raw === "end") return { close: true, key: "" };
  if (raw.endsWith(":end")) return { close: true, key: raw.slice(0, -4) };
  return { close: false, key: raw === "toc" ? "toc" : "" };
}

function groupDirectiveChildren(children: any[]): any[] {
  // Pair openers with closers by index first so an unfilled opener doesn't
  // swallow the rest of the document.
  const closeOf = new Map<number, number>();
  const stack: { i: number; key: string }[] = [];
  children.forEach((child, i) => {
    const t = directiveToken(child);
    if (!t) return;
    if (!t.close) return void stack.push({ i, key: t.key });
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].key === t.key) {
        closeOf.set(stack[s].i, i);
        stack.length = s;
        break;
      }
    }
  });
  const build = (from: number, to: number): any[] => {
    const out: any[] = [];
    for (let i = from; i < to; i++) {
      const child = children[i];
      const t = directiveToken(child);
      if (!t || t.close) {
        out.push(child);
        continue;
      }
      const end = closeOf.get(i);
      const last = end !== undefined ? children[end] : child;
      const position = child.position && last.position
        ? { start: child.position.start, end: last.position.end }
        : undefined;
      if (t.key === "div") {
        if (t.layout && end !== undefined) {
          out.push(t.layout === "columns"
            ? { type: "columnsGroup", children: build(i + 1, end), position }
            : { type: "columnGroup", flex: t.flex, children: build(i + 1, end), position });
          i = end;
          continue;
        }
        if (!t.align || end === undefined) {
          out.push(child);
          continue;
        }
        out.push({ type: "alignGroup", align: t.align, children: build(i + 1, end), position });
        i = end;
        continue;
      }
      out.push({
        type: "directiveGroup",
        open: String(child.value).trim(),
        close: end !== undefined ? String(last.value).trim() : "",
        children: end !== undefined ? build(i + 1, end) : [],
        position: child.position && last.position
          ? { start: child.position.start, end: last.position.end }
          : undefined,
      });
      if (end !== undefined) i = end;
    }
    return out;
  };
  return build(0, children.length);
}

export type DirectiveKind = "embed" | "link" | "toc";

export function parseDirective(open: string): { kind: DirectiveKind; attrs: Record<string, string> } {
  const m = /<!--\s*(embed|link):(\S+?)(\s[\s\S]*?)?\s*-->/i.exec(open);
  const attrs: Record<string, string> = {};
  if (!m) return { kind: "embed", attrs };
  for (const a of `${m[2]}${m[3] ?? ""}`.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[a[1]] = a[2] ?? a[3];
  }
  const kind: DirectiveKind = m[2].toLowerCase() === "toc" ? "toc" : (m[1].toLowerCase() as DirectiveKind);
  return { kind, attrs };
}

/** Names of the `view <name> {` blocks of a GMC model, in order. */
export function gmcViewNames(source: string): string[] {
  return [...new Set([...source.matchAll(/^\s*view\s+([\w.-]+)\s*(?:"[^"]*"\s*)?\{/gm)].map((m) => m[1]))];
}

/** Set (or with `null`/"", remove) one `key=value` fence option in a meta string. */
export function setFenceOption(meta: string, key: string, value: string | null): string {
  const re = new RegExp(`(^|\\s)${key}=("[^"]*"|'[^']*'|\\S+)`);
  const rest = meta.replace(re, "").replace(/\s+/g, " ").trim();
  if (!value) return rest;
  const pair = `${key}=${/\s/.test(value) ? `"${value}"` : value}`;
  return rest ? `${rest} ${pair}` : pair;
}

/** `<!-- embed:file="./x.gmc" view="v" theme="t" -->` (empty options left out). */
export function gmcEmbedDirective(file: string, view?: string, theme?: string): string {
  let open = `<!-- embed:file="${file.replace(/"/g, "%22")}" -->`;
  if (view) open = setDirectiveAttr(open, "view", view);
  if (theme) open = setDirectiveAttr(open, "theme", theme);
  return open;
}

/** Set (or with `null`, remove) one attribute on the opener comment. */
export function setDirectiveAttr(open: string, name: string, value: string | null): string {
  const re = new RegExp(`\\s*${name}=(?:"[^"]*"|'[^']*')`);
  const stripped = open.replace(re, "");
  if (value === null) return stripped;
  const pair = `${name}="${value.replace(/"/g, "%22")}"`;
  // `embed:file="…"` — the primary key sits right after the colon.
  if (name === "file" && /<!--\s*(?:embed|link):file=/.test(open)) {
    return open.replace(/(<!--\s*(?:embed|link):)file=(?:"[^"]*"|'[^']*')/, `$1${pair}`);
  }
  return stripped.replace(/\s*-->$/, ` ${pair} -->`);
}

/**
 * Inline `<mark data-color="…">` … `</mark>` (highlights) arrive as sibling
 * inline-html nodes, which remark-rehype drops; pair them into a
 * `highlight` node → `<mark>`. rehypeRemarkHandlers.mark writes them back.
 */
const MARK_OPEN_RE = /^<mark(?:\s+data-color=["']?([a-z]+)["']?)?\s*>$/i;

function groupMarks(children: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const open = child.type === "html" ? MARK_OPEN_RE.exec(String(child.value).trim()) : null;
    const end = open
      ? children.findIndex((c, j) => j > i && c.type === "html" && /^<\/mark\s*>$/i.test(String(c.value).trim()))
      : -1;
    if (!open || end < 0) {
      out.push(child);
      continue;
    }
    out.push({ type: "highlight", color: (open[1] || "yellow").toLowerCase(), children: groupMarks(children.slice(i + 1, end)) });
    i = end;
  }
  return out;
}

/**
 * Legacy table geometry comment `<!-- ms-table:cols=120,,80;rows=,40 -->`: read, never written (a
 * `.paper` keeps column widths / row heights in its group's `blocks.<id>.cols` / `rows`).
 */
export function parseTableLayout(value: string): { cols: (number | null)[]; rows: (number | null)[] } | null {
  const m = /^<!--\s*ms-table:(\S+)\s*-->$/.exec(value.trim());
  if (!m) return null;
  const out = { cols: [] as (number | null)[], rows: [] as (number | null)[] };
  for (const part of m[1].split(";")) {
    const [key, list = ""] = part.split("=");
    if (key === "cols" || key === "rows") out[key] = list.split(",").map((v) => Number(v) || null);
  }
  return out;
}

/** Table geometry (group props `cols` / `rows`, or a legacy comment, dropped) → its rows / cells. */
function attachTableLayouts(children: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const next = children[i + 1];
    const legacy = child.type === "table" && next?.type === "html" ? parseTableLayout(String(next.value)) : null;
    const props = child.type === "table" ? child.data?.msBlock : null;
    const layout = legacy ?? (props?.cols || props?.rows ? { cols: props.cols ?? [], rows: props.rows ?? [] } : null);
    out.push(child);
    if (!layout) continue;
    // The comment belongs to the table's source span (block splitting).
    if (legacy && child.position && next.position) child.position = { start: child.position.start, end: next.position.end };
    child.children.forEach((row: any, r: number) => {
      if (layout.rows[r]) row.data = { ...row.data, hProperties: { ...row.data?.hProperties, dataHeight: String(layout.rows[r]) } };
      row.children.forEach((cell: any, c: number) => {
        if (layout.cols[c]) cell.data = { ...cell.data, hProperties: { ...cell.data?.hProperties, colwidth: String(layout.cols[c]) } };
      });
    });
    if (legacy) i++;
  }
  return out;
}

export function remarkGroupDirectives(this: any) {
  // `::: id` fences are blanked before remark tokenizes the body (offsets unchanged), then the
  // blocks between them are grouped by source range (document/groups.ts).
  const parse = this?.parser;
  if (parse) {
    this.parser = (doc: string, file: any) => {
      const { masked, groups } = maskGroups(String(doc));
      const tree = parse(masked, file);
      tree.data = { ...tree.data, msGroups: groups, msSource: String(doc) };
      return tree;
    };
  }
  const walk = (node: any) => {
    if (!Array.isArray(node.children)) return;
    node.children.forEach(walk);
    node.children = PHRASING_PARENTS.has(node.type)
      ? groupSpans(groupMarks(attachImageWidths(node.children)))
      : groupStudioChildren(groupDirectiveChildren(attachTableLayouts(node.children)));
  };
  return (tree: any) => {
    if (tree.data?.msGroups?.length) tree.children = wrapGroups(tree.children, tree.data.msGroups, tree.data.msSource, groupMeta());
    walk(tree);
  };
}

/** Id of the `::: id` group a hast block belongs to (an empty paragraph belongs to none). */
function blockGroupId(child: any): string | undefined {
  if (child.type !== "element" || !child.properties?.dataMsBlock) return undefined;
  if (child.tagName === "p" && !child.children.some((c: any) => c.type !== "text" || /\S/.test(c.value))) return undefined;
  try {
    const id = JSON.parse(String(child.properties.dataMsBlock))?.id;
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

const rawHtmlPre = (value: string) => ({
  type: "element",
  tagName: "pre",
  properties: {},
  children: [{
    type: "element",
    tagName: "code",
    properties: { className: ["language-" + RAW_HTML_LANG] },
    children: [{ type: "text", value }],
  }],
});

export function rehypeUnwrapDirectives() {
  const walk = (node: any) => {
    if (!Array.isArray(node.children)) return;
    // Consecutive blocks of one `::: id` group share its fences.
    const groupIds: (string | undefined)[] = node.children.map(blockGroupId);
    node.children = node.children.flatMap((child: any, idx: number) => {
      walk(child);
      if (child.type === "element" && (child.properties?.dataType === "columns" || child.properties?.dataType === "column")) {
        const open = child.properties.dataType === "columns"
          ? COLUMNS_OPEN
          : columnOpen(Number(child.properties.dataFlex) || 1);
        return [rawHtmlPre(open), ...child.children, rawHtmlPre("</div>")];
      }
      if (child.type === "element" && child.properties?.dataType === "align") {
        return [rawHtmlPre(`<div align="${child.properties.dataAlign}">`), ...child.children, rawHtmlPre("</div>")];
      }
      if (child.type === "element" && child.properties?.dataType === "msObject") {
        const id = String(child.properties.dataId);
        const body = child.children.filter((c: any) => c.type === "element");
        return body.length ? [rawHtmlPre(`::: ${id}`), ...child.children, rawHtmlPre(":::")] : [rawHtmlPre(fenced(id, ""))];
      }
      if (child.type === "element" && child.properties?.dataType === "msStory") {
        return [rawHtmlPre(fenced(String(child.properties.dataId), String(child.properties.dataMarkdown ?? "")))];
      }
      // A break with an id is an empty `::: id` group (its kind and properties: `breaks.<id>`).
      if (child.type === "element" && (child.properties?.dataType === "msPageBreak" || child.properties?.dataType === "msSection") && child.properties.dataId) {
        return [rawHtmlPre(fenced(String(child.properties.dataId), ""))];
      }
      if (child.type === "element" && child.properties?.dataType === "msPageBreak") return [rawHtmlPre("<!-- ms:pagebreak -->")];
      if (child.type === "element" && child.properties?.dataType === "msSection") {
        let props: object = {};
        try {
          props = JSON.parse(String(child.properties.dataProps ?? "{}"));
        } catch {
          // Unreadable props: an empty section marker still starts the section.
        }
        return [rawHtmlPre(`<!-- ms:section ${commentJson(props)} -->`)];
      }
      if (child.type === "element" && child.properties?.dataMsBlock) {
        delete child.properties.dataMsBlock;
        const id = groupIds[idx];
        if (!id) return [child];
        // Properties live in the frontmatter (`blocks.<id>`); the body only has the group.
        return [...(groupIds[idx - 1] === id ? [] : [rawHtmlPre(`::: ${id}`)]), child, ...(groupIds[idx + 1] === id ? [] : [rawHtmlPre(":::")])];
      }
      if (child.type !== "element" || child.properties?.dataType !== "directive") return [child];
      const open = String(child.properties.dataOpen ?? "");
      const close = String(child.properties.dataClose ?? "");
      return [
        ...(open ? [rawHtmlPre(open)] : []),
        ...child.children,
        ...(close ? [rawHtmlPre(close)] : []),
      ];
    });
  };
  return (tree: any) => walk(tree);
}

const PHRASING_PARENTS = new Set([
  "paragraph", "heading", "tableCell", "emphasis", "strong", "delete", "link", "linkReference",
]);

/** mathHandlers plus `code` (keeps fence meta) and block `html` handlers. */
export const remarkRehypeHandlers: Record<string, (state: any, node: any, parent?: any) => any> = {
  ...mathHandlers,
  ...studioRemarkRehypeHandlers,
  highlight(state: any, node: any): any {
    return {
      type: "element",
      tagName: "mark",
      properties: node.color === "yellow" ? {} : { dataColor: node.color },
      children: state.all(node),
    };
  },
  alignGroup(state: any, node: any): any {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "align", dataAlign: node.align },
      children: state.wrap(state.all(node), true),
    };
  },
  columnsGroup(state: any, node: any): any {
    return { type: "element", tagName: "div", properties: { dataType: "columns" }, children: state.wrap(state.all(node), true) };
  },
  columnGroup(state: any, node: any): any {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "column", ...(node.flex && node.flex !== 1 ? { dataFlex: String(node.flex) } : {}) },
      children: state.wrap(state.all(node), true),
    };
  },
  directiveGroup(state: any, node: any): any {
    return {
      type: "element",
      tagName: "div",
      properties: { dataType: "directive", dataOpen: node.open, dataClose: node.close },
      children: state.wrap(state.all(node), true),
    };
  },
  html(_state: any, node: any, parent?: any): any {
    // Inline HTML keeps remark-rehype's default (dropped) behaviour.
    if (parent && PHRASING_PARENTS.has(parent.type)) return undefined;
    return {
      type: "element",
      tagName: "pre",
      properties: {},
      children: [{
        type: "element",
        tagName: "code",
        properties: { className: ["language-" + RAW_HTML_LANG] },
        children: [{ type: "text", value: node.value }],
      }],
    };
  },
  code(state: any, node: any): any {
    const lang = node.lang ? String(node.lang).split(/\s+/) : [];
    const properties: Record<string, unknown> = {};
    if (lang.length > 0) properties.className = ["language-" + lang[0]];
    if (node.meta) properties.dataMeta = node.meta;
    let code: any = {
      type: "element",
      tagName: "code",
      properties,
      children: [{ type: "text", value: node.value ? node.value + "\n" : "" }],
    };
    state.patch(node, code);
    code = state.applyData(node, code);
    const pre = { type: "element", tagName: "pre", properties: {}, children: [code] };
    state.patch(node, pre);
    return pre;
  },
};

/** rehype-remark handlers: `<mark>` → inline HTML around its markdown children. */
export const rehypeRemarkHandlers: Record<string, (state: any, node: any) => any> = {
  /** Styled spans (font, size, colors, character style) stay inline HTML; plain spans unwrap. */
  span(state: any, node: any): any {
    const style = sanitizeSpanStyle(String(node.properties?.style ?? ""));
    const msStyle = String(node.properties?.dataMsStyle ?? "").replace(/[^\w -]/g, "");
    const children = state.all(node);
    if (!style && !msStyle) return children;
    const attrs = `${msStyle ? ` data-ms-style="${msStyle}"` : ""}${style ? ` style="${style}"` : ""}`;
    return [{ type: "html", value: `<span${attrs}>` }, ...children, { type: "html", value: "</span>" }];
  },
  /** A resized picture keeps its width as a Pandoc attribute: `![alt](src){width=60%}`. */
  img(state: any, node: any): any {
    const p = node.properties ?? {};
    const image = { type: "image", url: state.resolve(String(p.src || "") || null), title: p.title ? String(p.title) : null, alt: p.alt ? String(p.alt) : "" };
    state.patch(node, image);
    const width = imageWidthAttr(p.width);
    return width ? [image, { type: "text", value: `{width=${width}}` }] : image;
  },
  mark(state: any, node: any): any {
    const color = node.properties?.dataColor;
    const open = color && color !== "yellow" ? `<mark data-color="${String(color).replace(/[^a-z]/gi, "")}">` : "<mark>";
    return [{ type: "html", value: open }, ...state.all(node), { type: "html", value: "</mark>" }];
  },
};

// Placeholder for | inside code spans in table rows.
// Remark's GFM table parser splits on | even inside backtick code,
// corrupting cells like `||value||`. We replace before parse, restore after.
export const PIPE_PH = "%%BTRMK_PIPE%%";

// Placeholder for currency $ signs (e.g. $14B, $1.4B).
// remarkMath pairs unrelated currency $s as inline math delimiters,
// eating bold markers and other formatting in between.
export const DOLLAR_PH = "%%BTRMK_DOLLAR%%";

/**
 * Protect currency $ signs from being parsed as math delimiters.
 * remarkMath pairs unrelated $14B ... $1.4B as inline math, eating
 * everything in between (including bold markers). Replace $ followed
 * by a digit with a placeholder before parsing; restore after HTML.
 *
 * Inline math whose content starts with a digit (e.g. `$24 \times 5 = 120$`)
 * looks identical to a currency `$` at the opening boundary. We disambiguate
 * by inspecting the closing `$` on the same line: if the `$...$` content
 * contains LaTeX-like syntax (a `\command`, sub/superscript, or operator with
 * a letter operand), we treat it as math and leave both `$`s alone. Otherwise
 * we treat the `$` as currency and protect it.
 */
export function protectCurrencyDollars(md: string): string {
  return md.split("\n").map(protectCurrencyInLine).join("\n");
}

function protectCurrencyInLine(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (
      line[i] === "$" &&
      line[i - 1] !== "$" &&
      line[i + 1] !== "$" &&
      /\d/.test(line[i + 1] || "")
    ) {
      const close = findClosingDollar(line, i + 1);
      if (close !== -1 && looksLikeMath(line.slice(i + 1, close))) {
        // Preserve the entire $...$ math span untouched
        out += line.slice(i, close + 1);
        i = close + 1;
        continue;
      }
      out += DOLLAR_PH;
      i++;
      continue;
    }
    out += line[i];
    i++;
  }
  return out;
}

function findClosingDollar(line: string, from: number): number {
  for (let j = from; j < line.length; j++) {
    if (line[j] === "$" && line[j - 1] !== "\\" && line[j + 1] !== "$") {
      return j;
    }
  }
  return -1;
}

function looksLikeMath(content: string): boolean {
  // Markdown bold/italic markers inside the span are a strong signal that the
  // surrounding `$`s are currency adjacent to formatted text, not a math pair.
  if (/\*\*|__/.test(content)) return false;
  // LaTeX command (\times, \frac, \alpha, ...)
  if (/\\[a-zA-Z]/.test(content)) return true;
  // Sub/superscript
  if (/[\^_]/.test(content)) return true;
  // Equation form: ` = ` (spaces around =) — common in math, rare in currency
  if (/\s=\s/.test(content)) return true;
  // Operator (excluding `*`, which is also markdown's bold marker) with a
  // letter operand on either side (e.g. `2x + 3 = y`).
  if (/[a-zA-Z]\s*[+\-/=]\s*\S/.test(content)) return true;
  if (/\S\s*[+\-/=]\s*[a-zA-Z]/.test(content)) return true;
  return false;
}

/**
 * In table rows, replace | inside backtick code spans with a placeholder.
 * Remark's GFM table parser splits on | even inside code spans,
 * corrupting cells like `||value||`.
 */
export function protectTableCodePipes(md: string): string {
  const lines = md.split("\n");
  let inTable = false;

  return lines.map((line) => {
    // Detect table rows (start with |)
    if (/^\|/.test(line.trim())) {
      inTable = true;
    } else if (inTable && line.trim() !== "") {
      inTable = false;
    }

    if (!inTable) return line;

    // Replace | inside backtick code spans with placeholder
    let result = "";
    let inCode = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "`") {
        inCode = !inCode;
        result += "`";
      } else if (inCode && line[i] === "\\" && line[i + 1] === "|") {
        // Consume the `\` alongside `|` — otherwise the backslash survives
        // into the HTML and rehype-remark emits it verbatim, which combines
        // with remark-gfm's own \| escape to produce \\| on round-trips.
        result += PIPE_PH;
        i++;
      } else if (line[i] === "|" && inCode) {
        result += PIPE_PH;
      } else {
        result += line[i];
      }
    }
    return result;
  }).join("\n");
}
