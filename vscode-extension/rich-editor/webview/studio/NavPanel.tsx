/**
 * Navigation rail. Outline: headings (document flow; reorder sections here, never by layer z).
 * Pages: derived page list with the headings each page starts with. Masters: the library —
 * apply to the document or the current section, create, duplicate, rename, edit, reimport, delete.
 */
import React, { useEffect, useMemo, useReducer, useState } from "react";
import type { Editor } from "@tiptap/core";
import { ArrowDown, ArrowUp, FileUp, Plus } from "lucide-react";
import { studio, useStudio } from "./store";
import { currentSectionBreak, selectBlockAt, setDocumentMaster, setSectionProps } from "./actions";
import { masterAction } from "./bridge";
import { PAGE_GAP } from "./pagination";

interface Heading {
  pos: number;
  level: number;
  text: string;
  end: number;
}

function headings(editor: Editor): Heading[] {
  const out: Heading[] = [];
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name === "heading") out.push({ pos, level: n.attrs.level, text: n.textContent || "(empty heading)", end: 0 });
  });
  const size = editor.state.doc.content.size;
  out.forEach((h, i) => {
    const next = out.slice(i + 1).find((x) => x.level <= h.level);
    h.end = next ? next.pos : size;
  });
  return out;
}

/** Move a heading's section (heading + content up to the next heading of its level or above) before / after its sibling. */
function moveSection(editor: Editor, list: Heading[], i: number, dir: -1 | 1): void {
  const h = list[i];
  const siblings = list.filter((x) => x.level === h.level);
  const k = siblings.indexOf(h);
  const other = siblings[k + dir];
  if (!other) return;
  const slice = editor.state.doc.slice(h.pos, h.end);
  const tr = editor.state.tr.delete(h.pos, h.end);
  const target = dir < 0 ? other.pos : tr.mapping.map(other.end);
  tr.insert(dir < 0 ? target : target, slice.content);
  editor.view.dispatch(tr.scrollIntoView());
}

export function NavPanel({ editor }: { editor: Editor }) {
  const tab = useStudio((s) => s.leftTab);
  const [, rerender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = () => {
      if (t) clearTimeout(t);
      t = setTimeout(rerender, 250);
    };
    editor.on("update", on);
    editor.on("selectionUpdate", on);
    return () => {
      editor.off("update", on);
      editor.off("selectionUpdate", on);
    };
  }, [editor]);
  return (
    <nav className="ms-nav" aria-label="Navigation">
      <div className="ms-tabs" role="tablist">
        {(["outline", "pages", "masters"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => studio.set({ leftTab: t })}>
            {t === "outline" ? "Outline" : t === "pages" ? "Pages" : "Masters"}
          </button>
        ))}
      </div>
      <div className="ms-nav-body" role="tabpanel">
        {tab === "outline" && <Outline editor={editor} />}
        {tab === "pages" && <Pages editor={editor} />}
        {tab === "masters" && <Masters editor={editor} />}
      </div>
    </nav>
  );
}

function Outline({ editor }: { editor: Editor }) {
  const list = headings(editor);
  const at = editor.state.selection.from;
  const current = [...list].reverse().find((h) => h.pos <= at);
  if (!list.length) return <p className="ms-empty">Headings appear here.</p>;
  return (
    <ul className="ms-outline">
      {list.map((h, i) => (
        <li key={h.pos} style={{ paddingLeft: (h.level - 1) * 12 }} className={h === current ? "is-current" : ""}>
          <button className="ms-outline-item" onClick={() => selectBlockAt(h.pos)} title={h.text}>
            {h.text}
          </button>
          <span className="ms-outline-actions">
            <button className="ms-icon" aria-label={`Move section "${h.text}" up`} onClick={() => moveSection(editor, list, i, -1)}>
              <ArrowUp size={12} />
            </button>
            <button className="ms-icon" aria-label={`Move section "${h.text}" down`} onClick={() => moveSection(editor, list, i, 1)}>
              <ArrowDown size={12} />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Pages({ editor }: { editor: Editor }) {
  const layout = useStudio((s) => s.layout);
  const current = useStudio((s) => s.currentPage);
  const sections = useStudio((s) => s.sections);
  // Headings starting on each page (from the DOM, cached per layout).
  const firstHeadings = useMemo(() => {
    if (!layout) return [];
    const root = editor.view.dom.getBoundingClientRect();
    const zoom = studio.get().zoom || 1;
    const marks = headings(editor).map((h) => {
      const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null;
      return { text: h.text, y: dom ? (dom.getBoundingClientRect().top - root.top) / zoom : -1 };
    });
    return layout.pages.map((p) => marks.find((m) => m.y >= p.top && m.y < p.top + p.height)?.text);
  }, [layout, editor]);
  if (!layout) return <p className="ms-empty">Turn on Page view to see pages.</p>;
  const scale = 140 / layout.width;
  return (
    <ol className="ms-pages">
      {layout.pages.map((p, i) => (
        <li key={i}>
          <button
            className={`ms-page-thumb${current === i + 1 ? " is-current" : ""}`}
            style={{ width: p.width * scale, height: p.height * scale }}
            onClick={() => window.dispatchEvent(new CustomEvent("ms:scrollToPage", { detail: i }))}
            aria-label={`Page ${p.number}${firstHeadings[i] ? `: ${firstHeadings[i]}` : ""}`}
          >
            <span className="ms-thumb-margins" style={{ top: p.margins.top * scale, left: p.margins.left * scale, right: p.margins.right * scale, bottom: p.margins.bottom * scale }} />
            <span className="ms-thumb-title">{firstHeadings[i] ?? ""}</span>
          </button>
          <span className="ms-thumb-label">
            {p.number}
            {p.firstOfSection && i > 0 ? ` · §${p.section + 1} ${sections[p.section]?.master?.name ?? ""}` : ""}
          </span>
        </li>
      ))}
      <li className="ms-muted" aria-hidden="true" style={{ height: PAGE_GAP }} />
    </ol>
  );
}

function Masters({ editor }: { editor: Editor }) {
  const entries = useStudio((s) => s.entries);
  const meta = useStudio((s) => s.meta);
  const masters = useStudio((s) => s.masters);
  const [busy, setBusy] = useState(false);
  const section = currentSectionBreak(editor);
  const activeId = section ? section.props.master ?? meta?.master : meta?.master;
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      return await masterAction(action, payload);
    } finally {
      setBusy(false);
    }
  };
  const apply = (id: string) => {
    if (section) setSectionProps(section.pos, { ...section.props, master: id, headers: "master" });
    else setDocumentMaster(id);
  };
  return (
    <div className="ms-masters">
      <div className="ms-row">
        <button className="ms-btn" disabled={busy} onClick={() => void run("import")} title="Import a corporate .docx / .dotx as masters">
          <FileUp size={14} /> Import Word template
        </button>
        <button className="ms-btn" disabled={busy} onClick={() => {
          const name = window.prompt("New master name", "New master");
          if (name) void run("create", { name, from: activeId });
        }}>
          <Plus size={14} /> New
        </button>
      </div>
      <p className="ms-muted">Applies to {section ? "the current section" : "the document (first section)"}.</p>
      <ul className="ms-master-list">
        {entries.map((e) => {
          const m = masters.find((x) => x.id === e.id);
          return (
            <li key={e.id} className={e.id === activeId ? "is-active" : ""}>
              <div className="ms-master-head">
                <MasterPreview id={e.id} />
                <div>
                  <strong>{e.name}</strong>
                  <div className="ms-muted">
                    {e.source === "starter" ? "Built-in" : e.source === "docx" ? `From ${m?.provenance?.file ?? "Word"}` : "Library"}
                    {e.basedOn ? ` · based on ${e.basedOn}` : ""}
                  </div>
                  {e.errors && <div className="ms-error">{e.errors.join("; ")}</div>}
                </div>
              </div>
              {e.description && <p className="ms-muted">{e.description}</p>}
              <div className="ms-row ms-wrap">
                <button className="ms-btn" disabled={!!e.errors} onClick={() => apply(e.id)} aria-pressed={e.id === activeId}>Apply</button>
                <button className="ms-btn" disabled={!m} onClick={() => m && studio.set({ masterEdit: e.readonly ? { ...structuredClone(m), id: `${m.id}-copy`, name: `${m.name} (copy)`, provenance: { source: "user" } } : structuredClone(m), rightTab: "format", rightOpen: true })}>
                  {e.readonly ? "Customize" : "Edit"}
                </button>
                <button className="ms-btn" onClick={() => {
                  const name = window.prompt("Name of the copy", `${e.name} copy`);
                  if (name) void run("duplicate", { id: e.id, name });
                }}>Duplicate</button>
                {!e.readonly && <button className="ms-btn" onClick={() => {
                  const name = window.prompt("Display name (the id stays the same)", e.name);
                  if (name) void run("rename", { id: e.id, name });
                }}>Rename</button>}
                {e.source === "docx" && <button className="ms-btn" onClick={() => void run("reimport", { id: e.id })}>Reimport</button>}
                {!e.readonly && <button className="ms-btn ms-danger" onClick={() => void run("delete", { id: e.id })}>Delete…</button>}
              </div>
              {m?.provenance?.report && <ImportReport items={m.provenance.report} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MasterPreview({ id }: { id: string }) {
  const m = useStudio((s) => s.masters.find((x) => x.id === id));
  const landscape = m?.page.orientation === "landscape";
  const accent = m?.theme?.colors.accent1 ?? "1F6BFF";
  return (
    <div className={`ms-master-preview${landscape ? " is-landscape" : ""}`} aria-hidden="true">
      <span style={{ background: `#${accent}`, height: m?.background ? 10 : 2 }} />
      <i />
      <i />
      <i />
    </div>
  );
}

function ImportReport({ items }: { items: { feature: string; status: string; detail?: string }[] }) {
  return (
    <details className="ms-import-report">
      <summary>Import report ({items.filter((i) => i.status !== "supported").length} not fully supported)</summary>
      <ul>
        {items.map((i, k) => (
          <li key={k} className={`ms-status-${i.status}`}>
            <span className="ms-badge">{i.status}</span> {i.feature}
            {i.detail && <div className="ms-muted">{i.detail}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
}
