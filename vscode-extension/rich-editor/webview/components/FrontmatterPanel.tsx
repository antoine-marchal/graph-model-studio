import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface FrontmatterPanelProps {
  /** YAML body without the `---` fences; null hides the panel. */
  value: string | null;
  readonly: boolean;
  onChange: (body: string | null) => void;
}

const COLLAPSED_KEY = "markdownStudio.frontmatterCollapsed";

function loadCollapsed(): boolean {
  try {
    // Hidden by default; expanding is remembered.
    return localStorage.getItem(COLLAPSED_KEY) !== "false";
  } catch {
    return true;
  }
}

/** One-line digest shown while collapsed: `title: X · date: Y · +2`. */
function summary(body: string): string {
  const keys = body.split(/\r?\n/).filter((l) => /^[^\s#][^:]*:/.test(l));
  const shown = keys.slice(0, 2).map((l) => l.trim());
  const more = keys.length - shown.length;
  return shown.join(" · ") + (more > 0 ? ` · +${more}` : "");
}

export function FrontmatterPanel({ value, readonly, onChange }: FrontmatterPanelProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Remembered across files and sessions (webview localStorage).
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, String(!c));
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  };

  // A freshly added block opens for editing (without changing the default).
  useEffect(() => {
    const open = () => setCollapsed(false);
    window.addEventListener("btrmk:expandFrontmatter", open);
    return () => window.removeEventListener("btrmk:expandFrontmatter", open);
  }, []);

  // Grow with content so the whole block stays visible without scrolling.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, collapsed]);

  if (value === null) return null;

  return (
    <div className={"frontmatter-panel" + (collapsed ? " collapsed" : "")}>
      <div className="frontmatter-header">
        <button
          className="frontmatter-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? "Show frontmatter" : "Hide frontmatter"}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="frontmatter-title">Frontmatter</span>
          {collapsed && <span className="frontmatter-summary">{summary(value)}</span>}
        </button>
        {!readonly && (
          <button
            className="frontmatter-remove"
            onClick={() => onChange(null)}
            title="Remove frontmatter"
            aria-label="Remove frontmatter"
          >
            ×
          </button>
        )}
      </div>
      {!collapsed && (
        <textarea
          ref={ref}
          className="frontmatter-input"
          value={value}
          readOnly={readonly}
          spellCheck={false}
          rows={1}
          placeholder="key: value"
          aria-label="YAML frontmatter"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
