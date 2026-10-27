/**
 * Editor-derived chrome state without per-keystroke React commits. Every React commit while the
 * caret is in the document makes React measure the selection across the whole contenteditable
 * (cost grows with the document), so chrome re-renders only when what it shows changes: the
 * value is recomputed once per frame after a transaction and compared by content.
 */
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { studio } from "./store";

export function useEditorDerived<T>(editor: Editor | null, compute: (editor: Editor) => T, idle = false): T | undefined {
  const fn = useRef(compute);
  fn.current = compute;
  const [value, setValue] = useState<T | undefined>(() => (editor ? compute(editor) : undefined));
  const key = useRef(JSON.stringify(value ?? null));
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      frame = 0;
      timer = null;
      if (editor.isDestroyed) return;
      const next = fn.current(editor);
      const k = JSON.stringify(next ?? null);
      if (k === key.current) return;
      key.current = k;
      setValue(next);
    };
    // Idle consumers (outline, page list) wait for a pause in typing.
    const schedule = () => {
      if (idle) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, 400);
      } else if (!frame) frame = requestAnimationFrame(run);
    };
    editor.on("transaction", schedule);
    // Idle values may read the page layout too: a new pagination pass refreshes them.
    let layout = studio.get().layout;
    const off = idle ? studio.subscribe(() => studio.get().layout !== layout && ((layout = studio.get().layout), schedule())) : () => {};
    run();
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      editor.off("transaction", schedule);
      off();
    };
  }, [editor, idle]);
  return value;
}
