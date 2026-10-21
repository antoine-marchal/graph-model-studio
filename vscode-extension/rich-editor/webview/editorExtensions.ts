import { Extension } from "@tiptap/core";
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
import { GitHubEmbed } from "./extensions/GitHubEmbed";
import { HeadingIndent } from "./extensions/HeadingIndent";

const lowlight = createLowlight(common);

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
export function contentExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false, // replaced by CodeBlockLowlight
      code: false, // replaced below so inline code can coexist with bold/italic
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    // Tiptap's default Code mark sets `excludes: '_'`, which strips every
    // other mark (e.g. bold) when the code mark is applied. Override to ''
    // so `**\`bold code\`**` round-trips without losing the bold wrapper.
    Code.extend({ excludes: "" }),
    Link.configure({ openOnClick: false }),
    ImageBlock,
    Table.configure({ resizable: true, cellMinWidth: 40 }),
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
  ];
}
