import React, { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown, CaseSensitive, Regex } from "lucide-react";

declare class Highlight {
  constructor(...ranges: Range[]);
}
declare global {
  interface CSSStyleDeclaration {
    highlights?: Map<string, Highlight>;
  }
  var Highlight: typeof Highlight;
}

interface SearchBarProps {
  visible: boolean;
  onClose: (activeRange?: Range) => void;
}

const supportsHighlightAPI = typeof globalThis.Highlight !== "undefined" && !!(CSS as any).highlights;

/** Elements whose text reads as one line of prose: a match may span bold, links, code… inside them. */
const BLOCK = "p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, dt, dd, figcaption, summary";

const editorRoot = () => document.querySelector<HTMLElement>(".editor-container .tiptap-editor") ?? document.querySelector<HTMLElement>(".tiptap-editor");

/**
 * Every match of `pattern` in the editor, as DOM ranges. Text is gathered per
 * block (across formatting), so "cible du" matches "**cible** du".
 */
function findRanges(root: HTMLElement, pattern: RegExp): Range[] {
  const groups = new Map<Element | null, Text[]>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data) continue;
    const block = n.parentElement?.closest(BLOCK) ?? n.parentElement;
    const list = groups.get(block) ?? [];
    list.push(n);
    groups.set(block, list);
  }
  const ranges: Range[] = [];
  for (const nodes of groups.values()) {
    const starts: number[] = [];
    let text = "";
    for (const n of nodes) {
      starts.push(text.length);
      text += n.data;
    }
    const locate = (offset: number, end: boolean) => {
      let i = nodes.length - 1;
      while (i > 0 && (end ? starts[i] >= offset : starts[i] > offset)) i--;
      return { node: nodes[i], offset: offset - starts[i] };
    };
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      if (!m[0].length) {
        pattern.lastIndex++;
        continue;
      }
      const a = locate(m.index, false);
      const b = locate(m.index + m[0].length, true);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      ranges.push(range);
    }
  }
  return ranges;
}

export function SearchBar({ visible, onClose }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [docTick, setDocTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matchRanges = useRef<Range[]>([]);
  const current = useRef(0);

  // Snapshot the editor cursor BEFORE focusing the input (which clears it).
  const savedCursor = useRef<Range | null>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      const sel = document.getSelection();
      if (sel && sel.rangeCount > 0) savedCursor.current = sel.getRangeAt(0).cloneRange();
      inputRef.current.focus();
      inputRef.current.select();
    }
    if (!visible) {
      clearAllHighlights();
      setTicks([]);
      // Keep query so reopening resumes where the user left off
    }
  }, [visible]);

  // The document changes while the bar is open (typing, undo, remote update): search again.
  useEffect(() => {
    const root = editorRoot();
    if (!visible || !root || !supportsHighlightAPI) return;
    let timer = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDocTick((t) => t + 1), 150);
    });
    mo.observe(root, { childList: true, characterData: true, subtree: true });
    return () => {
      mo.disconnect();
      window.clearTimeout(timer);
    };
  }, [visible]);

  const show = useCallback((ranges: Range[], index: number, scroll: boolean) => {
    current.current = index;
    applyHighlights(ranges, index, scroll);
    setTicks(tickPositions(ranges));
  }, []);

  const doSearch = useCallback(
    (fromEdit: boolean) => {
      clearAllHighlights();
      matchRanges.current = [];
      setInvalid(false);
      const root = editorRoot();
      if (!visible || !query || !root) {
        setMatchCount(0);
        setCurrentMatch(0);
        setTicks([]);
        return;
      }
      let pattern: RegExp;
      try {
        const src = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern = new RegExp(src, caseSensitive ? "g" : "gi");
      } catch {
        setInvalid(true);
        setMatchCount(0);
        setCurrentMatch(0);
        setTicks([]);
        return;
      }
      const ranges = findRanges(root, pattern);
      matchRanges.current = ranges;
      setMatchCount(ranges.length);
      if (!ranges.length) {
        setCurrentMatch(0);
        setTicks([]);
        return;
      }
      let startIdx = 0;
      if (fromEdit) startIdx = Math.min(current.current, ranges.length - 1);
      else if (savedCursor.current) {
        // Jump to the first match at or after the caret the editor had.
        const cursor = savedCursor.current;
        const i = ranges.findIndex((r) => {
          try {
            return r.compareBoundaryPoints(Range.START_TO_START, cursor) >= 0;
          } catch {
            return false;
          }
        });
        startIdx = i < 0 ? 0 : i;
      }
      setCurrentMatch(startIdx + 1);
      show(ranges, startIdx, !fromEdit);
    },
    [visible, query, caseSensitive, useRegex, show],
  );

  useEffect(() => doSearch(false), [doSearch]);
  useEffect(() => {
    if (docTick) doSearch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTick]);

  const navigateMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchCount === 0) return;
      let next = currentMatch + direction;
      if (next > matchCount) next = 1;
      if (next < 1) next = matchCount;
      setCurrentMatch(next);
      show(matchRanges.current, next - 1, true);
    },
    [currentMatch, matchCount, show],
  );

  const closeWithRange = () => onClose(matchRanges.current[currentMatch - 1]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // prevent ProseMirror from capturing
    if (e.key === "Escape") closeWithRange();
    else if (e.key === "Enter") {
      e.preventDefault();
      navigateMatch(e.shiftKey ? -1 : 1);
    } else if (e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      setCaseSensitive((v) => !v);
    } else if (e.altKey && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      setUseRegex((v) => !v);
    }
  };

  if (!visible) return null;

  const empty = !!query && !invalid && matchCount === 0;
  const status = !query ? "" : invalid ? "Invalid pattern" : matchCount === 0 ? "No results" : `${currentMatch} of ${matchCount}`;

  return (
    <>
      <div className={`search-bar${empty || invalid ? " is-empty" : ""}`} role="search">
        <Search size={14} className="search-icon" aria-hidden />
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in document"
          aria-label="Find in document"
          aria-invalid={invalid || undefined}
          spellCheck={false}
        />
        <span className="search-count" aria-live="polite">{status}</span>
        <span className="search-sep" aria-hidden />
        <button
          className={`search-toggle ${caseSensitive ? "search-toggle-active" : ""}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="Match case (Alt+C)"
          aria-label="Match case"
          aria-pressed={caseSensitive}
        ><CaseSensitive size={16} /></button>
        <button
          className={`search-toggle ${useRegex ? "search-toggle-active" : ""}`}
          onClick={() => setUseRegex(!useRegex)}
          title="Use regular expression (Alt+R)"
          aria-label="Use regular expression"
          aria-pressed={useRegex}
        ><Regex size={16} /></button>
        <button className="search-nav" onClick={() => navigateMatch(-1)} disabled={!matchCount} title="Previous match (Shift+Enter)" aria-label="Previous match">
          <ChevronUp size={16} />
        </button>
        <button className="search-nav" onClick={() => navigateMatch(1)} disabled={!matchCount} title="Next match (Enter)" aria-label="Next match">
          <ChevronDown size={16} />
        </button>
        <button className="search-close" onClick={closeWithRange} title="Close (Esc)" aria-label="Close search">
          <X size={16} />
        </button>
      </div>
      {ticks.length > 0 && (
        <div className="search-ruler" aria-hidden style={rulerBox()}>
          {ticks.map((t, i) => (
            <span key={i} className={i === currentMatch - 1 ? "is-active" : undefined} style={{ top: `${t * 100}%` }} />
          ))}
        </div>
      )}
    </>
  );
}

/** The scrollbar track of the editor, where the match markers sit. */
function rulerBox(): React.CSSProperties {
  const r = document.querySelector<HTMLElement>(".editor-container")?.getBoundingClientRect();
  return r ? { top: r.top, height: r.height, left: r.right - 10 } : {};
}

/** Position of each match along the scrollable document, 0–1 (scrollbar markers). */
function tickPositions(ranges: Range[]): number[] {
  const box = document.querySelector<HTMLElement>(".editor-container");
  if (!box || !box.scrollHeight) return [];
  const top = box.getBoundingClientRect().top - box.scrollTop;
  return ranges.map((r) => Math.min(1, Math.max(0, (r.getBoundingClientRect().top - top) / box.scrollHeight)));
}

function applyHighlights(ranges: Range[], activeIndex: number, scroll: boolean) {
  if (ranges.length === 0) return;
  clearMarkElements();

  if (supportsHighlightAPI) {
    const highlights = (CSS as any).highlights as Map<string, Highlight>;
    const inactive = ranges.filter((_, i) => i !== activeIndex);
    if (inactive.length > 0) highlights.set("search-match", new Highlight(...inactive));
    if (ranges[activeIndex]) highlights.set("search-match-active", new Highlight(ranges[activeIndex]));
  } else {
    for (let i = ranges.length - 1; i >= 0; i--) {
      try {
        const mark = document.createElement("mark");
        mark.className = i === activeIndex ? "search-mark-active" : "search-mark";
        mark.dataset.searchMark = "true";
        ranges[i].surroundContents(mark);
      } catch { /* skip cross-boundary ranges */ }
    }
  }
  if (scroll && ranges[activeIndex]) scrollToRange(ranges[activeIndex]);
}

function clearAllHighlights() {
  if (supportsHighlightAPI) {
    const highlights = (CSS as any).highlights as Map<string, Highlight> | undefined;
    highlights?.delete("search-match");
    highlights?.delete("search-match-active");
  }
  clearMarkElements();
}

function clearMarkElements() {
  document.querySelectorAll("[data-search-mark]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
}

/** Bring the active match to the upper third of the view, clear of sticky headings and the bar. */
function scrollToRange(range: Range) {
  const rect = range.getBoundingClientRect();
  const container = document.querySelector(".editor-container");
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const stickyEl = container.querySelector(".sticky-headings");
  const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
  const visibleTop = containerRect.top + stickyHeight + 48;
  if (rect.top >= visibleTop && rect.bottom <= containerRect.bottom - 24) return;
  const offset = rect.top - containerRect.top + container.scrollTop - Math.max(stickyHeight + 48, container.clientHeight / 3);
  container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
}
