/**
 * Markdown Studio document nodes (grammar: document/markers.ts):
 *   msBlk          load-time source block stamp (never rendered, not kept on split)
 *   msBlock        `ms:block` properties of a block (style, spacing, keep rules, id)
 *   msPageBreak    `ms:pagebreak`
 *   msSection      `ms:section` (section properties as JSON)
 *   msObject       `ms:object` — positioned object; body = its content blocks (studio/ObjectView)
 *   msTextStyle    `<span style data-ms-style>` — font, size, colors, character style
 */
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { sanitizeSpanStyle } from "../../document/remarkStudio";
import type { BlockProps } from "../../document/schema";
import { createObjectView } from "../studio/ObjectView";

export const TOP_LEVEL_TYPES = [
  "paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList", "codeBlock", "horizontalRule", "table", "image",
  "mermaidBlock", "gmcBlock", "deckBlock", "rawHtmlBlock", "directiveBlock", "alignBlock", "columns", "mathBlock", "githubEmbed",
  "msObject", "msPageBreak", "msSection",
];
const BLOCK_PROPS_TYPES = ["paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList", "codeBlock", "table", "image"];

export function parseBlockProps(value: unknown): BlockProps {
  if (!value || typeof value !== "string") return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Inline CSS showing direct paragraph formatting of a block (named styles come from the style sheet). */
function blockCss(p: BlockProps): string {
  const pt = (n: number | undefined) => (n === undefined ? undefined : `${n}pt`);
  return [
    p.align && `text-align:${p.align}`,
    pt(p.spaceBefore) && `margin-top:${pt(p.spaceBefore)}`,
    pt(p.spaceAfter) && `margin-bottom:${pt(p.spaceAfter)}`,
    p.lineSpacing && `line-height:${p.lineSpacing}`,
    pt(p.indentLeft) && `padding-left:${pt(p.indentLeft)}`,
    pt(p.indentRight) && `padding-right:${pt(p.indentRight)}`,
    p.firstLine && `text-indent:${p.firstLine}pt`,
  ]
    .filter(Boolean)
    .join(";");
}

export const StudioBlockAttrs = Extension.create({
  name: "studioBlockAttrs",
  addGlobalAttributes() {
    return [
      {
        types: TOP_LEVEL_TYPES,
        attributes: {
          msBlk: { default: null, rendered: false, keepOnSplit: false, parseHTML: (el) => el.getAttribute("data-ms-blk") },
        },
      },
      {
        types: BLOCK_PROPS_TYPES,
        attributes: {
          msBlock: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-ms-block"),
            renderHTML: (attrs) => {
              if (!attrs.msBlock) return {};
              const p = parseBlockProps(attrs.msBlock);
              return { "data-ms-block": attrs.msBlock, ...(p.style ? { class: `ms-s-${p.style}` } : {}), ...(blockCss(p) ? { style: blockCss(p) } : {}) };
            },
          },
        },
      },
    ];
  },
});

export const PageBreak = Node.create({
  name: "msPageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-type="msPageBreak"]' }],
  renderHTML: () => ["div", { "data-type": "msPageBreak", class: "ms-break ms-page-break", contenteditable: "false" }],
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }: any) =>
          commands.insertContent({ type: this.name }),
    } as any;
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => (this.editor.commands as any).insertPageBreak() };
  },
});

export const SectionBreak = Node.create({
  name: "msSection",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { props: { default: "{}", parseHTML: (el) => el.getAttribute("data-props") ?? "{}", renderHTML: (a) => ({ "data-props": a.props }) } };
  },
  parseHTML: () => [{ tag: 'div[data-type="msSection"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "msSection", class: "ms-break ms-section-break", contenteditable: "false" })],
});

export const StudioObject = Node.create({
  name: "msObject",
  group: "block",
  content: "block*",
  isolating: true,
  defining: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { id: { default: "", parseHTML: (el) => el.getAttribute("data-id") ?? "", renderHTML: (a) => ({ "data-id": a.id }) } };
  },
  parseHTML: () => [{ tag: 'div[data-type="msObject"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "msObject" }), 0],
  addNodeView() {
    return createObjectView;
  },
});

export const TextStyle = Mark.create({
  name: "msTextStyle",
  priority: 900,
  addAttributes() {
    return {
      style: { default: "", parseHTML: (el) => sanitizeSpanStyle(el.getAttribute("style") ?? ""), renderHTML: (a) => (a.style ? { style: a.style } : {}) },
      msStyle: { default: null, parseHTML: (el) => el.getAttribute("data-ms-style"), renderHTML: (a) => (a.msStyle ? { "data-ms-style": a.msStyle, class: `ms-cs-${a.msStyle}` } : {}) },
    };
  },
  parseHTML: () => [{ tag: "span[style]", getAttrs: (el) => (sanitizeSpanStyle((el as HTMLElement).getAttribute("style") ?? "") || (el as HTMLElement).getAttribute("data-ms-style") ? null : false) }, { tag: "span[data-ms-style]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});

/** Set / clear inline CSS properties of the selection (merged with its current styled span). */
export function setSpanStyle(editor: any, props: Partial<Record<"color" | "background-color" | "font-size" | "font-family", string | null>>, msStyle?: string | null): void {
  const current = editor.getAttributes("msTextStyle") as { style?: string; msStyle?: string | null };
  const decls = new Map((current.style ?? "").split(";").filter(Boolean).map((d) => d.split(":").map((s) => s.trim()) as [string, string]));
  for (const [k, v] of Object.entries(props)) v ? decls.set(k, v) : decls.delete(k);
  const style = sanitizeSpanStyle([...decls].map(([k, v]) => `${k}:${v}`).join(";"));
  const nextStyle = msStyle === undefined ? current.msStyle ?? null : msStyle;
  const chain = editor.chain().focus();
  if (!style && !nextStyle) chain.unsetMark("msTextStyle").run();
  else chain.setMark("msTextStyle", { style, msStyle: nextStyle }).run();
}

/**
 * One undo history: VS Code's. Typing, layout and source changes are document edits; Mod-Z and
 * Mod-Shift-Z / Mod-Y flush the pending edit and run VS Code's undo / redo.
 */
export const HostHistory = Extension.create<{ onUndo: () => void; onRedo: () => void }>({
  name: "hostHistory",
  addOptions() {
    return { onUndo: () => {}, onRedo: () => {} };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => (this.options.onUndo(), true),
      "Mod-Shift-z": () => (this.options.onRedo(), true),
      "Mod-y": () => (this.options.onRedo(), true),
    };
  },
});
