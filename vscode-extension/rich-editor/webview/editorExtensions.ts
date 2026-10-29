import { Extension } from "@tiptap/core";
import "./extensions/nodeViewPositions";
import { StarterKit } from "@tiptap/starter-kit";
import { Code } from "@tiptap/extension-code";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { common, createLowlight } from "lowlight";
import { ImageBlock } from "./extensions/ImageView";
import { createCodeBlock } from "./extensions/CodeBlockView";
import { MathInline } from "./extensions/MathInline";
import { MathBlock } from "./extensions/MathBlock";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { GmcBlock } from "./extensions/GmcBlock";
import { DeckBlock } from "./extensions/DeckBlock";
import { RawHtmlBlock } from "./extensions/RawHtmlBlock";
import { DirectiveBlock } from "./extensions/DirectiveBlock";
import { AlignBlock, Column, Columns, Highlight, Hashtags } from "./extensions/BlockStyle";
import { TableFilter } from "./extensions/TableFilter";
import { PAPER } from "./studio/store";
import { GitHubEmbed } from "./extensions/GitHubEmbed";
import { HeadingIndent } from "./extensions/HeadingIndent";
import { PageBreak, SectionBreak, StudioBlockAttrs, StudioObject, StudioStory, TextStyle } from "./extensions/StudioNodes";

const highlighter = createLowlight(common);

/**
 * Very large code blocks (generated JSON embeds…) stay uncolored: every token is a DOM span, and
 * Chrome's own typing / selection work walks them all (a 45k-line JSON block made each keystroke
 * anywhere in the document cost ~150 ms instead of ~17 ms).
 */
const MAX_HIGHLIGHT_CHARS = 100_000;
const MAX_HIGHLIGHT_LINES = 2_000;
const tooBig = (code: string) => {
  if (code.length > MAX_HIGHLIGHT_CHARS) return true;
  for (let i = 0, lines = 0; (i = code.indexOf("\n", i) + 1) > 0; ) if (++lines > MAX_HIGHLIGHT_LINES) return true;
  return false;
};
const plain = (value: string) => ({ type: "root" as const, children: [{ type: "text" as const, value }], data: { language: undefined, relevance: 0 } });
const lowlight = {
  ...highlighter,
  highlight: (language: string, code: string, options?: Parameters<typeof highlighter.highlight>[2]) => (tooBig(code) ? plain(code) : highlighter.highlight(language, code, options)),
  highlightAuto: (code: string, options?: Parameters<typeof highlighter.highlightAuto>[1]) => (tooBig(code) ? plain(code) : highlighter.highlightAuto(code, options)),
};

/**
 * Tab typed inside a line inserts a tab character instead of indenting the
 * list item or jumping to the next table cell. At the start of a line (or
 * at the end of a table cell, or with a selection) the usual indent / cell
 * navigation still applies.
 */
const TabCharacter = Extension.create({
  name: "tabCharacter",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        if (!empty || !$from.parent.isTextblock || $from.parentOffset === 0) return false;
        const cell = $from.depth > 1 && /^table(Cell|Header)$/.test($from.node($from.depth - 1).type.name);
        if (cell && $from.parentOffset === $from.parent.content.size) return false;
        // insertText, not insertContent: a string goes through the HTML parser, which collapses "\t".
        return editor.commands.command(({ tr }) => (tr.insertText("\t"), true));
      },
    };
  },
});

/**
 * Everything that renders document content — shared by the rich editor and
 * the rendered diff, so a diff looks exactly like read mode.
 */
export function contentExtensions({ history = true }: { history?: boolean } = {}) {
  return [
    StarterKit.configure({
      codeBlock: false, // replaced by CodeBlockLowlight
      code: false, // replaced below so inline code can coexist with bold/italic
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // The rich editor uses VS Code's undo history (StudioNodes.HostHistory).
      ...(history ? {} : { undoRedo: false }),
    }),
    // Tiptap's default Code mark sets `excludes: '_'`, which strips every
    // other mark (e.g. bold) when the code mark is applied. Override to ''
    // so `**\`bold code\`**` round-trips without losing the bold wrapper.
    Code.extend({ excludes: "" }),
    Link.configure({ openOnClick: false }),
    ImageBlock,
    Table.configure({ resizable: PAPER, cellMinWidth: 40 }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    MermaidBlock,
    GmcBlock,
    DeckBlock,
    RawHtmlBlock,
    DirectiveBlock,
    AlignBlock,
    Columns,
    Column,
    Highlight,
    Hashtags,
    TableFilter,
    createCodeBlock(lowlight),
    MathInline,
    MathBlock,
    GitHubEmbed,
    HeadingIndent,
    TabCharacter,
    StudioBlockAttrs,
    PageBreak,
    SectionBreak,
    StudioObject,
    StudioStory,
    TextStyle,
  ];
}
