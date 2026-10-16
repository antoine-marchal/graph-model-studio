import React, { useCallback, useEffect, useState } from "react";
import { scrollToHeadingByIndex } from "./TableOfContents";

/**
 * Compact heading outline (after nuza's section guides): at the left edge,
 * level with the middle of the pane, one short line per heading — indented
 * per level, the current section a shade brighter. Hovering swaps the lines
 * for the heading names; clicking a name jumps to it.
 */

/** Deepest heading level (relative to the top one) that gets a mark. */
const RAIL_DEPTH = 3;
const HEADINGS =
  ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6";

interface Mark {
  index: number;
  text: string;
  depth: number;
}

export function OutlineRail() {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [active, setActive] = useState(-1);

  const update = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(HEADINGS));
    const levels = els.map((el) => parseInt(el.tagName[1], 10));
    const top = Math.min(6, ...levels);
    const next: Mark[] = [];
    els.forEach((el, index) => {
      const depth = levels[index] - top;
      const text = el.textContent?.trim();
      if (text && depth < RAIL_DEPTH) next.push({ index, text, depth });
    });
    setMarks((prev) =>
      prev.length === next.length && prev.every((m, i) => m.text === next[i].text && m.depth === next[i].depth)
        ? prev
        : next,
    );

    // Current section: last heading whose top is above the upper third.
    const limit = container.getBoundingClientRect().top + container.clientHeight / 3;
    let current = -1;
    els.forEach((el, index) => {
      if (el.getBoundingClientRect().top <= limit) current = index;
    });
    setActive(current);
  }, []);

  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    const interval = setInterval(update, 1000);
    const timer = setTimeout(update, 300);
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearInterval(interval);
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [update]);

  if (marks.length < 2) return null;

  // The section in view may be deeper than the rail goes: light the nearest mark above.
  const lit = marks.reduce((found, m) => (m.index <= active ? m.index : found), -1);

  return (
    <nav className="outline-rail" aria-label="Sections">
      <div className="outline-rail-lines" aria-hidden>
        {marks.map((m) => (
          <span
            key={m.index}
            className={`outline-rail-line depth-${m.depth}${m.index === lit ? " lit" : ""}`}
          />
        ))}
      </div>
      <ul className="outline-rail-names">
        {marks.map((m) => (
          <li key={m.index}>
            <button
              type="button"
              className={`outline-rail-name depth-${m.depth}${m.index === lit ? " lit" : ""}`}
              aria-current={m.index === lit ? "location" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => scrollToHeadingByIndex(m.index)}
            >
              {m.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
