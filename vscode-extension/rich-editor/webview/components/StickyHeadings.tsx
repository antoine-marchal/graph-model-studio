import React, { useState, useRef } from "react";
import { HEADING_SELECTOR, scrollToHeadingByIndex, useHeadingEvents } from "../hooks/useHeadingEvents";

interface StickyHeading {
  index: number;
  text: string;
  level: number;
}

// Hysteresis: a heading already in the stack needs to move this many extra
// pixels below the threshold before it gets removed.  This prevents the
// oscillation where adding a heading grows the bar → raises the threshold →
// removes the heading → shrinks the bar → lowers the threshold → re-adds it.
const HYSTERESIS = 28;

export function StickyHeadings() {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);
  const prevKeyRef = useRef("");
  const prevIndicesRef = useRef<Set<number>>(new Set());

  const update = () => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll(HEADING_SELECTOR);
    const containerRect = container.getBoundingClientRect();
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const threshold = containerRect.top + stickyHeight + 12;

    const prevIn = prevIndicesRef.current;
    const aboveViewport: StickyHeading[] = [];
    headingEls.forEach((el, index) => {
      const bottom = el.getBoundingClientRect().bottom;
      // Headings already in the stack get a looser threshold (harder to remove)
      const effectiveThreshold = prevIn.has(index) ? threshold + HYSTERESIS : threshold;
      if (bottom < effectiveThreshold) {
        const text = el.textContent?.trim();
        if (text) {
          aboveViewport.push({ index, text, level: parseInt(el.tagName[1], 10) });
        }
      }
    });

    const stack: StickyHeading[] = [];
    for (const h of aboveViewport) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
    }

    const key = stack.map((h) => `${h.index}:${h.text}`).join("|");
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      prevIndicesRef.current = new Set(stack.map((h) => h.index));
      setStickyStack(stack);
    }
  };
  useHeadingEvents(update, update);

  if (stickyStack.length === 0) return null;

  return (
    <div className="sticky-headings">
      {stickyStack.map((h) => (
        <div
          key={h.index}
          className={`sticky-heading sticky-heading-h${h.level}`}
          onClick={() => scrollToHeadingByIndex(h.index)}
          role="button"
          tabIndex={0}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
