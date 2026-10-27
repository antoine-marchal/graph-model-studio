/**
 * Navigator, Slides Studio's left rail. Plan: headings in document flow (move a heading's whole
 * part up / down, right-click for more). Pages: the derived pages as thumbnails with their first
 * heading and section. Headings are read on idle, never during a keystroke.
 */
import React from "react";
import type { Editor } from "@tiptap/core";
import { studio, useStudio } from "./store";
import { selectBlockAt } from "./actions";
import { useEditorDerived } from "./hooks";
import { Icon } from "./icons";
import { Seg, tr } from "./ui";

interface Heading {
  pos: number;
  level: number;
  text: string;
  end: number;
}

function headings(editor: Editor): Heading[] {
  const out: Heading[] = [];
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name === "heading") out.push({ pos, level: n.attrs.level, text: n.textContent, end: 0 });
  });
  const size = editor.state.doc.content.size;
  out.forEach((h, i) => {
    const next = out.slice(i + 1).find((x) => x.level <= h.level);
    h.end = next ? next.pos : size;
  });
  return out;
}

/** Move a heading's part (heading + content up to the next heading of its level or above) past its sibling. */
function moveSection(editor: Editor, list: Heading[], i: number, dir: -1 | 1): void {
  const h = list[i];
  const siblings = list.filter((x) => x.level === h.level);
  const other = siblings[siblings.indexOf(h) + dir];
  if (!other) return;
  const slice = editor.state.doc.slice(h.pos, h.end);
  const t = editor.state.tr.delete(h.pos, h.end);
  t.insert(dir < 0 ? other.pos : t.mapping.map(other.end), slice.content);
  editor.view.dispatch(t.scrollIntoView());
}

export function NavPanel({ editor }: { editor: Editor }) {
  const mode = useStudio((s) => s.navMode);
  const pageView = useStudio((s) => s.pageView);
  return (
    <nav className="navigator ms-navigator" aria-label={tr("Navigation", "Navigation")} data-testid="navigator">
      <div className="ms-nav-head">
        <Seg label={tr("Navigation", "Navigation")} value={mode} onChange={(navMode) => studio.set({ navMode })}
          options={[{ id: "outline", icon: "bulletList", label: tr("Plan", "Outline") }, { id: "pages", icon: "pages", label: tr("Pages", "Pages") }]} />
      </div>
      {mode === "outline" || !pageView ? <Outline editor={editor} /> : <Pages editor={editor} />}
    </nav>
  );
}

function Outline({ editor }: { editor: Editor }) {
  const list = useEditorDerived(editor, headings, true) ?? [];
  const at = useEditorDerived(editor, (e) => {
    const from = e.state.selection.from;
    let pos = -1;
    e.state.doc.forEach((n, p) => {
      if (n.type.name === "heading" && p <= from) pos = p;
    });
    return pos;
  });
  if (!list.length)
    return (
      <div className="ms-nav-empty">
        <Icon name="heading" size={20} />
        <p>{tr("Les titres du document apparaissent ici.", "The document's headings appear here.")}</p>
        <p className="hint">{tr("Accueil › Styles › Titre 1", "Home › Styles › Heading 1")}</p>
      </div>
    );
  return (
    <ol className="ms-outline" role="tree" aria-label={tr("Plan", "Outline")}>
      {list.map((h, i) => (
        <li key={h.pos} role="treeitem" aria-level={h.level} aria-current={h.pos === at || undefined} className={`ms-outline-row lvl-${h.level}${h.pos === at ? " is-current" : ""}`} style={{ paddingLeft: 8 + (h.level - 1) * 14 }}>
          <button type="button" className="ms-outline-item" onClick={() => selectBlockAt(h.pos)} title={h.text}
            onContextMenu={(e) => (e.preventDefault(), studio.set({ contextMenu: { x: e.clientX, y: e.clientY, target: { kind: "outline", pos: h.pos } } }))}>
            {h.text || <em className="hint">{tr("(titre vide)", "(empty heading)")}</em>}
          </button>
          <span className="layer-tools">
            <button type="button" className="layer-tool" aria-label={tr(`Monter « ${h.text} »`, `Move “${h.text}” up`)} onClick={() => moveSection(editor, list, i, -1)}><Icon name="prev" size={12} /></button>
            <button type="button" className="layer-tool" aria-label={tr(`Descendre « ${h.text} »`, `Move “${h.text}” down`)} onClick={() => moveSection(editor, list, i, 1)}><Icon name="next" size={12} /></button>
          </span>
        </li>
      ))}
    </ol>
  );
}

const THUMB = 150;

function Pages({ editor }: { editor: Editor }) {
  const layout = useStudio((s) => s.layout);
  const current = useStudio((s) => s.currentPage);
  const sections = useStudio((s) => s.sections);
  // First heading of each page, read from the DOM after layout settles.
  const firsts = useEditorDerived(editor, (e) => {
    const l = studio.get().layout;
    if (!l) return [] as string[];
    const root = e.view.dom.getBoundingClientRect();
    const zoom = studio.get().zoom || 1;
    const marks = headings(e).map((h) => {
      const dom = e.view.nodeDOM(h.pos) as HTMLElement | null;
      return { text: h.text, level: h.level, y: dom ? (dom.getBoundingClientRect().top - root.top) / zoom : -1 };
    });
    return l.pages.map((p) => marks.filter((m) => m.y >= p.top && m.y < p.top + p.height).map((m) => `${m.level}|${m.text}`).slice(0, 3).join("\n"));
  }, true);
  if (!layout) return null;
  return (
    <ol className="slide-list" aria-label={tr("Pages", "Pages")}>
      {layout.pages.map((p, i) => {
        const k = THUMB / p.width;
        const lines = (firsts?.[i] ?? "").split("\n").filter(Boolean).map((x) => ({ level: Number(x.split("|")[0]), text: x.slice(x.indexOf("|") + 1) }));
        return (
          <li key={i} className={`slide-item${current === i + 1 ? " is-current" : ""}`}>
            <button type="button" className="slide-button" aria-current={current === i + 1} aria-label={tr(`Page ${p.number}`, `Page ${p.number}`)}
              onClick={() => window.dispatchEvent(new CustomEvent("ms:scrollToPage", { detail: i }))}
              onContextMenu={(e) => (e.preventDefault(), studio.set({ contextMenu: { x: e.clientX, y: e.clientY, target: { kind: "page", page: i } } }))}>
              <span className="slide-num">{p.number}</span>
              <div className="thumb ms-page-thumb" style={{ width: THUMB, height: p.height * k }}>
                <div className="ms-thumb-body" style={{ top: p.margins.top * k, left: p.margins.left * k, right: p.margins.right * k, bottom: p.margins.bottom * k }}>
                  {lines.map((l, j) => <span key={j} className={`ms-thumb-h lvl-${Math.min(l.level, 3)}`}>{l.text}</span>)}
                  <span className="ms-thumb-text" />
                </div>
              </div>
            </button>
            <div className="slide-meta">
              <span className="slide-layout">{p.firstOfSection && i > 0 ? `§ ${p.section + 1} · ${sections[p.section]?.master?.name ?? ""}` : lines[0]?.text ?? ""}</span>
              {layout.overflows.some((o) => o.page === i) && <span className="badge badge-warn" title={tr("Contenu plus haut que la page", "Content taller than the page")}>!</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
