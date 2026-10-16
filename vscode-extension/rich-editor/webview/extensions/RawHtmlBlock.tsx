import { Node } from "@tiptap/core";
import { RAW_HTML_LANG } from "../conversion-utils";

/**
 * Block-level raw HTML from the markdown source — HTML comments such as
 * `<!-- embed:file="…" -->` / `<!-- embed:toc -->` directives, `<details>`,
 * `<div align="center">`… Shown verbatim as an editable monospace block so
 * nothing is lost on save (see remarkRehypeHandlers.html / restoreRawHtml).
 */
/** `<!-- gmc-source-sha256:… -->`-style comments written by tools, not people. */
export function isMetaComment(text: string): boolean {
  return /^<!--\s*[a-z][\w-]*:\S+\s*-->$/i.test(text.trim()) && !/^<!--\s*(?:embed|link):/i.test(text.trim());
}

export const RawHtmlBlock = Node.create({
  name: "rawHtmlBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  priority: 1000,

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (el: any) =>
          el instanceof HTMLElement &&
          el.querySelector("code")?.classList.contains(`language-${RAW_HTML_LANG}`)
            ? null
            : false,
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "pre",
      { class: `raw-html-block${isMetaComment(node.textContent) ? " raw-html-meta" : ""}`, "data-label": "HTML" },
      ["code", { class: `language-${RAW_HTML_LANG}` }, 0],
    ];
  },
});
