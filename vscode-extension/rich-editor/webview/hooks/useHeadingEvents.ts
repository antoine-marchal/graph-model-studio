import { useEffect, useRef } from "react";

export const HEADING_SELECTOR =
  ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6";

/** Scroll the editor to its Nth heading, below the sticky headings bar. */
export function scrollToHeadingByIndex(index: number) {
  const container = document.querySelector(".editor-container");
  const el = container?.querySelectorAll(HEADING_SELECTOR)[index];
  if (!container || !el) return;
  const stickyEl = container.querySelector(".sticky-headings");
  const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
  const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - stickyHeight;
  container.scrollTo({ top: offset, behavior: "smooth" });
}

/**
 * Heading-driven panels (outline, sticky headings) without polling: `onContent` runs when the
 * editor's text or geometry changes (edits, source updates, images / fonts loading, wrapping,
 * resizing; debounced), `onScroll` once per frame while the editor scrolls.
 */
export function useHeadingEvents(onContent: () => void, onScroll: () => void) {
  const handlers = useRef({ onContent, onScroll });
  handlers.current = { onContent, onScroll };
  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    let raf = 0;
    let timer = 0;
    const content = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => handlers.current.onContent(), 120);
    };
    const scroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => handlers.current.onScroll());
    };
    // The editor element can mount (or be replaced) after this panel: follow it.
    let sized: Element | null = null;
    const ro = new ResizeObserver(content);
    const follow = () => {
      const editor = container.querySelector(".tiptap-editor");
      if (editor === sized) return;
      if (sized) ro.unobserve(sized);
      if (editor) ro.observe(editor);
      sized = editor;
    };
    const own = (n: Node) => !!(n instanceof Element ? n : n.parentElement)?.closest(".sticky-headings");
    const mo = new MutationObserver((records) => {
      if (records.every((r) => own(r.target))) return;
      follow();
      content();
    });
    mo.observe(container, { childList: true, subtree: true, characterData: true });
    follow();
    container.addEventListener("scroll", scroll, { passive: true });
    handlers.current.onContent();
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
      container.removeEventListener("scroll", scroll);
    };
  }, []);
}
