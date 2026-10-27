import { ReactRenderer } from "@tiptap/react";

/**
 * Tiptap re-renders every React node view whose position shifted after a transaction, only to
 * hand it a new `getPos` — after each keystroke, every code block, diagram and equation below the
 * caret, plus one React commit (and selection rescan) per keystroke. `getPos` always returns the
 * current position, so such an update is kept without rendering; any other prop still renders.
 */
const updateProps = ReactRenderer.prototype.updateProps;
ReactRenderer.prototype.updateProps = function (this: ReactRenderer, props: Record<string, unknown> = {}) {
  const keys = Object.keys(props);
  if (keys.length === 1 && keys[0] === "getPos") {
    (this as unknown as { props: Record<string, unknown> }).props = { ...this.props, getPos: props.getPos };
    return;
  }
  updateProps.call(this, props);
};
