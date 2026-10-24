import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";

import { buildMarkdownConfig, normalizeMarkdown } from "../markdown.config";
import { DEFAULT_SETTINGS, type BetterMarkdownSettings } from "../settings";
import {
  remarkRehypeHandlers,
  encodeFenceMeta,
  restoreFenceMeta,
  restoreRawHtml,
  remarkGroupDirectives,
  rehypeUnwrapDirectives,
  rehypeRemarkHandlers,
  PIPE_PH,
  DOLLAR_PH,
  protectCurrencyDollars,
  protectTableCodePipes,
} from "../conversion-utils";
import { isGitHubUrl } from "../extensions/GitHubEmbed";
import { isDeckHref } from "../extensions/DeckBlock";

/**
 * Render markdown to plain HTML suitable for display (NOT for Tiptap
 * ingestion). Keeps native GFM output: real `<input type="checkbox">`
 * elements, `contains-task-list` class on <ul>, etc. Used by the rich
 * diff view where we render directly to the DOM without Tiptap.
 */
export async function markdownToDisplayHtml(md: string): Promise<string> {
  md = protectTableCodePipes(md);
  md = protectCurrencyDollars(md);
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { handlers: remarkRehypeHandlers })
    .use(rehypeStringify)
    .process(md);
  let html = String(result).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(new RegExp(DOLLAR_PH, "g"), "$");
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, c, close) => open + c.replace(/\n$/, "") + close
  );
  return html;
}

/**
 * Tabs typed in text survive neither ProseMirror's HTML parsing nor rehype-remark (both collapse
 * whitespace): they cross the HTML as a private-use character, restored in the document by
 * `restoreTabs`, and as a plain-letters placeholder on the way back to Markdown.
 */
const TAB_SENTINEL = "\uE009";
const TAB_PH = "BTRMKTABCHAR";

/** Sentinels left by markdownToHtml → real tabs, outside history and without an update event. */
export function restoreTabs(editor: { state: any; view: { dispatch(tr: any): void } }): void {
  const hits: number[] = [];
  editor.state.doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text.includes(TAB_SENTINEL)) return;
    for (let i = node.text.indexOf(TAB_SENTINEL); i >= 0; i = node.text.indexOf(TAB_SENTINEL, i + 1)) hits.push(pos + i);
  });
  if (!hits.length) return;
  const tr = editor.state.tr;
  for (const p of hits.reverse()) tr.insertText("\t", p, p + 1);
  editor.view.dispatch(tr.setMeta("addToHistory", false).setMeta("preventUpdate", true));
}

/**
 * Top-level blocks carry their index among the source's top-level blocks (`data-ms-blk`, see
 * studio/sourceMap.ts): the editor reuses the exact source text of every block it did not change.
 */
export const isSourceBlock = (n: any) => n.type !== "definition" && n.type !== "footnoteDefinition";
function remarkStampBlocks() {
  return (tree: any) => {
    let i = 0;
    for (const child of tree.children) {
      if (!isSourceBlock(child)) continue;
      child.data = { ...child.data, msBlk: i, hProperties: { ...child.data?.hProperties, dataMsBlk: String(i) } };
      i++;
    }
  };
}
/** Custom handlers ignore hProperties: copy the block stamp onto what they return. */
const stampedHandlers = Object.fromEntries(
  Object.entries(remarkRehypeHandlers).map(([name, handler]) => [
    name,
    (state: any, node: any, parent?: any) => {
      const out = handler(state, node, parent);
      if (node.data?.msBlk !== undefined && out?.type === "element") out.properties = { ...out.properties, dataMsBlk: String(node.data.msBlk) };
      return out;
    },
  ]),
);

/** Markdown → HTML for Tiptap, built once (frozen: stateless across runs). */
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkGroupDirectives)
  .use(remarkStampBlocks)
  .use(remarkRehype, { handlers: stampedHandlers })
  .use(rehypeStringify)
  .freeze();

export async function markdownToHtml(
  md: string,
  baseUri?: string
): Promise<string> {
  // Protect | inside code spans within table rows
  md = protectTableCodePipes(md);
  // Protect currency $ from remarkMath pairing
  md = protectCurrencyDollars(md);

  const result = await markdownProcessor.process(md);

  // Restore placeholders
  let html = String(result).replace(new RegExp(PIPE_PH, "g"), "|");
  html = html.replace(new RegExp(DOLLAR_PH, "g"), "$");

  // Trim trailing newlines inside <code> blocks
  html = html.replace(
    /(<code[^>]*>)([\s\S]*?)(<\/code>)/g,
    (_m, open, content, close) => open + content.replace(/\n$/, "") + close
  );

  // Use DOMParser to fix HTML structure for Tiptap:
  // 1. Wrap bare text in <li> with <p> (Tiptap needs block content)
  // 2. Convert GFM task lists to Tiptap's taskItem format
  // 3. Ensure each <img> is in its own <p> block
  {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Wrap bare <li> text in <p>
    doc.querySelectorAll("li").forEach((li) => {
      const firstChild = li.childNodes[0];
      if (firstChild && firstChild.nodeType === Node.TEXT_NODE && firstChild.textContent?.trim()) {
        const p = doc.createElement("p");
        while (li.firstChild && !(li.firstChild as Element).tagName?.match(/^(UL|OL|DIV|BLOCKQUOTE|PRE|TABLE)$/i)) {
          p.appendChild(li.firstChild);
        }
        li.insertBefore(p, li.firstChild);
      }
    });

    // Convert GFM task list items to Tiptap taskItem format
    doc.querySelectorAll("li").forEach((li) => {
      const checkbox = li.querySelector("input[type=checkbox]");
      if (!checkbox) return;
      const checked = checkbox.hasAttribute("checked");
      checkbox.remove();
      // Remove leading whitespace after checkbox removal
      if (li.firstChild?.nodeType === Node.TEXT_NODE) {
        li.firstChild.textContent = li.firstChild.textContent?.replace(/^\s+/, "") || "";
      }
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", String(checked));
      // Ensure content is in <p>
      if (!li.querySelector("p")) {
        const p = doc.createElement("p");
        while (li.firstChild) p.appendChild(li.firstChild);
        li.appendChild(p);
      }
    });
    doc.querySelectorAll("ul").forEach((ul) => {
      if (ul.querySelector('li[data-type="taskItem"]')) {
        ul.setAttribute("data-type", "taskList");
      }
    });

    // Detect "paragraph containing exactly one autolink to GitHub"
    // and rewrite it so Tiptap parses it as an embed node. remark-gfm turns
    // a bare URL on its own line into <p><a href="url">url</a></p>, which
    // is the shape we look for here.
    doc.querySelectorAll("p").forEach((p) => {
      const anchors = p.querySelectorAll("a");
      if (anchors.length !== 1) return;
      const a = anchors[0];
      const href = a.getAttribute("href") || "";
      const pText = (p.textContent || "").trim();
      if (pText !== href) return;
      let dataType: string | null = null;
      if (isGitHubUrl(href)) dataType = "githubEmbed";
      if (!dataType) return;
      p.setAttribute("data-type", dataType);
      p.setAttribute("data-url", href);
      p.textContent = href;
    });

    // `[![Title](x.deck.png)](x.deck)` alone in a paragraph → deck block. The
    // <img> stays inside so its src gets the webview base URI below.
    doc.querySelectorAll("p").forEach((p) => {
      const a = p.firstElementChild;
      const img = a?.firstElementChild;
      if (p.childElementCount !== 1 || a?.tagName !== "A" || !isDeckHref(a.getAttribute("href"))) return;
      if (a.childElementCount !== 1 || img?.tagName !== "IMG" || (p.textContent ?? "").trim()) return;
      const div = doc.createElement("div");
      div.setAttribute("data-type", "deckBlock");
      if (p.getAttribute("data-ms-blk")) div.setAttribute("data-ms-blk", p.getAttribute("data-ms-blk")!);
      div.setAttribute("data-href", a.getAttribute("href")!);
      div.setAttribute("data-alt", img.getAttribute("alt") ?? "");
      div.appendChild(img);
      p.replaceWith(div);
    });

    // Ensure each <img> is in its own <p> block (not inline with other images)
    doc.querySelectorAll("p").forEach((p) => {
      const imgs = p.querySelectorAll("img");
      if (imgs.length <= 1) return;
      const parent = p.parentNode;
      if (!parent) return;
      imgs.forEach((img, i) => {
        const wrapper = doc.createElement("p");
        const blk = p.getAttribute("data-ms-blk");
        if (blk) wrapper.setAttribute("data-ms-blk", blk);
        wrapper.appendChild(img.cloneNode(true));
        parent.insertBefore(wrapper, p);
      });
      p.remove();
    });

    html = doc.body.innerHTML;
  }

  // Resolve relative image paths to webview URIs
  if (baseUri) {
    html = html.replace(
      /<img\s([^>]*?)src="([^"]+)"/g,
      (_m, before, src) => {
        if (/^https?:\/\/|^data:/.test(src)) return `<img ${before}src="${src}"`;
        return `<img ${before}src="${baseUri.replace(/\/$/, "")}/${src}"`;
      }
    );
  }

  return html.replace(/\t/g, TAB_SENTINEL);
}

/**
 * Reshape Tiptap's HTML into the shape rehype-remark expects, ahead of
 * either a sync or async stringify step.
 */
function preprocessTiptapHtml(html: string): string {
  html = html.replace(/\t/g, TAB_PH);
  // Convert Tiptap task list HTML to standard GFM format for rehype-remark
  {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Convert math nodes to code/pre placeholders that protect LaTeX content
    // from remark-stringify escaping. Restored in postprocessMarkdown.
    doc.querySelectorAll('[data-type="mathInline"]').forEach((el) => {
      const latex = el.getAttribute("data-latex") || el.textContent || "";
      const code = doc.createElement("code");
      code.textContent = `BTRMK_MATH:${latex}`;
      el.replaceWith(code);
    });
    doc.querySelectorAll('[data-type="mathBlock"]').forEach((el) => {
      const latex = el.getAttribute("data-latex") || el.textContent || "";
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.className = "language-btrmk-math-block";
      code.textContent = latex;
      pre.appendChild(code);
      el.replaceWith(pre);
    });

    // Carry fence meta (```gmc id=x) through rehype-remark inside the
    // language class; restoreFenceMeta undoes it in postprocessMarkdown.
    doc.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      const meta = pre.getAttribute("data-meta") || code?.getAttribute("data-meta");
      if (!code || !meta) return;
      const lang = code.className.match(/(?:^|\s)language-(\S+)/)?.[1] || "";
      code.className = "language-" + encodeFenceMeta(lang, meta);
    });

    doc.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
      const checked = li.getAttribute("data-checked") === "true";
      const label = li.querySelector("label");
      if (label) label.remove();
      const div = li.querySelector("div");
      const content = div?.innerHTML || li.innerHTML;
      if (div) div.remove();
      const checkbox = doc.createElement("input");
      checkbox.type = "checkbox";
      if (checked) checkbox.setAttribute("checked", "");
      li.innerHTML = "";
      li.appendChild(checkbox);
      li.append(" ");
      const span = doc.createElement("span");
      span.innerHTML = content.replace(/<\/?p>/g, "");
      while (span.firstChild) li.appendChild(span.firstChild);

      li.removeAttribute("data-type");
      li.removeAttribute("data-checked");
    });
    doc.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => {
      ul.classList.add("contains-task-list");
      ul.removeAttribute("data-type");
    });
    html = doc.body.innerHTML;
  }

  // Strip <p> from inside <li> so rehype-remark produces tight lists
  html = html.replace(/<li([^>]*)>\s*<p>([\s\S]*?)<\/p>/g, "<li$1>$2");

  // NOTE: we deliberately do NOT escape `|` inside <code> within table cells
  // here. rehype-remark + remark-gfm already emit correct GFM escapes (`\|`)
  // for table cell code spans. Escaping manually leads to double-escape
  // (`\\|`) on round-trips.

  // Wrap bare <img> tags in <p> so each image gets its own paragraph
  // Tiptap outputs images as top-level <img> without <p> wrappers
  html = html.replace(/(?<!\w)(<img\s[^>]*>)/g, "<p>$1</p>");
  // Clean up any <p><p><img></p></p> double-wrapping
  html = html.replace(/<p>\s*<p>(<img\s[^>]*>)<\/p>\s*<\/p>/g, "<p>$1</p>");
  // Remove empty <p></p> between images
  html = html.replace(/<\/p>\s*<p>\s*<\/p>\s*<p>/g, "</p>\n<p>");

  // Deck blocks back to a linked image (after the <img> wrapping above).
  if (html.includes('data-type="deckBlock"')) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll('div[data-type="deckBlock"]').forEach((div) => {
      const p = doc.createElement("p");
      const a = doc.createElement("a");
      const img = doc.createElement("img");
      a.setAttribute("href", div.getAttribute("data-href") ?? "");
      img.setAttribute("src", div.getAttribute("data-src") ?? "");
      img.setAttribute("alt", div.getAttribute("data-alt") ?? "");
      a.appendChild(img);
      p.appendChild(a);
      div.replaceWith(p);
    });
    html = doc.body.innerHTML;
  }

  return html;
}

function postprocessMarkdown(
  md: string,
  settings: BetterMarkdownSettings,
  baseUri?: string,
  docFolderPath?: string
): string {
  md = normalizeMarkdown(md, settings);
  md = md.replace(new RegExp(TAB_PH, "g"), "\t");
  md = restoreFenceMeta(md);
  md = restoreRawHtml(md);
  // A block marker sits on the line right above its block.
  md = md.replace(/^(<!-- ms:block [^\n]*-->)\n\n(?=\S)/gm, "$1\n");
  // Restore math from code/pre placeholders (after normalizeMarkdown to avoid interference)
  md = md.replace(/`BTRMK_MATH:(.*?)`/g, (_m, latex) => `$${latex}$`);
  md = md.replace(/```btrmk-math-block\n([\s\S]*?)\n```/g, (_m, latex) => `$$\n${latex}\n$$`);
  // Replace HTML entities that leak through
  md = md.replace(/&#x20;/g, " ");
  md = md.replace(/&amp;/g, "&");
  // Strip BlockNote-style default alt text
  md = md.replace(/!\[BlockNote image\]/g, "![]");
  // Restore relative paths
  md = restoreRelativePaths(md, baseUri, docFolderPath);
  return md;
}

/**
 * HTML → Markdown processor for these stringify settings, built once and
 * reused (frozen processors are stateless: concurrent runs are independent).
 */
const htmlProcessors = new Map<string, ReturnType<typeof buildHtmlProcessor>>();
function buildHtmlProcessor(config: ReturnType<typeof buildMarkdownConfig>) {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeUnwrapDirectives)
    .use(rehypeRemark, { handlers: rehypeRemarkHandlers })
    .use(remarkGfm)
    .use(remarkStringify, config)
    .freeze();
}
function htmlProcessor(settings: BetterMarkdownSettings) {
  const config = buildMarkdownConfig(settings);
  const key = JSON.stringify(config);
  let processor = htmlProcessors.get(key);
  if (!processor) htmlProcessors.set(key, (processor = buildHtmlProcessor(config)));
  return processor;
}

/**
 * Convert HTML from Tiptap editor back to markdown.
 */
export async function htmlToMarkdown(
  html: string,
  baseUri?: string,
  docFolderPath?: string,
  settings: BetterMarkdownSettings = DEFAULT_SETTINGS
): Promise<string> {
  const result = await htmlProcessor(settings).process(preprocessTiptapHtml(html));
  return postprocessMarkdown(String(result), settings, baseUri, docFolderPath);
}

/**
 * Synchronous variant of htmlToMarkdown. Needed for the clipboard copy
 * handler, which has to call clipboardData.setData() inside the DOM event
 * (async writes aren't supported there without navigator.clipboard).
 */
export function htmlToMarkdownSync(
  html: string,
  baseUri?: string,
  docFolderPath?: string,
  settings: BetterMarkdownSettings = DEFAULT_SETTINGS
): string {
  const result = htmlProcessor(settings).processSync(preprocessTiptapHtml(html));
  return postprocessMarkdown(String(result), settings, baseUri, docFolderPath);
}

function restoreRelativePaths(
  md: string,
  baseUri?: string,
  docFolderPath?: string
): string {
  if (baseUri) {
    const prefix = baseUri.replace(/\/$/, "") + "/";
    md = md.replace(new RegExp(escapeRegExp(prefix), "g"), "");
  }

  if (docFolderPath) {
    const folder = docFolderPath.replace(/\/$/, "") + "/";
    const resPrefix = "https://file+.vscode-resource.vscode-cdn.net" + folder;
    md = md.replace(new RegExp(escapeRegExp(resPrefix), "g"), "");
    const encPrefix = "https://file+.vscode-resource.vscode-cdn.net" + encodeURI(folder);
    md = md.replace(new RegExp(escapeRegExp(encPrefix), "g"), "");
  }

  md = md.replace(
    /https:\/\/file\+\.vscode-resource\.vscode-cdn\.net(\/[^\s)]+)/g,
    (_m, absPath) => {
      if (docFolderPath) {
        const folder = docFolderPath.replace(/\/$/, "") + "/";
        const decoded = decodeURI(absPath);
        if (decoded.startsWith(folder)) return decoded.slice(folder.length);
      }
      return absPath.split("/").pop() || absPath;
    }
  );

  return md;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

