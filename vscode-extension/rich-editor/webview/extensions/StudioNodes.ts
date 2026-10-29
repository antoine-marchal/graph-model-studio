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
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { sanitizeSpanStyle } from "../../document/remarkStudio";
import type { BlockProps } from "../../document/schema";
import { createObjectView } from "../studio/ObjectView";
import { PAPER, studio } from "../studio/store";

export const TOP_LEVEL_TYPES = [
  "paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList", "codeBlock", "horizontalRule", "table", "image",
  "mermaidBlock", "gmcBlock", "deckBlock", "rawHtmlBlock", "directiveBlock", "alignBlock", "columns", "mathBlock", "githubEmbed",
  "msObject", "msPageBreak", "msSection", "msStory",
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
  // Ahead of the core Enter keymap (below the open slash menu, see `suggesting`).
  priority: 101,
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
  addProseMirrorPlugins() {
    return [groupIdPlugin()];
  },
  addKeyboardShortcuts() {
    return {
      // Enter at the end of a styled paragraph: the new one takes the style's `next` (Word), never the id.
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        const suggesting = state.plugins.some((p) => (p as any).key?.startsWith("suggestion$") && (p.getState(state) as any)?.active);
        if (suggesting) return false;
        const block = $from.parent;
        if (!empty || !block.attrs.msBlock || $from.parentOffset !== block.content.size) return false;
        if (!["paragraph", "heading"].includes(block.type.name) || /^(listItem|taskItem)$/.test($from.node(-1).type.name)) return false;
        const props = parseBlockProps(block.attrs.msBlock);
        delete props.id;
        if (props.style) {
          const next = studio.get().sections[0]?.sheet.styles.get(props.style)?.next;
          if (next === "Normal") delete props.style;
          else if (next) props.style = next;
        }
        return this.editor
          .chain()
          .splitBlock()
          .command(({ tr }) => {
            const $p = tr.selection.$from;
            tr.setNodeMarkup($p.before(), undefined, { ...$p.parent.attrs, msBlock: Object.keys(props).length ? JSON.stringify(props) : null });
            return true;
          })
          .run();
      },
    };
  },
});

/** Id of a break's `::: id` group (`breaks.<id>` in the frontmatter); given when inserted. */
const BREAK_ID = { default: "", keepOnSplit: false, parseHTML: (el: HTMLElement) => el.getAttribute("data-id") ?? "", renderHTML: (a: any) => (a.id ? { "data-id": a.id } : {}) };

export const PageBreak = Node.create({
  name: "msPageBreak",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: BREAK_ID };
  },
  parseHTML: () => [{ tag: 'div[data-type="msPageBreak"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "msPageBreak", class: "ms-break ms-page-break", contenteditable: "false" })],
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }: any) =>
          chain()
            .insertContent({ type: this.name })
            // The caret goes on after the break (typing must not replace a selected break).
            .command(({ tr }: any) => {
              if (!(tr.selection instanceof NodeSelection)) return true;
              const after = tr.selection.to;
              if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, tr.doc.type.schema.nodes.paragraph.create());
              tr.setSelection(TextSelection.create(tr.doc, after + 1));
              return true;
            })
            .run(),
    } as any;
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => PAPER && (this.editor.commands as any).insertPageBreak() };
  },
});

export const SectionBreak = Node.create({
  name: "msSection",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: BREAK_ID, props: { default: "{}", parseHTML: (el) => el.getAttribute("data-props") ?? "{}", renderHTML: (a) => ({ "data-props": a.props }) } };
  },
  parseHTML: () => [{ tag: 'div[data-type="msSection"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "msSection", class: "ms-break ms-section-break", contenteditable: "false" })],
});

/** Header / footer / placeholder text (`::: id` group): Markdown kept as is, edited on the page, never in the flow. */
export const StudioStory = Node.create({
  name: "msStory",
  group: "block",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      id: { default: "", parseHTML: (el) => el.getAttribute("data-id") ?? "", renderHTML: (a) => ({ "data-id": a.id }) },
      markdown: { default: "", parseHTML: (el) => el.getAttribute("data-markdown") ?? "", renderHTML: (a) => ({ "data-markdown": a.markdown }) },
    };
  },
  parseHTML: () => [{ tag: 'div[data-type="msStory"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "msStory", class: "ms-story-source", contenteditable: "false" })],
});

/**
 * Every block with properties belongs to a `::: id` group: blocks styled in the editor get a fresh
 * id (from the style name); a copy of an id elsewhere (paste) gets its own. Consecutive siblings
 * may share an id (one group, e.g. a paragraph split in two).
 */
function groupIdPlugin() {
  return new Plugin({
    key: new PluginKey("msGroupIds"),
    appendTransaction(trs, _old, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      const taken = new Set<string>([...Object.keys(studio.get().meta?.objects ?? {}), ...(studio.get().meta?.placeholders ?? [])]);
      state.doc.descendants((n) => {
        if (n.type.name === "msObject" || n.type.name === "msStory" || isBreak(n)) taken.add(String(n.attrs.id));
        const id = n.attrs.msBlock ? parseBlockProps(n.attrs.msBlock).id : undefined;
        if (id) taken.add(id);
      });
      const tr = state.tr;
      const seen = new Map<string, { parent: unknown; index: number }>();
      const breaks = new Set<string>();
      state.doc.descendants((n, pos, parent, index) => {
        if (isBreak(n)) {
          // Every page / section break is a `::: id` group: a new one (or a pasted copy) gets its id.
          if (!n.attrs.id || breaks.has(n.attrs.id)) {
            const id = uniqueBlockId(n.type.name === "msPageBreak" ? "pagebreak" : "section", taken);
            taken.add(id);
            tr.setNodeMarkup(pos, undefined, { ...n.attrs, id });
            breaks.add(id);
          } else breaks.add(n.attrs.id);
          return false;
        }
        if (!n.attrs.msBlock) return true;
        const props = parseBlockProps(n.attrs.msBlock);
        const last = props.id ? seen.get(props.id) : undefined;
        const fresh = !props.id ? Object.keys(props).length > 0 : !!last && !(last.parent === parent && last.index === index - 1);
        if (fresh) {
          props.id = uniqueBlockId(String(props.style ?? n.type.name).toLowerCase(), taken);
          taken.add(props.id);
          tr.setNodeMarkup(pos, undefined, { ...n.attrs, msBlock: JSON.stringify(props) });
        }
        if (props.id) seen.set(props.id, { parent, index });
        return true;
      });
      return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
    },
  });
}

const isBreak = (n: { type: { name: string } }) => n.type.name === "msPageBreak" || n.type.name === "msSection";

function uniqueBlockId(base: string, taken: Set<string>): string {
  const stem = base.replace(/[^\w-]+/g, "-").replace(/^[^A-Za-z]+/, "") || "block";
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}

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
