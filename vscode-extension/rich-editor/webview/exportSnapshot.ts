import { vscodeApi } from "./vscode-api";
import { renderMermaidSvg } from "./extensions/MermaidBlock";
import { renderGmcPng } from "./extensions/GmcBlock";

/**
 * HTML / PDF / PNG export of what the rich editor shows: the rendered
 * ProseMirror DOM (Mermaid SVG, KaTeX, GMC diagrams, columns, highlights…)
 * inside shallow copies of its ancestors (so editor.css selectors still
 * match), with the page's stylesheets, VS Code theme variables, images and
 * fonts inlined. The host asks with `exportSnapshot` (markdownToolkit export
 * commands, via `betterMarkdown.exportSnapshot`).
 */

/** Editing chrome that has no place in an exported document. */
const CHROME = [
  ".mermaid-block-toolbar",
  ".mermaid-block-source",
  ".code-block-lang-bar",
  ".directive-header",
  ".directive-empty",
  ".ProseMirror-gapcursor",
  ".ProseMirror-separator",
  "button",
  "select",
  "textarea",
  "[data-export-ignore]",
].join(",");

const TRANSIENT_CLASSES = ["ProseMirror-selectednode", "has-focus", "is-empty", "is-editor-empty", "zen-here", "search-match", "search-match-active"];

const PRINT_CSS = `
html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }
.btrmk-export-chain { height: auto !important; max-height: none !important; overflow: visible !important; position: static !important; }
@page { margin: 14mm; }
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
  pre, figure, img, svg, tr, blockquote, .ms-column, .math-block-wrapper, .mermaid-block-wrapper { break-inside: avoid; }
}
/* Block frames are editor UI: the document shows their content only. */
.tiptap-editor :is(.directive-block, .directive-content, .mermaid-block-wrapper, .mermaid-block-preview, .gmc-block-preview, .math-block-wrapper, .embed-wrapper, .ms-column) {
  border: 0 !important; outline: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important;
}
.tiptap-editor :is(.directive-content, .mermaid-block-preview, .gmc-block-preview) { padding-left: 0 !important; padding-right: 0 !important; }`;

/** Light export: no page background, and light values for the VS Code
 *  variables the theme layer (base.css) leaves to VS Code. */
const LIGHT_CSS = `
html, body, .btrmk-export-chain, .tiptap-editor { background: transparent !important; }
body[data-theme] {
  color-scheme: light;
  --vscode-textCodeBlock-background: var(--bgColor-muted);
  --vscode-editorIndentGuide-background: var(--borderColor-default);
  --vscode-editor-selectionBackground: transparent;
  --vscode-editor-hoverHighlightBackground: transparent;
}
.tiptap-editor blockquote { background: transparent !important; }`;

const DARK_BODY_CLASSES = ["vscode-dark", "vscode-high-contrast"];

/** Shallow copies of <html> / <body> set up for the export theme. */
function themedRoots(theme: ExportTheme): { html: HTMLElement; body: HTMLElement } {
  const html = document.documentElement.cloneNode(false) as HTMLElement;
  const body = document.body.cloneNode(false) as HTMLElement;
  if (theme === "light") {
    const current = body.dataset.theme ?? "";
    body.dataset.theme = current.includes("light") ? current : "github-light";
    body.classList.remove(...DARK_BODY_CLASSES);
    body.classList.add("vscode-light");
    // VS Code's (possibly dark) colors; fonts and sizes stay.
    for (const name of Array.from(html.style)) {
      if (name.startsWith("--vscode-") && !/font/i.test(name)) html.style.removeProperty(name);
    }
  }
  return { html, body };
}

export type ExportTheme = "light" | "editor";

function editorIsDark(): boolean {
  const theme = document.body.dataset.theme;
  if (theme) return theme.includes("dark");
  return !document.body.classList.contains("vscode-light") && !document.body.classList.contains("vscode-high-contrast-light");
}

/** Diagrams drawn in a dark theme, redrawn light into the clone. */
async function relightDiagrams(editorEl: HTMLElement, clone: HTMLElement): Promise<void> {
  const pairs = (selector: string) => {
    const a = Array.from(editorEl.querySelectorAll<HTMLElement>(selector));
    const b = Array.from(clone.querySelectorAll<HTMLElement>(selector));
    return a.map((el, i) => [el, b[i]] as const).filter(([, c]) => c);
  };
  await Promise.all([
    ...pairs(".mermaid-block-wrapper:not(.gmc-block-wrapper)").map(async ([orig, copy]) => {
      const source = orig.querySelector(".mermaid-block-source")?.textContent?.trim();
      const target = copy.querySelector(".mermaid-block-rendered");
      if (!source || !target) return;
      try { target.innerHTML = await renderMermaidSvg(source, "default"); } catch { /* keep the editor's */ }
    }),
    ...pairs(".gmc-block-wrapper").map(async ([orig, copy]) => {
      const source = orig.querySelector(".mermaid-block-source")?.textContent;
      const figure = orig.querySelector<HTMLElement>(".gmc-markdown-diagram");
      const target = copy.querySelector(".gmc-block-rendered");
      if (!source?.trim() || !figure || !target || figure.dataset.gmcTheme === "light") return;
      try {
        const dataUrl = await renderGmcPng({
          source,
          view: figure.dataset.gmcView || undefined,
          theme: "light",
          width: Number(figure.dataset.gmcWidth) || undefined,
          height: Number(figure.dataset.gmcHeight) || undefined,
        });
        target.innerHTML = `<figure class="gmc-markdown-diagram"><img src="${dataUrl}" alt="" style="max-width:100%;height:auto;display:block;margin:auto"></figure>`;
      } catch { /* keep the editor's */ }
    }),
  ]);
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    return response.ok ? await toDataUrl(await response.blob()) : null;
  } catch {
    return null;
  }
}

/** `url(...)` references in `css` (relative to `base`) inlined as data URLs. */
async function inlineCssUrls(css: string, base: string): Promise<string> {
  const urls = new Map<string, string | null>();
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    if (!m[2].startsWith("data:") && !m[2].startsWith("#")) urls.set(m[2], null);
  }
  // Only woff2 for fonts: every browser that renders the export reads it.
  await Promise.all([...urls.keys()].map(async (u) => {
    if (/\.(woff|ttf|eot|otf)(\?|#|$)/i.test(u)) return;
    urls.set(u, await fetchDataUrl(new URL(u, base).href));
  }));
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _q, u) => {
    const data = urls.get(u);
    return data ? `url("${data}")` : whole;
  });
}

async function collectStyles(): Promise<string> {
  const parts: string[] = [];
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style'))) {
    if (node instanceof HTMLLinkElement) {
      try {
        const response = await fetch(node.href);
        if (response.ok) parts.push(await inlineCssUrls(await response.text(), node.href));
      } catch {
        // Unreachable stylesheet: the export just lacks it.
      }
    } else {
      parts.push(await inlineCssUrls(node.textContent ?? "", document.baseURI));
    }
  }
  return parts.join("\n");
}

const STATE_CLASSES = new Set(["zen-mode", "drag-over", ...TRANSIENT_CLASSES]);

function attributes(el: Element, extraClass?: string): string {
  const out: string[] = [];
  for (const { name, value } of Array.from(el.attributes)) {
    if (name === "contenteditable") continue;
    let v = value;
    if (name === "class") {
      v = [...value.split(/\s+/).filter((c) => c && !STATE_CLASSES.has(c)), ...(extraClass ? [extraClass] : [])].join(" ");
    }
    out.push(`${name}="${v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
  }
  if (extraClass && !el.hasAttribute("class")) out.push(`class="${extraClass}"`);
  return out.length ? " " + out.join(" ") : "";
}

/** GitHub-style heading slugs (same rules as the toolkit's TOC links). */
function addHeadingIds(root: HTMLElement) {
  const seen = new Map<string, number>();
  root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((h) => {
    const base = (h.textContent ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
    if (!base) return;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (!h.id) h.id = count ? `${base}-${count}` : base;
  });
}

export async function buildExportSnapshot(theme: ExportTheme = "light"): Promise<string> {
  const editorEl = document.querySelector<HTMLElement>(".editor-container .tiptap-editor:not(.diff-doc)");
  if (!editorEl) throw new Error("the rich editor has no content to export");

  // Canvases don't clone their pixels; swap them for images.
  const canvases = Array.from(editorEl.querySelectorAll("canvas")).map((c) => {
    try { return c.toDataURL(); } catch { return null; }
  });
  const clone = editorEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("canvas").forEach((c, i) => {
    const data = canvases[i];
    if (!data) return void c.remove();
    const img = document.createElement("img");
    img.src = data;
    img.style.cssText = c.style.cssText;
    img.width = c.width;
    img.height = c.height;
    c.replaceWith(img);
  });

  clone.querySelectorAll(CHROME).forEach((el) => el.remove());
  clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  clone.querySelectorAll("[draggable]").forEach((el) => el.removeAttribute("draggable"));
  for (const cls of TRANSIENT_CLASSES) clone.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
  clone.classList.remove("ProseMirror-focused");
  // Checkbox state lives in the property, not the attribute.
  const boxes = Array.from(editorEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  clone.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box, i) => {
    box.toggleAttribute("checked", !!boxes[i]?.checked);
    box.setAttribute("disabled", "");
  });
  addHeadingIds(clone);
  if (theme === "light" && editorIsDark()) await relightDiagrams(editorEl, clone);

  await Promise.all(Array.from(clone.querySelectorAll("img")).map(async (img) => {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) return;
    const data = await fetchDataUrl(img.src);
    if (data) img.setAttribute("src", data);
  }));

  // Ancestors from the editor up to <body>, as empty shells.
  let html = clone.outerHTML;
  for (let el = editorEl.parentElement; el && el !== document.body; el = el.parentElement) {
    const tag = el.tagName.toLowerCase();
    html = `<${tag}${attributes(el, "btrmk-export-chain")}>${html}</${tag}>`;
  }

  const title = document.querySelector(".tiptap-editor h1")?.textContent?.trim() || document.title;
  const css = await collectStyles();
  const roots = themedRoots(theme);
  return `<!doctype html>
<html${attributes(roots.html)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>
<style>${css}</style>
<style>${PRINT_CSS}${theme === "light" ? LIGHT_CSS : ""}</style>
</head>
<body${attributes(roots.body)}>${html}</body>
</html>`;
}

window.addEventListener("message", async (e: MessageEvent) => {
  if (e.data?.type !== "exportSnapshot") return;
  const requestId = e.data.requestId;
  try {
    vscodeApi.postMessage({ type: "exportSnapshotResult", requestId, html: await buildExportSnapshot(e.data.theme === "editor" ? "editor" : "light") });
  } catch (err) {
    vscodeApi.postMessage({ type: "exportSnapshotResult", requestId, error: err instanceof Error ? err.message : String(err) });
  }
});
