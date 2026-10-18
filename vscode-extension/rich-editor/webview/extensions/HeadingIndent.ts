import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Tags each top-level block with its heading-hierarchy depth
 * (`--ms-hdepth`): a heading's depth is the number of open ancestor
 * headings, and body blocks inherit the depth of the heading above them.
 * `# A` → 0, `## B` → 1, `#### C` under B → 2. Only rendered when the
 * `indentHeadings` setting puts `indent-headings` on body (editor.css).
 */
export const HeadingIndent = Extension.create({
  name: "headingIndent",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const open: number[] = []; // levels of ancestor headings
            state.doc.forEach((node, offset) => {
              if (node.type.name === "heading") {
                const level = node.attrs.level as number;
                while (open.length && open[open.length - 1] >= level) open.pop();
                open.push(level);
              }
              const depth = Math.max(0, open.length - 1);
              if (depth) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, { style: `--ms-hdepth:${depth}` })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
