/**
 * Paper behind the single editor view: page sheets from the pagination pass, header / footer
 * stories with their fields filled in, recurring master drawings, text boundaries and overflow
 * marks; in master edit mode the master's own objects become selectable, movable and resizable on
 * the page (one edit on release). Rulers sit on the paper: drag the margins (document, section or
 * master) and the paragraph indents. Page sheets are memoized: typing never re-renders them.
 */
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { fillFields, storyFor, type ResolvedSection } from "../../document/masters";
import { storyGroupId } from "../../document/groups";
import { isAutoField, placeholderKey, placeholderPrompt, placeholderValue, type AutoField } from "../../document/placeholders";
import { resolveColor } from "../../document/styles";
import type { Margins, MasterDef, ObjectDescriptor, StoryDef, StorySet } from "../../document/schema";
import { ptToPx, pxToPt } from "../../document/units";
import { shapeSvg } from "./ObjectView";
import { studio, useStudio, type PageBox } from "./store";
import { currentBlock, currentSectionBreak, getEditor, setBlockProps, setPageSetup, setSectionProps, updateMaster, updateMasterObjects, updateMeta, setGroupText } from "./actions";
import { parseBlockProps } from "../extensions/StudioNodes";
import { useEditorDerived } from "./hooks";
import { tr } from "./ui";

const md = unified().use(remarkParse).use(remarkRehype).use(rehypeStringify);
const htmlCache = new Map<string, string>();
/** Story Markdown → HTML, cached (headers repeat on every page). */
function storyHtml(markdown: string): string {
  let html = htmlCache.get(markdown);
  if (html === undefined) {
    html = String(md.processSync(markdown));
    if (htmlCache.size > 400) htmlCache.clear();
    htmlCache.set(markdown, html);
  }
  return html;
}

interface Values {
  title: string;
  total: number;
  fields: Record<string, string>;
}

function autoFieldText(key: AutoField, page: number, v: Values): string {
  if (key === "date") return new Date().toLocaleDateString(document.documentElement.lang || undefined, { year: "numeric", month: "long", day: "numeric" });
  return String(key === "page" ? page : v.total);
}

/** The document fills a text placeholder: its text is the `::: <key>` group, the key is listed in `placeholders`. */
function setPlaceholderValue(placeholder: string, value: string): void {
  const key = placeholderKey(placeholder);
  setGroupText(key, value, (m) => {
    const fields = { ...m.fields };
    delete fields[key];
    const keys = (m.placeholders ?? []).filter((k) => k !== key);
    if (value) keys.push(key);
    return { ...m, fields: Object.keys(fields).length ? fields : undefined, placeholders: keys.length ? keys : undefined };
  }, true);
}

function boxStyle(d: ObjectDescriptor, page: PageBox): React.CSSProperties {
  const relPage = d.relativeTo === "page";
  return {
    left: (relPage ? 0 : page.margins.left) + ptToPx(d.box.x),
    top: (relPage ? 0 : page.margins.top) + ptToPx(d.box.y),
    width: Math.max(1, ptToPx(d.box.width)),
    height: Math.max(1, ptToPx(d.box.height)),
    zIndex: d.plane === "behind" ? 0 : 2,
    transform: d.rotation ? `rotate(${d.rotation}deg)` : undefined,
  };
}

/**
 * Text of a master box. Text placeholders show the document's value (or a prompt, screen only);
 * in a document they are typed in place, as in Slides Studio. Automatic fields show their value.
 * In master edit, a double-click edits the box's own text (a placeholder's prompt): one master
 * change; the documents' values are never touched.
 */
function TextContent({ id, d, page, values, theme, master }: { id: string; d: ObjectDescriptor; page: number; values: Values; theme: any; master: boolean }) {
  const [editing, setEditing] = useState(false);
  const ph = d.placeholder;
  const fillable = !!ph && !isAutoField(ph) && !master;
  const masterText = master && !(ph && isAutoField(ph));
  const initial = () => (master ? d.text ?? (ph ? placeholderPrompt(ph) : "") : value);
  const value = ph ? (isAutoField(ph) ? autoFieldText(ph, page, values) : placeholderValue(ph, values.fields, values.title)) : d.text ? fillFields(d.text, { page, pages: values.total, title: values.title, fields: values.fields }) : "";
  const prompt = ph && !isAutoField(ph) && !value;
  const color = resolveColor(d.style?.color, theme);
  const style: React.CSSProperties = {
    color: color ? `#${color}` : undefined,
    fontSize: d.style?.fontSize ? `${d.style.fontSize}pt` : undefined,
    textAlign: d.style?.align,
    justifyContent: d.style?.valign === "middle" ? "center" : d.style?.valign === "bottom" ? "flex-end" : "flex-start",
    padding: d.style?.padding !== undefined ? ptToPx(d.style.padding) : 4,
  };
  return (
    <div
      className={`ms-furniture-text${ph ? " is-placeholder" : ""}${prompt ? " is-prompt" : ""}${fillable ? " is-fillable" : ""}${editing ? " is-editing" : ""}`}
      style={style}
      title={fillable && !editing ? tr("Cliquer pour saisir le texte de ce document", "Click to type this document's text") : undefined}
      onMouseDown={(e) => fillable && !editing && (e.preventDefault(), e.stopPropagation(), setEditing(true))}
      onDoubleClick={(e) => masterText && !editing && (e.stopPropagation(), setEditing(true))}
    >
      {editing ? (
        <span
          className="ms-furniture-input"
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          role="textbox"
          aria-label={master ? tr("Texte du masque", "Master text") : placeholderPrompt(ph!, d.text)}
          ref={(el) => {
            if (el && document.activeElement !== el) {
              el.focus();
              getSelection()?.selectAllChildren(el);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              if (e.key === "Escape") e.currentTarget.textContent = initial();
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            setEditing(false);
            const next = (e.currentTarget.textContent ?? "").trim();
            if (next === initial()) return;
            if (master) updateMasterObjects({ [id]: { text: next || undefined } });
            else setPlaceholderValue(ph!, next);
          }}
        >
          {initial()}
        </span>
      ) : (
        <span>{prompt ? placeholderPrompt(ph!, d.text) : value}</span>
      )}
    </div>
  );
}

/** One recurring drawing: shape / picture with its text, or a placeholder. */
function Furniture({ id, d, page, pageNo, assetBase, theme, values, editable, selected, master }: { id: string; d: ObjectDescriptor; page: PageBox; pageNo: number; assetBase?: string; theme: any; values: Values; editable?: boolean; selected?: boolean; master: boolean }) {
  const style = boxStyle(d, page);
  const fillable = !!d.placeholder && !isAutoField(d.placeholder) && !master;
  const cls = `ms-furniture${editable ? " is-editable" : ""}${selected ? " is-selected" : ""}${d.placeholder ? " is-placeholder" : ""}${fillable ? " is-fillable" : ""}`;
  if (d.type === "image" && d.src) return <img className={cls} data-id={id} style={style} src={assetBase ? `${assetBase}/${d.src}` : d.src} alt={d.alt ?? ""} draggable={false} />;
  const w = ptToPx(d.box.width);
  const h = ptToPx(d.box.height);
  const hasShape = d.type === "shape" || d.style?.fill || d.style?.line;
  return (
    <div className={cls} data-id={id} style={fillable ? { ...style, zIndex: 3 } : style}>
      {hasShape && <span className="ms-furniture-shape" ref={(el) => el?.replaceChildren(shapeSvg(d, w, h, theme))} />}
      {(d.type === "textbox" || d.text || d.placeholder) && <TextContent id={id} d={d} page={pageNo} values={values} theme={theme} master={master} />}
    </div>
  );
}

type StoryKind = "headers" | "footers";

const PageSheet = memo(function PageSheet({ p, sec, values, assetBase, boundaries, overflow, editing, onEdit, master, masterSel }: {
  p: PageBox;
  sec: ResolvedSection | undefined;
  values: Values;
  assetBase?: string;
  boundaries: boolean;
  overflow: boolean;
  editing: StoryKind | null;
  onEdit: (page: number, kind: StoryKind | null, variant?: keyof StorySet, value?: string | null) => void;
  master: MasterDef | null;
  masterSel: string[];
}) {
  const evenAndOdd = !!sec?.chain.some((m) => m.evenAndOdd);
  const opts = { firstOfSection: p.firstOfSection, titlePage: !!sec?.titlePage, pageNumber: p.number, evenAndOdd };
  const variant: keyof StorySet = opts.firstOfSection && opts.titlePage ? "first" : evenAndOdd && p.number % 2 === 0 ? "even" : "default";
  const header = sec ? storyFor(sec.headers, opts) : undefined;
  const footer = sec ? storyFor(sec.footers, opts) : undefined;
  const theme = sec?.sheet.theme;
  const own = master?.background ?? {};
  const story = (s: StoryDef | undefined, kind: StoryKind) => {
    const isEditing = editing === kind;
    const style: React.CSSProperties = kind === "headers" ? { top: p.margins.header, left: p.margins.left, right: p.margins.right } : { bottom: p.margins.footer, left: p.margins.left, right: p.margins.right };
    const label = kind === "headers" ? tr("En-tête", "Header") : tr("Pied de page", "Footer");
    const origin = sec?.storyOrigin === "linked" ? tr(" — lié à la section précédente", " — linked to the previous section") : sec?.storyOrigin === "master" ? tr(" — du masque", " — from the master") : "";
    return (
      <div className={`ms-story ms-story-${kind}${isEditing ? " is-editing" : ""}${s?.markdown ? "" : " is-empty"}`} style={style} data-label={`${label}${origin}`} onDoubleClick={() => onEdit(p.index, kind, variant)} title={tr(`Double-cliquer pour modifier : ${label.toLowerCase()}${origin}`, `Double-click to edit the ${label.toLowerCase()}${origin}`)}>
        {isEditing ? (
          <StoryEditor initial={s?.markdown ?? ""} kind={kind} variant={variant} master={!!master} onDone={(value) => onEdit(p.index, null, variant, value === (s?.markdown ?? "") ? null : value)} />
        ) : s?.markdown ? (
          <div className={`ms-story-text${s.block?.style ? ` ms-s-${s.block.style}` : ""}`} style={{ textAlign: s.block?.align as React.CSSProperties["textAlign"] }} dangerouslySetInnerHTML={{ __html: storyHtml(fillFields(s.markdown, { page: p.number, pages: values.total, title: values.title, fields: values.fields })) }} />
        ) : (
          <div className="ms-story-empty">{label}</div>
        )}
      </div>
    );
  };
  return (
    <div className="ms-page" style={{ top: p.top, left: p.left, width: p.width, height: p.height }} data-page={p.index + 1}>
      {theme && [...Object.entries(sec?.background ?? {}), ...Object.entries(header?.objects ?? {}), ...Object.entries(footer?.objects ?? {})].filter(([id]) => !(id in own)).map(([id, d]) => (
        <Furniture key={id} id={id} d={d} page={p} pageNo={p.number} assetBase={assetBase} theme={theme} values={values} master={!!master} />
      ))}
      {theme && master && Object.entries(own).map(([id, d]) => (
        <Furniture key={id} id={id} d={d} page={p} pageNo={p.number} assetBase={assetBase} theme={theme} values={values} editable selected={masterSel.includes(id)} master />
      ))}
      {(boundaries || master) && <div className="ms-margin-guide" style={{ top: p.margins.top, left: p.margins.left, right: p.margins.right, bottom: p.margins.bottom }} />}
      {story(header, "headers")}
      {story(footer, "footers")}
      {overflow && <div className="ms-overflow-mark" title={tr("Contenu plus haut que la page : réduisez-le, scindez-le ou changez la taille de page", "Content taller than the page: scale it, split it or change the page size")}>{tr("Débordement", "Overflow")}</div>}
    </div>
  );
});

export function PageLayer({ editor }: { editor: Editor }) {
  const layout = useStudio((s) => s.layout);
  const sections = useStudio((s) => s.sections);
  const metaFields = useStudio((s) => s.meta?.fields);
  const placeholders = useStudio((s) => s.meta?.placeholders);
  const groupTexts = useStudio((s) => s.groupTexts);
  const title = useStudio((s) => s.title);
  const assetBases = useStudio((s) => s.assetBases);
  const boundaries = useStudio((s) => s.showBoundaries);
  const master = useStudio((s) => s.masterEdit);
  const masterSel = useStudio((s) => s.masterSel);
  const [editing, setEditing] = useState<{ page: number; kind: StoryKind } | null>(null);
  const total = layout?.pages.length ?? 0;
  const values = useMemo<Values>(() => {
    const out: Record<string, string> = {};
    for (const m of sections[0]?.chain ?? []) for (const [k, f] of Object.entries(m.fields ?? {})) if (f.default) out[k] = f.default;
    for (const k of placeholders ?? []) if (groupTexts[k] !== undefined) out[k] = groupTexts[k];
    return { title, total, fields: { ...metaFields, ...out } };
  }, [sections, metaFields, placeholders, groupTexts, title, total]);

  // Ribbon / context menu: edit the header or footer of the current page, optionally adding a field.
  useEffect(() => {
    const on = (e: Event) => {
      const [kind, field] = String((e as CustomEvent<string>).detail).split(":") as [StoryKind, string | undefined];
      const page = Math.max(0, studio.get().currentPage - 1);
      if (field) appendField(page, kind, field);
      else setEditing({ page, kind });
    };
    window.addEventListener("ms:editStory", on);
    return () => window.removeEventListener("ms:editStory", on);
  });

  const commitStory = (page: number, kind: StoryKind, variant: keyof StorySet, value: string) => {
    const m = studio.get().masterEdit;
    if (m) return updateMaster({ [kind]: { ...m[kind], [variant]: { ...(m[kind]?.[variant] ?? {}), markdown: value } } } as Partial<MasterDef>);
    // Document story: its text is the `::: header` / `::: footer-first`… group, the frontmatter names it.
    const id = storyGroupId(kind, variant);
    setGroupText(id, value, (x) => {
      const story = { ...x[kind]?.[variant], id };
      delete story.markdown;
      return { ...x, [kind]: { ...x[kind], [variant]: story } };
    });
    void page;
  };
  const appendField = (page: number, kind: StoryKind, field: string) => {
    const p = studio.get().layout?.pages[page];
    const sec = p && studio.get().sections[p.section];
    if (!p || !sec) return;
    const evenAndOdd = !!sec.chain.some((m) => m.evenAndOdd);
    const variant: keyof StorySet = p.firstOfSection && sec.titlePage ? "first" : evenAndOdd && p.number % 2 === 0 ? "even" : "default";
    const current = storyFor(sec[kind], { firstOfSection: p.firstOfSection, titlePage: sec.titlePage, pageNumber: p.number, evenAndOdd })?.markdown ?? "";
    const token = field === "page" ? "{{page}}" : field === "pages" ? "{{pages}}" : field === "title" ? "{{title}}" : `{{field:${field}}}`;
    commitStory(page, kind, variant, current ? `${current} ${token}` : token);
  };
  const onEdit = (page: number, kind: StoryKind | null, variant?: keyof StorySet, value?: string | null) => {
    if (kind) return setEditing({ page, kind });
    setEditing(null);
    if (value != null && variant && editing) commitStory(page, editing.kind, variant, value);
  };

  if (!layout) return null;
  return (
    <div className={`ms-page-layer${master ? " is-master-edit" : ""}`} style={{ width: layout.width, height: layout.height }}>
      {layout.pages.map((p) => {
        const sec = sections[p.section];
        const owner = sec?.chain[sec.chain.length - 1]?.id;
        return (
          <PageSheet key={p.index} p={p} sec={sec} values={values} assetBase={owner ? assetBases[owner] : undefined} boundaries={boundaries} overflow={layout.overflows.some((o) => o.page === p.index)}
            editing={editing?.page === p.index ? editing.kind : null} onEdit={onEdit} master={master} masterSel={masterSel} />
        );
      })}
      {master && <MasterObjectTool editor={editor} />}
    </div>
  );
}

/**
 * Ribbon inline formats while a header / footer is edited: the Markdown `marker` around the
 * selection (again: removed). `null`: a format stories do not have, ignored. False when no story
 * is being edited (the command goes to the document).
 */
export function storyWrap(marker: string | null): boolean {
  const ta = document.activeElement;
  if (!(ta instanceof HTMLTextAreaElement) || !ta.closest(".ms-story-editor")) return false;
  if (!marker) return true;
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const inner = value.slice(a, b);
  const on = inner.length >= 2 * marker.length && inner.startsWith(marker) && inner.endsWith(marker);
  ta.setRangeText(on ? inner.slice(marker.length, -marker.length) : `${marker}${inner}${marker}`, a, b, "select");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function StoryEditor({ initial, kind, variant, master, onDone }: { initial: string; kind: StoryKind; variant: keyof StorySet; master: boolean; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <div className="ms-story-editor" onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <textarea
        className="ms-story-input"
        data-kind={kind}
        data-variant={variant}
        autoFocus
        rows={2}
        aria-label={kind === "headers" ? tr("Texte de l’en-tête (Markdown)", "Header text (Markdown)") : tr("Texte du pied de page (Markdown)", "Footer text (Markdown)")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Leaving from the keyboard goes back to the document text.
          if (e.key === "Escape") (e.preventDefault(), finish(null), getEditor()?.view.focus());
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) (e.preventDefault(), finish(value), getEditor()?.view.focus());
        }}
        onBlur={() => finish(value)}
      />
      <div className="ms-story-hint">
        {master ? tr("Masque", "Master") : tr("Document", "Document")} · <kbd>Ctrl+Entrée</kbd> {tr("valider", "save")} · <kbd>Échap</kbd> {tr("annuler", "cancel")} · {"{{page}} {{pages}} {{title}} {{field:nom}}"}
      </div>
    </div>
  );
}

/* Master objects on the canvas ------------------------------------------- */

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

/**
 * Pointer handling for the edited master's objects (on any page: they repeat on every page).
 * Move and resize are transient (CSS) until release, which commits one master change.
 */
function MasterObjectTool({ editor }: { editor: Editor }) {
  const sel = useStudio((s) => s.masterSel);
  const master = useStudio((s) => s.masterEdit);
  const layout = useStudio((s) => s.layout);
  const [frame, setFrame] = useState<{ page: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  // Master objects repeat on every page: handles go on the page last pressed (else the current one).
  const [pressedPage, setPressedPage] = useState<number | null>(null);
  const drag = useRef<null | { ids: string[]; handle?: string; sx: number; sy: number; start: Record<string, ObjectDescriptor["box"]>; page: Element | null; moved: boolean }>(null);
  void editor;

  useEffect(() => {
    const layer = document.querySelector(".ms-page-layer");
    if (!layer) return;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      // Text being edited in a master box: the pointer selects text.
      if (t.closest(".ms-furniture-input")) return;
      const handle = t.closest<HTMLElement>(".ms-master-handle");
      const pageEl = t.closest<HTMLElement>(".ms-page");
      if (pageEl) setPressedPage(Number(pageEl.dataset.page) - 1);
      const obj = t.closest<HTMLElement>(".ms-furniture.is-editable");
      const m = studio.get().masterEdit;
      if (!m) return;
      if (!obj && !handle) {
        if (t.closest(".ms-story, .ms-story-editor")) return;
        if (t.closest(".ms-page")) studio.set({ masterSel: [] });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      let ids = studio.get().masterSel;
      if (obj) {
        const id = obj.dataset.id!;
        ids = e.shiftKey ? (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]) : ids.includes(id) ? ids : [id];
        studio.set({ masterSel: ids, tab: "format", pane: "format" });
      }
      const d = (id: string) => m.background?.[id];
      const movable = ids.filter((id) => d(id) && !d(id)!.locked?.geometry);
      if (!movable.length) return;
      drag.current = { ids: movable, handle: handle?.dataset.handle, sx: e.clientX, sy: e.clientY, start: Object.fromEntries(movable.map((id) => [id, { ...d(id)!.box }])), page: t.closest(".ms-page"), moved: false };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const zoom = studio.get().zoom || 1;
      const dx = pxToPt((e.clientX - g.sx) / zoom);
      const dy = pxToPt((e.clientY - g.sy) / zoom);
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 1) return;
      g.moved = true;
      for (const id of g.ids) {
        const b = next(g.start[id], dx, dy, g.handle, e.shiftKey);
        for (const el of document.querySelectorAll<HTMLElement>(`.ms-furniture.is-editable[data-id="${CSS.escape(id)}"]`)) {
          el.style.translate = `${ptToPx(b.x - g.start[id].x)}px ${ptToPx(b.y - g.start[id].y)}px`;
          el.style.width = `${Math.max(1, ptToPx(b.width))}px`;
          el.style.height = `${Math.max(1, ptToPx(b.height))}px`;
        }
      }
      setFrame(null);
    };
    const up = (e: PointerEvent) => {
      const g = drag.current;
      drag.current = null;
      if (!g?.moved) return;
      const zoom = studio.get().zoom || 1;
      const dx = pxToPt((e.clientX - g.sx) / zoom);
      const dy = pxToPt((e.clientY - g.sy) / zoom);
      for (const el of document.querySelectorAll<HTMLElement>(".ms-furniture.is-editable")) el.style.translate = "";
      const snap = (v: number) => (studio.get().snap ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100);
      updateMasterObjects(Object.fromEntries(g.ids.map((id) => {
        const b = next(g.start[id], dx, dy, g.handle, e.shiftKey);
        return [id, { box: { x: snap(b.x), y: snap(b.y), width: snap(b.width), height: snap(b.height) } }];
      })));
    };
    const key = (e: KeyboardEvent) => {
      const ids = studio.get().masterSel;
      const m = studio.get().masterEdit;
      if (!ids.length || !m || (e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        updateMasterObjects(Object.fromEntries(ids.map((id) => [id, null])));
        studio.set({ masterSel: [] });
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 7.2 : 0.72;
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key as "ArrowLeft"];
        updateMasterObjects(Object.fromEntries(ids.filter((id) => !m.background?.[id]?.locked?.geometry).map((id) => [id, { box: { ...m.background![id].box, x: m.background![id].box.x + dx, y: m.background![id].box.y + dy } }])));
      } else if (e.key === "Escape") studio.set({ masterSel: [] });
    };
    layer.addEventListener("pointerdown", down as EventListener, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      layer.removeEventListener("pointerdown", down as EventListener, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }, []);

  // Selection frame (with handles) on the current page for a single selected object.
  useEffect(() => {
    const d = sel.length === 1 ? master?.background?.[sel[0]] : undefined;
    const page = layout?.pages[pressedPage ?? Math.max(0, studio.get().currentPage - 1)];
    if (!d || !page) return setFrame(null);
    const s = boxStyle(d, page);
    setFrame({ page: page.index, rect: { x: page.left + Number(s.left), y: page.top + Number(s.top), w: Number(s.width), h: Number(s.height) } });
  }, [sel, master, layout, pressedPage]);

  if (!frame) return null;
  const d = master?.background?.[sel[0]];
  return (
    <div className={`ms-sel-frame ms-master-frame${d?.locked?.geometry ? " is-locked" : ""}`} style={{ left: frame.rect.x, top: frame.rect.y, width: frame.rect.w, height: frame.rect.h }}>
      {!d?.locked?.geometry && HANDLES.map((h) => <span key={h} className={`ms-handle ms-master-handle ms-handle-${h}`} data-handle={h} />)}
    </div>
  );
}

function next(b: ObjectDescriptor["box"], dx: number, dy: number, handle: string | undefined, keepRatio: boolean): ObjectDescriptor["box"] {
  if (!handle) return { ...b, x: b.x + dx, y: b.y + dy };
  let { x, y, width, height } = b;
  if (handle.includes("e")) width = Math.max(4, b.width + dx);
  if (handle.includes("s")) height = Math.max(0, b.height + dy);
  if (handle.includes("w")) (width = Math.max(4, b.width - dx), (x = b.x + b.width - width));
  if (handle.includes("n")) (height = Math.max(0, b.height - dy), (y = b.y + b.height - height));
  if (keepRatio && b.height > 0 && handle.length === 2) {
    const r = b.width / b.height;
    height = width / r;
    if (handle.includes("n")) y = b.y + b.height - height;
  }
  return { x, y, width, height };
}

/* Named styles as CSS ----------------------------------------------------- */

/** Named styles of the document (master → local overrides) as CSS for the paper view. */
export function StyleSheetCss() {
  const sheet = useStudio((s) => s.sections[0]?.sheet);
  const css = useMemo(() => {
    if (!sheet) return "";
    const theme = sheet.theme;
    const rules: string[] = [];
    const decl = (id: string) => {
      const s = sheet.styles.get(id);
      if (!s) return "";
      const r = s.run;
      const p = s.paragraph;
      const font = r.font === "theme.heading" ? theme.fonts.heading : r.font === "theme.body" ? theme.fonts.body : r.font;
      return [
        font && `font-family:"${font}",system-ui,sans-serif`,
        r.size && `font-size:${r.size}pt`,
        resolveColor(r.color, theme) && `color:#${resolveColor(r.color, theme)}`,
        r.bold !== undefined && `font-weight:${r.bold ? 700 : 400}`,
        r.italic !== undefined && `font-style:${r.italic ? "italic" : "normal"}`,
        r.underline && "text-decoration:underline",
        r.caps && "text-transform:uppercase",
        r.smallCaps && "font-variant:small-caps",
        p.align && `text-align:${p.align}`,
        p.spaceBefore !== undefined && `margin-top:${p.spaceBefore}pt`,
        p.spaceAfter !== undefined && `margin-bottom:${p.spaceAfter}pt`,
        p.lineSpacing && `line-height:${p.lineSpacing}`,
        p.indentLeft && `padding-left:${p.indentLeft}pt`,
        p.indentRight && `padding-right:${p.indentRight}pt`,
        p.firstLine && `text-indent:${p.firstLine}pt`,
      ]
        .filter(Boolean)
        .join(";");
    };
    const root = ".ms-paged .ProseMirror";
    rules.push(`${root}{${decl("Normal")}}`);
    rules.push(`${root} p{${decl("Normal")}}`);
    for (let n = 1; n <= 6; n++) rules.push(`${root} h${n}{${decl(`Heading${n}`)}}`);
    rules.push(`${root} blockquote{${decl("Quote")}}`);
    rules.push(`${root} pre{${decl("Code")}}`);
    for (const s of sheet.styles.values()) {
      if (s.type === "paragraph") rules.push(`${root} .ms-s-${CSS.escape(s.id)},.ms-story-text.ms-s-${CSS.escape(s.id)}{${decl(s.id)}}`, `.ms-style-preview.ms-s-${CSS.escape(s.id)}{${decl(s.id).replace(/(margin|padding)[^;]*;?|text-indent[^;]*;?|font-size:([\d.]+)pt/g, (m, _a, size) => (size ? `font-size:${Math.min(16, Math.max(11, Number(size) * 0.8))}px` : ""))}}`);
      if (s.type === "character") rules.push(`${root} .ms-cs-${CSS.escape(s.id)}{${decl(s.id)}}`);
    }
    return rules.join("\n");
  }, [sheet]);
  return <style>{css}</style>;
}

/* Rulers ------------------------------------------------------------------ */

type RulerDrag = { kind: "mLeft" | "mRight" | "mTop" | "mBottom" | "iLeft" | "iFirst" | "iRight"; start: number; sx: number; sy: number; value: number };

/** Margins of the page being edited: the master, the current section, or the document. */
function commitMargins(editor: Editor, patch: Partial<Margins>): void {
  const s = studio.get();
  if (s.masterEdit) return updateMaster({ page: { ...s.masterEdit.page, margins: { ...s.masterEdit.page.margins, ...patch } as Margins } });
  const section = currentSectionBreak(editor);
  const page = s.sections[s.layout?.pages[s.currentPage - 1]?.section ?? 0]?.page;
  const margins = { ...page?.margins, ...patch } as Margins;
  if (section) setSectionProps(section.pos, { ...section.props, margins });
  else setPageSetup({ margins });
}

const CM = 96 / 2.54;
const fmtCm = (px: number) => `${(px / CM).toFixed(2).replace(/\.?0+$/, "")} cm`;

/**
 * Word's rulers for the current page: drag a margin boundary (grey / white edge) or an indent
 * marker; the value shows while dragging and one edit is written on release. Double-click a
 * margin to open the page setup in the inspector.
 */
export function Ruler({ editor, vertical }: { editor: Editor; vertical?: boolean }) {
  const layout = useStudio((s) => s.layout);
  const current = useStudio((s) => s.currentPage);
  const zoom = useStudio((s) => s.zoom);
  const master = useStudio((s) => !!s.masterEdit);
  const props = useEditorDerived(editor, (e) => {
    const block = currentBlock(e.state);
    const p = parseBlockProps(block?.node.attrs.msBlock);
    return { indentLeft: p.indentLeft ?? 0, firstLine: p.firstLine ?? 0, indentRight: p.indentRight ?? 0, ok: !!block && "msBlock" in block.node.attrs };
  });
  const [drag, setDrag] = useState<RulerDrag | null>(null);
  const page = layout?.pages[Math.max(0, current - 1)];
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - drag.sx) / zoom;
      const dy = (e.clientY - drag.sy) / zoom;
      const delta = drag.kind === "mTop" || drag.kind === "mBottom" ? (drag.kind === "mTop" ? dy : -dy) : drag.kind === "mRight" || drag.kind === "iRight" ? -dx : dx;
      const snapped = e.altKey ? drag.start + delta : Math.round((drag.start + delta) / (CM / 4)) * (CM / 4);
      setDrag({ ...drag, value: drag.kind === "iFirst" ? snapped : Math.max(0, snapped) });
    };
    const up = () => {
      const v = pxToPt(drag.value);
      const r = Math.round(v * 100) / 100;
      if (Math.abs(drag.value - drag.start) > 0.5) {
        if (drag.kind === "mLeft") commitMargins(editor, { left: r });
        else if (drag.kind === "mRight") commitMargins(editor, { right: r });
        else if (drag.kind === "mTop") commitMargins(editor, { top: r });
        else if (drag.kind === "mBottom") commitMargins(editor, { bottom: r });
        else if (drag.kind === "iLeft") setBlockProps({ indentLeft: r || undefined });
        else if (drag.kind === "iRight") setBlockProps({ indentRight: r || undefined });
        else if (drag.kind === "iFirst") setBlockProps({ firstLine: r || undefined });
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, zoom, editor]);
  if (!page || !layout) return null;
  const m = page.margins;
  const val = (k: RulerDrag["kind"], v: number) => (drag?.kind === k ? drag.value : v);
  const L = val("mLeft", m.left);
  const R = val("mRight", m.right);
  const T = val("mTop", m.top);
  const B = val("mBottom", m.bottom);
  const iL = val("iLeft", ptToPx(props?.indentLeft ?? 0));
  const iF = val("iFirst", ptToPx(props?.firstLine ?? 0));
  const iR = val("iRight", ptToPx(props?.indentRight ?? 0));
  const start = (kind: RulerDrag["kind"], value: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ kind, start: value, value, sx: e.clientX, sy: e.clientY });
  };
  const hTicks = Array.from({ length: Math.floor(page.width / (CM / 4)) + 1 }, (_, i) => i);
  const vTicks = Array.from({ length: Math.floor(page.height / (CM / 4)) + 1 }, (_, i) => i);
  const tick = (i: number, origin: number, horizontal: boolean) => {
    const pos = (i * CM) / 4;
    const rel = Math.round((pos - origin) / (CM / 4));
    const major = rel % 4 === 0;
    const half = rel % 2 === 0;
    return (
      <span key={i} className={`ms-tick${major ? " is-major" : half ? " is-half" : ""}`} style={horizontal ? { left: pos * zoom } : { top: pos * zoom }}>
        {major && rel !== 0 ? Math.abs(rel / 4) : ""}
      </span>
    );
  };
  const hint = drag && (
    <span className="ms-ruler-hint" style={drag.kind === "mTop" || drag.kind === "mBottom" ? { top: (drag.kind === "mTop" ? T : page.height - B) * zoom, left: 24 } : { left: (drag.kind === "mLeft" ? L : drag.kind === "mRight" ? page.width - R : drag.kind === "iRight" ? page.width - R - iR : L + (drag.kind === "iFirst" ? iL + iF : iL)) * zoom, top: 24 }}>
      {fmtCm(drag.value)}
    </span>
  );
  if (vertical)
    return (
      <div className={`ms-vruler${drag ? " is-dragging" : ""}`} role="toolbar" aria-label={tr("Règle verticale", "Vertical ruler")} style={{ height: page.height * zoom, top: page.top * zoom, left: page.left * zoom - 22 }}>
        <div className="ms-ruler-margin" style={{ top: 0, height: T * zoom }} />
        <div className="ms-ruler-margin" style={{ bottom: 0, height: B * zoom }} />
        {vTicks.map((i) => tick(i, T, false))}
        <span className="ms-ruler-edge is-v" role="slider" aria-label={tr("Marge haute", "Top margin")} aria-valuetext={fmtCm(T)} title={tr("Marge haute", "Top margin")} style={{ top: T * zoom }} onPointerDown={start("mTop", m.top)} />
        <span className="ms-ruler-edge is-v" role="slider" aria-label={tr("Marge basse", "Bottom margin")} aria-valuetext={fmtCm(B)} title={tr("Marge basse", "Bottom margin")} style={{ top: (page.height - B) * zoom }} onPointerDown={start("mBottom", m.bottom)} />
        {hint}
      </div>
    );
  return (
      <div className={`ms-ruler${drag ? " is-dragging" : ""}`} role="toolbar" aria-label={tr("Règle horizontale", "Horizontal ruler")} style={{ width: page.width * zoom, marginLeft: `calc(50% - ${(layout.width * zoom) / 2 - page.left * zoom}px)` }}>
        <div className="ms-ruler-margin" style={{ left: 0, width: L * zoom }} />
        <div className="ms-ruler-margin" style={{ right: 0, width: R * zoom }} />
        {hTicks.map((i) => tick(i, L, true))}
        <span className="ms-ruler-edge" role="slider" aria-label={tr("Marge gauche", "Left margin")} aria-valuetext={fmtCm(L)} title={tr("Marge gauche", "Left margin")} style={{ left: L * zoom }} onPointerDown={start("mLeft", m.left)} />
        <span className="ms-ruler-edge" role="slider" aria-label={tr("Marge droite", "Right margin")} aria-valuetext={fmtCm(R)} title={tr("Marge droite", "Right margin")} style={{ left: (page.width - R) * zoom }} onPointerDown={start("mRight", m.right)} />
        {!master && props?.ok && (
          <>
            <span className="ms-indent ms-indent-first" role="slider" aria-label={tr("Retrait de première ligne", "First line indent")} title={tr("Retrait de première ligne", "First line indent")} style={{ left: (L + iL + iF) * zoom }} onPointerDown={start("iFirst", ptToPx(props.firstLine))} />
            <span className="ms-indent ms-indent-left" role="slider" aria-label={tr("Retrait gauche", "Left indent")} title={tr("Retrait gauche", "Left indent")} style={{ left: (L + iL) * zoom }} onPointerDown={start("iLeft", ptToPx(props.indentLeft))} />
            <span className="ms-indent ms-indent-right" role="slider" aria-label={tr("Retrait droit", "Right indent")} title={tr("Retrait droit", "Right indent")} style={{ left: (page.width - R - iR) * zoom }} onPointerDown={start("iRight", ptToPx(props.indentRight))} />
          </>
        )}
        {hint}
      </div>
  );
}

/* Zoom -------------------------------------------------------------------- */

/** Zoom never changes stored geometry or pagination. `manual`: the user chose it (no more auto-fit). */
export let manualZoom = false;
export const setZoom = (z: number, manual = false) => {
  if (manual) manualZoom = true;
  studio.set({ zoom: Math.min(3, Math.max(0.25, Math.round(z * 100) / 100)) });
};
/** Fit the page width or the whole page in the window (App measures the scroller). */
export const manualFit = (mode: "width" | "page") => {
  manualZoom = true;
  window.dispatchEvent(new CustomEvent("ms:fit", { detail: mode }));
};
