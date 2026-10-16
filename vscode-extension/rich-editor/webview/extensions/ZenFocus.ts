import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Marks the top-level block(s) the selection touches with `zen-here`.
 * Only visible in zen mode, where every other block is dimmed
 * (`body.zen-mode .tiptap-editor > :not(.zen-here)` in editor.css).
 */
export const ZenFocus = Extension.create({
  name: "zenFocus",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { from, to } = state.selection;
            const decorations: Decoration[] = [];
            state.doc.forEach((node, offset) => {
              const end = offset + node.nodeSize;
              if (end >= from && offset <= to) {
                decorations.push(Decoration.node(offset, end, { class: "zen-here" }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
