/**
 * Inspector. Format: the selected object (geometry in pt, placement, wrap, plane, appearance,
 * locks) or the paragraph / character / section at the caret; the master designer replaces it in
 * master edit mode. Styles: provenance (master → style → local override) and Reset to master.
 * Layers: object planes and z-order. Review: preflight / export report and diagnostics.
 */
import React, { useEffect, useMemo, useReducer, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Eye, EyeOff, Lock, Unlock, ChevronRight, ChevronDown } from "lucide-react";
import { frontToBack, layerKey, layerTree, moveLayer, type LayerNode } from "../../../slides-studio/packages/core/src/groups";
import type { MasterDef, ObjectDescriptor, StyleDef } from "../../document/schema";
import { studio, useStudio, objectOf, notify } from "./store";
import {
  applyLayerOrder, currentSectionBreak, getSync, inlineObject, reorder, selectObject, setBlockProps, setPageSetup, setPlacement, setSectionProps, setStyleOverride, updateObjects,
} from "./actions";
import { parseBlockProps, setSpanStyle } from "../extensions/StudioNodes";
import { masterAction, refreshMasters, saveMaster } from "./bridge";
import { vscodeApi } from "../vscode-api";

function Num({ label, value, onCommit, step = 1, unit = "pt", disabled }: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void; step?: number; unit?: string; disabled?: boolean }) {
  const [text, setText] = useState(value === undefined ? "" : String(Math.round(value * 100) / 100));
  useEffect(() => setText(value === undefined ? "" : String(Math.round(value * 100) / 100)), [value]);
  const commit = () => {
    const n = text.trim() === "" ? undefined : Number(text);
    if (n === undefined || Number.isFinite(n)) onCommit(n);
  };
  return (
    <label className="ms-field">
      <span>{label}</span>
      <input type="number" step={step} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      <em>{unit}</em>
    </label>
  );
}

function Color({ label, value, onCommit }: { label: string; value: string | null | undefined; onCommit: (v: string | null) => void }) {
  const hex = value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : "#000000";
  return (
    <label className="ms-field">
      <span>{label}</span>
      <input type="color" value={hex} onChange={(e) => onCommit(e.target.value.slice(1).toUpperCase())} />
      <button className="ms-link" onClick={() => onCommit(null)} title="No color">None</button>
      {value?.startsWith("theme.") && <em>{value.slice(6)}</em>}
    </label>
  );
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="ms-isection">
      <h3>
        {title}
        {actions}
      </h3>
      {children}
    </section>
  );
}

export function Inspector({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const tab = useStudio((s) => s.rightTab);
  const masterEdit = useStudio((s) => s.masterEdit);
  const [, rerender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = () => {
      if (t) clearTimeout(t);
      t = setTimeout(rerender, 60);
    };
    editor.on("selectionUpdate", on);
    editor.on("transaction", on);
    return () => {
      editor.off("selectionUpdate", on);
      editor.off("transaction", on);
    };
  }, [editor]);
  return (
    <aside className="ms-inspector" aria-label="Inspector">
      <div className="ms-tabs" role="tablist">
        {(["format", "styles", "layers", "review"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => studio.set({ rightTab: t })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="ms-inspector-body" role="tabpanel">
        {tab === "format" && (masterEdit ? <MasterDesigner master={masterEdit} /> : <FormatPane editor={editor} readonly={readonly} />)}
        {tab === "styles" && <StylesPane editor={editor} />}
        {tab === "layers" && <LayersPane />}
        {tab === "review" && <ReviewPane />}
      </div>
    </aside>
  );
}

function FormatPane({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const selection = useStudio((s) => s.selection);
  const meta = useStudio((s) => s.meta);
  const id = selection[0];
  const d = id ? meta?.objects?.[id] : undefined;
  if (d && id) return <ObjectPane id={id} d={d} count={selection.length} readonly={readonly} />;
  return <TextPane editor={editor} readonly={readonly} />;
}

function ObjectPane({ id, d, count, readonly }: { id: string; d: ObjectDescriptor; count: number; readonly: boolean }) {
  const set = (patch: Partial<ObjectDescriptor>) => updateObjects({ [id]: patch });
  const box = (k: keyof ObjectDescriptor["box"]) => (v: number | undefined) => v !== undefined && set({ box: { ...d.box, [k]: Math.max(k === "width" || k === "height" ? 0 : -10000, v) } });
  const geometryLocked = !!d.locked?.geometry || readonly;
  return (
    <>
      <Section title={count > 1 ? `${count} objects (first shown)` : d.type === "image" ? "Picture" : d.type === "textbox" ? "Text box" : d.type === "connector" ? "Connector" : "Shape"}>
        <label className="ms-field ms-field-wide">
          <span>Name</span>
          <input defaultValue={d.name ?? ""} key={id} placeholder={id} onBlur={(e) => set({ name: e.target.value || undefined })} />
        </label>
        {d.type === "image" && <p className="ms-muted">Alt text comes from the Markdown image of the object body.</p>}
      </Section>
      {d.type !== "connector" && (
        <Section title="Size & position" actions={<em className="ms-unit">pt</em>}>
          <div className="ms-grid2">
            <Num label="X" value={d.box.x} onCommit={box("x")} disabled={geometryLocked} />
            <Num label="Y" value={d.box.y} onCommit={box("y")} disabled={geometryLocked} />
            <Num label="W" value={d.box.width} onCommit={box("width")} disabled={geometryLocked} />
            <Num label="H" value={d.box.height} onCommit={box("height")} disabled={geometryLocked} />
            <Num label="Rotation" unit="°" value={d.rotation ?? 0} onCommit={(v) => set({ rotation: v || undefined })} disabled={geometryLocked} />
          </div>
          <label className="ms-field ms-field-wide">
            <span>Placement</span>
            <select value={d.placement === "page" ? `page-${d.relativeTo ?? "margin"}` : "anchored"} disabled={geometryLocked} onChange={(e) => setPlacement(id, e.target.value === "anchored" ? "anchored" : "page", e.target.value === "page-page" ? "page" : "margin")}>
              <option value="anchored">Move with text (anchored to its paragraph)</option>
              <option value="page-margin">Fixed on the page, from the margins</option>
              <option value="page-page">Fixed on the page, from the edges</option>
            </select>
          </label>
          <p className="ms-muted">
            {d.placement === "anchored"
              ? "X from the column, Y from the anchor paragraph. The object moves when text above it changes; deleting the paragraph moves the anchor to the next one."
              : "Stays at this place on the page where its anchor paragraph is (Word keeps a story anchor too)."}
          </p>
          <label className="ms-field ms-field-wide">
            <span>Wrap</span>
            <select value={d.plane === "behind" ? "behind" : d.wrap ?? "square"} disabled={readonly || d.placement === "page"} onChange={(e) => {
              const v = e.target.value;
              set(v === "behind" ? { plane: "behind", wrap: "none" } : v === "none" ? { plane: "front", wrap: "none" } : { plane: undefined, wrap: v as "square" });
            }}>
              <option value="square">Square</option>
              <option value="topBottom">Top and bottom</option>
              <option value="none">In front of text</option>
              <option value="behind">Behind text</option>
            </select>
          </label>
        </Section>
      )}
      {d.type === "connector" && (
        <Section title="Connection">
          <p className="ms-muted">From <strong>{d.from?.id ?? "?"}</strong> to <strong>{d.to?.id ?? "?"}</strong>{(!objectOf(d.from?.id ?? "") || !objectOf(d.to?.id ?? "")) && <span className="ms-error"> — missing end</span>}</p>
          <label className="ms-field ms-field-wide">
            <span>Route</span>
            <select value={d.route ?? "straight"} onChange={(e) => set({ route: e.target.value as "straight" })}>
              <option value="straight">Straight</option>
              <option value="elbow">Elbow</option>
            </select>
          </label>
        </Section>
      )}
      {d.type !== "image" && (
        <Section title="Appearance">
          {d.type !== "connector" && d.shape !== "line" && <Color label="Fill" value={d.style?.fill as string | null} onCommit={(v) => set({ style: { ...d.style, fill: v } })} />}
          <Color label="Line" value={d.style?.line as string | null} onCommit={(v) => set({ style: { ...d.style, line: v } })} />
          <div className="ms-grid2">
            <Num label="Line width" value={d.style?.lineWidth ?? 1} step={0.25} onCommit={(v) => set({ style: { ...d.style, lineWidth: v } })} />
            <label className="ms-field">
              <span>Dash</span>
              <select value={d.style?.dash ?? "solid"} onChange={(e) => set({ style: { ...d.style, dash: e.target.value as "solid" } })}>
                <option value="solid">Solid</option>
                <option value="dash">Dash</option>
                <option value="dot">Dot</option>
              </select>
            </label>
          </div>
          {(d.type === "textbox" || d.type === "shape") && (
            <div className="ms-grid2">
              <label className="ms-field">
                <span>Text align</span>
                <select value={d.style?.align ?? ""} onChange={(e) => set({ style: { ...d.style, align: (e.target.value || undefined) as "left" } })}>
                  <option value="">Default</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="ms-field">
                <span>Vertical</span>
                <select value={d.style?.valign ?? ""} onChange={(e) => set({ style: { ...d.style, valign: (e.target.value || undefined) as "top" } })}>
                  <option value="">Default</option>
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
            </div>
          )}
        </Section>
      )}
      <Section title="Editing locks">
        <p className="ms-muted">Locks apply in this editor only; they are not Word document protection.</p>
        <label className="ms-check"><input type="checkbox" checked={!!d.locked?.geometry} onChange={(e) => set({ locked: { ...d.locked, geometry: e.target.checked || undefined } })} /> Lock position and size</label>
        <label className="ms-check"><input type="checkbox" checked={!!d.locked?.content} onChange={(e) => set({ locked: { ...d.locked, content: e.target.checked || undefined } })} /> Lock content</label>
        <label className="ms-check"><input type="checkbox" checked={!!d.hidden} onChange={(e) => set({ hidden: e.target.checked || undefined })} /> Hidden (not exported unless configured)</label>
      </Section>
      {d.type === "image" && (
        <Section title="Flow">
          <button className="ms-btn" onClick={() => inlineObject(id)}>Put back in line with text</button>
        </Section>
      )}
    </>
  );
}

function TextPane({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const sections = useStudio((s) => s.sections);
  const meta = useStudio((s) => s.meta);
  const entries = useStudio((s) => s.entries);
  const $from = editor.state.selection.$from;
  const top = $from.depth ? $from.node(1) : null;
  const props = top ? parseBlockProps(top.attrs.msBlock) : {};
  const sectionBreak = currentSectionBreak(editor);
  const sectionIndex = useMemo(() => {
    let n = 0;
    editor.state.doc.forEach((node, pos) => node.type.name === "msSection" && pos < editor.state.selection.from && n++);
    return n;
  }, [editor.state.doc, editor.state.selection.from]);
  const sec = sections[sectionIndex];
  const span = editor.getAttributes("msTextStyle") as { style?: string };
  const css = Object.fromEntries((span.style ?? "").split(";").filter(Boolean).map((x) => x.split(":").map((s) => s.trim())));
  const supportsProps = !!top && "msBlock" in top.attrs;
  const sectionSet = (patch: Record<string, unknown>) => (sectionBreak ? setSectionProps(sectionBreak.pos, { ...sectionBreak.props, ...patch }) : setPageSetup(patch as any));
  const page = sec?.page;
  return (
    <>
      <Section title="Paragraph">
        {!supportsProps && <p className="ms-muted">This block has no paragraph formatting.</p>}
        <div className="ms-grid2">
          <Num label="Before" value={props.spaceBefore} disabled={!supportsProps || readonly} onCommit={(v) => setBlockProps({ spaceBefore: v })} />
          <Num label="After" value={props.spaceAfter} disabled={!supportsProps || readonly} onCommit={(v) => setBlockProps({ spaceAfter: v })} />
          <Num label="Left indent" value={props.indentLeft} disabled={!supportsProps || readonly} onCommit={(v) => setBlockProps({ indentLeft: v })} />
          <Num label="Right indent" value={props.indentRight} disabled={!supportsProps || readonly} onCommit={(v) => setBlockProps({ indentRight: v })} />
          <Num label="First line" value={props.firstLine} disabled={!supportsProps || readonly} onCommit={(v) => setBlockProps({ firstLine: v })} />
          <Num label="Line spacing" unit="×" step={0.05} value={props.lineSpacing} disabled={!supportsProps || readonly} onCommit={(v) => setBlockProps({ lineSpacing: v })} />
        </div>
        <label className="ms-check"><input type="checkbox" checked={!!props.keepWithNext} disabled={!supportsProps} onChange={(e) => setBlockProps({ keepWithNext: e.target.checked || undefined })} /> Keep with next</label>
        <label className="ms-check"><input type="checkbox" checked={!!props.keepTogether} disabled={!supportsProps} onChange={(e) => setBlockProps({ keepTogether: e.target.checked || undefined })} /> Keep lines together</label>
        <label className="ms-check"><input type="checkbox" checked={!!props.pageBreakBefore} disabled={!supportsProps} onChange={(e) => setBlockProps({ pageBreakBefore: e.target.checked || undefined })} /> Page break before</label>
        <label className="ms-check"><input type="checkbox" checked={props.widowControl !== false} disabled={!supportsProps} onChange={(e) => setBlockProps({ widowControl: e.target.checked ? undefined : false })} /> Widow / orphan control</label>
        <label className="ms-field ms-field-wide">
          <span>Bookmark id</span>
          <input key={props.id ?? "none"} defaultValue={props.id ?? ""} disabled={!supportsProps} placeholder="e.g. appendix" onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && !/^[A-Za-z][\w-]{0,63}$/.test(v)) return notify("warning", "Ids start with a letter and use letters, digits, - and _.");
            setBlockProps({ id: v || undefined });
          }} />
        </label>
        {top && <button className="ms-link" onClick={() => {
          const line = getSync()?.lineOf(top);
          if (line) vscodeApi.postMessage({ type: "revealSource", line });
        }}>Show in source</button>}
      </Section>
      <Section title="Character">
        <div className="ms-grid2">
          <Num label="Size" value={css["font-size"] ? parseFloat(css["font-size"]) : undefined} disabled={readonly} onCommit={(v) => setSpanStyle(editor, { "font-size": v ? `${v}pt` : null })} />
          <label className="ms-field">
            <span>Font</span>
            <input key={css["font-family"] ?? ""} defaultValue={(css["font-family"] ?? "").replace(/"/g, "")} disabled={readonly} onBlur={(e) => setSpanStyle(editor, { "font-family": e.target.value ? `"${e.target.value}"` : null })} />
          </label>
        </div>
        <Color label="Color" value={(css.color ?? "").replace("#", "")} onCommit={(v) => setSpanStyle(editor, { color: v ? `#${v}` : null })} />
        <Color label="Highlight" value={(css["background-color"] ?? "").replace("#", "")} onCommit={(v) => setSpanStyle(editor, { "background-color": v ? `#${v}` : null })} />
        <p className="ms-muted">Saved as inline HTML spans in the Markdown (readable, kept on save).</p>
      </Section>
      <Section title={sectionBreak ? `Section ${sectionIndex + 1}` : "Document page setup"}>
        <label className="ms-field ms-field-wide">
          <span>Master</span>
          <select value={(sectionBreak ? sectionBreak.props.master : meta?.master) ?? ""} disabled={readonly} onChange={(e) => sectionSet({ master: e.target.value || undefined, ...(sectionBreak ? { headers: e.target.value ? "master" : "link" } : {}) })}>
            <option value="">{sectionBreak ? "Same as previous section" : "None (defaults)"}</option>
            {entries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        {sectionBreak && (
          <>
            <label className="ms-field ms-field-wide">
              <span>Starts</span>
              <select value={sectionBreak.props.break ?? "nextPage"} onChange={(e) => sectionSet({ break: e.target.value })}>
                <option value="nextPage">On the next page</option>
                <option value="oddPage">On the next odd page</option>
                <option value="evenPage">On the next even page</option>
                <option value="continuous">Continuous (DOCX; the editor starts a page)</option>
              </select>
            </label>
            <label className="ms-field ms-field-wide">
              <span>Headers</span>
              <select value={sectionBreak.props.headers ?? (sectionBreak.props.master ? "master" : "link")} onChange={(e) => sectionSet({ headers: e.target.value })}>
                <option value="link">Link to previous (Word default)</option>
                <option value="master">From this section's master</option>
              </select>
            </label>
            <Num label="Page numbers start" unit="" value={sectionBreak.props.pageNumberStart} onCommit={(v) => sectionSet({ pageNumberStart: v })} />
          </>
        )}
        {page && (
          <div className="ms-grid2">
            <Num label="Top" value={page.margins.top} onCommit={(v) => v !== undefined && sectionSet({ margins: { ...(sectionBreak?.props.margins ?? meta?.page?.margins), top: v } })} />
            <Num label="Bottom" value={page.margins.bottom} onCommit={(v) => v !== undefined && sectionSet({ margins: { ...(sectionBreak?.props.margins ?? meta?.page?.margins), bottom: v } })} />
            <Num label="Left" value={page.margins.left} onCommit={(v) => v !== undefined && sectionSet({ margins: { ...(sectionBreak?.props.margins ?? meta?.page?.margins), left: v } })} />
            <Num label="Right" value={page.margins.right} onCommit={(v) => v !== undefined && sectionSet({ margins: { ...(sectionBreak?.props.margins ?? meta?.page?.margins), right: v } })} />
          </div>
        )}
        <p className="ms-muted">{page ? `${Math.round(page.width)} × ${Math.round(page.height)} pt, ${page.orientation}` : ""}{sec?.storyOrigin === "linked" ? " · headers linked to previous" : ""}</p>
      </Section>
      <Section title="Fields">
        <FieldsEditor />
      </Section>
    </>
  );
}

function FieldsEditor() {
  const meta = useStudio((s) => s.meta);
  const sections = useStudio((s) => s.sections);
  const defs = Object.assign({}, ...(sections[0]?.chain ?? []).map((m) => m.fields ?? {})) as Record<string, { label: string; default?: string }>;
  const names = [...new Set([...Object.keys(defs), ...Object.keys(meta?.fields ?? {})])];
  if (!names.length) return <p className="ms-muted">The master defines no fields.</p>;
  return (
    <>
      {names.map((n) => (
        <label key={n} className="ms-field ms-field-wide">
          <span>{defs[n]?.label ?? n}</span>
          <input key={meta?.fields?.[n] ?? ""} defaultValue={meta?.fields?.[n] ?? ""} placeholder={defs[n]?.default ?? ""} onBlur={(e) => {
            const v = e.target.value;
            if ((meta?.fields?.[n] ?? "") === v) return;
            studio.get();
            import("./actions").then(({ updateMeta }) => updateMeta((m) => {
              const fields = { ...m.fields };
              if (v) fields[n] = v;
              else delete fields[n];
              return { ...m, fields: Object.keys(fields).length ? fields : undefined };
            }));
          }} />
        </label>
      ))}
      <p className="ms-muted">Used as {"{{field:name}}"} in headers / footers; exported as Word DOCPROPERTY fields.</p>
    </>
  );
}

function StylesPane({ editor }: { editor: Editor }) {
  const sheet = useStudio((s) => s.sections[0]?.sheet);
  const meta = useStudio((s) => s.meta);
  const [selected, setSelected] = useState("Normal");
  const style = sheet?.styles.get(selected);
  const usage = useMemo(() => {
    let n = 0;
    editor.state.doc.descendants((node) => {
      const p = parseBlockProps(node.attrs?.msBlock);
      const id = p.style ?? (node.type.name === "heading" ? `Heading${node.attrs.level}` : node.type.name === "paragraph" ? "Normal" : null);
      if (id === selected) n++;
      return node.type.name !== "paragraph";
    });
    return n;
  }, [editor.state.doc, selected]);
  if (!sheet) return null;
  const local = meta?.styles?.[selected];
  const set = (group: "run" | "paragraph", key: string, value: unknown) => setStyleOverride(selected, { [group]: { ...(local?.[group] ?? {}), [key]: value } } as Partial<StyleDef>);
  const origin = (key: string) => style?.origin[key];
  const OriginTag = ({ k }: { k: string }) => {
    const o = origin(k);
    return o ? <em className={`ms-origin ms-origin-${o.from.startsWith("master") ? "master" : o.from}`} title={`Set by ${o.from} on style ${o.style}`}>{o.from === "local" ? "local" : o.from === "default" ? "default" : o.from.slice(7)}{o.style !== selected ? ` ← ${o.style}` : ""}</em> : null;
  };
  return (
    <>
      <Section title="Styles">
        <ul className="ms-style-list" role="listbox" aria-label="Styles">
          {[...sheet.styles.values()].filter((s) => s.type !== "table").map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === selected}>
              <button onClick={() => setSelected(s.id)} className={s.overridden ? "is-overridden" : ""}>
                <span className={s.type === "character" ? `ms-cs-${s.id}` : ""}>{s.name}</span>
                <em>{s.type === "character" ? "a" : "¶"}{s.overridden ? " • local" : ""}</em>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {style && (
        <Section title={`${style.name}`} actions={local ? <button className="ms-link" onClick={() => setStyleOverride(selected, null)}>Reset to master</button> : undefined}>
          <p className="ms-muted">Based on {style.basedOn ?? "—"} · used by {usage} block(s) in this document.</p>
          <div className="ms-grid2">
            <Num label="Size" value={style.run.size} onCommit={(v) => set("run", "size", v)} />
            <label className="ms-field"><span>Font</span><input key={style.run.font ?? ""} defaultValue={style.run.font ?? ""} onBlur={(e) => set("run", "font", e.target.value || undefined)} /></label>
          </div>
          <OriginTag k="run.size" />
          <Color label="Color" value={style.run.color} onCommit={(v) => set("run", "color", v ?? undefined)} />
          <OriginTag k="run.color" />
          <label className="ms-check"><input type="checkbox" checked={!!style.run.bold} onChange={(e) => set("run", "bold", e.target.checked)} /> Bold <OriginTag k="run.bold" /></label>
          <label className="ms-check"><input type="checkbox" checked={!!style.run.italic} onChange={(e) => set("run", "italic", e.target.checked)} /> Italic <OriginTag k="run.italic" /></label>
          {style.type === "paragraph" && (
            <div className="ms-grid2">
              <Num label="Before" value={style.paragraph.spaceBefore} onCommit={(v) => set("paragraph", "spaceBefore", v)} />
              <Num label="After" value={style.paragraph.spaceAfter} onCommit={(v) => set("paragraph", "spaceAfter", v)} />
              <Num label="Line" unit="×" step={0.05} value={style.paragraph.lineSpacing} onCommit={(v) => set("paragraph", "lineSpacing", v)} />
              <label className="ms-check"><input type="checkbox" checked={!!style.paragraph.keepWithNext} onChange={(e) => set("paragraph", "keepWithNext", e.target.checked)} /> Keep with next</label>
            </div>
          )}
          <p className="ms-muted">Changes here are local overrides in this document; the master stays unchanged. Edit the master to change every document.</p>
        </Section>
      )}
    </>
  );
}

function LayersPane() {
  const meta = useStudio((s) => s.meta);
  const selection = useStudio((s) => s.selection);
  const sections = useStudio((s) => s.sections);
  const showHidden = useStudio((s) => s.showHidden);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const all = Object.entries(meta?.objects ?? {}).map(([id, d]) => ({ id, group: d.group, z: d.z, d }));
  const planes = { front: all.filter((o) => o.d.plane !== "behind"), behind: all.filter((o) => o.d.plane === "behind") };
  const inherited = Object.entries(sections[0]?.background ?? {});

  const render = (nodes: LayerNode<(typeof all)[number]>[], tree: LayerNode<(typeof all)[number]>[], depth = 0): React.ReactNode =>
    nodes.map((n) => {
      const key = layerKey(n);
      if (n.kind === "group") {
        const isOpen = open[n.path] ?? true;
        return (
          <li key={key} className="ms-layer ms-layer-group" draggable onDragStart={() => setDragKey(key)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(tree, key, "inside")}>
            <div className="ms-layer-row" style={{ paddingLeft: 6 + depth * 14 }}>
              <button className="ms-icon" aria-label={isOpen ? "Collapse group" : "Expand group"} onClick={() => setOpen({ ...open, [n.path]: !isOpen })}>{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
              <span className="ms-layer-name">{n.path.split("/").pop()}</span>
              <em>group</em>
            </div>
            {isOpen && <ul>{render(n.children, tree, depth + 1)}</ul>}
          </li>
        );
      }
      const { id, d } = n.el;
      const sel = selection.includes(id);
      return (
        <li key={key} className={`ms-layer${sel ? " is-selected" : ""}`} draggable onDragStart={() => setDragKey(key)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(tree, key, e.nativeEvent.offsetY < 12 ? "before" : "after")}>
          <div
            className="ms-layer-row"
            style={{ paddingLeft: 18 + depth * 14 }}
            tabIndex={0}
            role="option"
            aria-selected={sel}
            onClick={(e) => (e.shiftKey ? studio.set({ selection: sel ? selection.filter((x) => x !== id) : [...selection, id] }) : selectObject(id))}
            onDoubleClick={() => setRenaming(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") selectObject(id);
              if (e.altKey && e.key === "ArrowUp") (e.preventDefault(), reorder(id, "forward"));
              if (e.altKey && e.key === "ArrowDown") (e.preventDefault(), reorder(id, "backward"));
              if (e.key === "F2") setRenaming(id);
            }}
          >
            {renaming === id ? (
              <input autoFocus defaultValue={d.name ?? id} aria-label="Layer name" onBlur={(e) => (setRenaming(null), updateObjects({ [id]: { name: e.target.value || undefined } }))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            ) : (
              <span className="ms-layer-name">{d.name ?? id}</span>
            )}
            <em>{d.type}{d.placement === "page" ? " · page" : ""}</em>
            <button className="ms-icon" aria-label={d.hidden ? "Show" : "Hide"} onClick={(e) => (e.stopPropagation(), updateObjects({ [id]: { hidden: !d.hidden || undefined } }))}>{d.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            <button className="ms-icon" aria-label={d.locked?.geometry ? "Unlock" : "Lock"} onClick={(e) => (e.stopPropagation(), updateObjects({ [id]: { locked: { ...d.locked, geometry: !d.locked?.geometry || undefined } } }))}>{d.locked?.geometry ? <Lock size={13} /> : <Unlock size={13} />}</button>
          </div>
        </li>
      );
    });

  const drop = (tree: LayerNode<(typeof all)[number]>[], to: string, where: "before" | "after" | "inside") => {
    if (!dragKey) return;
    const result = moveLayer(tree, dragKey, to, where);
    setDragKey(null);
    if (result) applyLayerOrder(result.order, result.groups);
  };
  const plane = (title: string, list: typeof all) => {
    const tree = layerTree(frontToBack(list));
    return (
      <Section title={title}>
        {list.length ? <ul className="ms-layers" role="listbox" aria-label={title}>{render(tree, tree)}</ul> : <p className="ms-muted">Empty</p>}
      </Section>
    );
  };
  return (
    <>
      {plane("Foreground (in front of / wrapped by text)", planes.front)}
      <Section title="Body text">
        <p className="ms-muted">Flowing text follows the outline; layer order never moves paragraphs.</p>
      </Section>
      {plane("Background (behind text)", planes.behind)}
      <Section title="From the master">
        {inherited.length ? (
          <ul className="ms-layers">
            {inherited.map(([id, d]) => (
              <li key={id} className="ms-layer is-inherited"><div className="ms-layer-row" style={{ paddingLeft: 18 }}><span className="ms-layer-name">{d.name ?? id}</span><em>master · locked</em></div></li>
            ))}
          </ul>
        ) : <p className="ms-muted">The master has no recurring drawings.</p>}
      </Section>
      {showHidden && <p className="ms-muted">Hidden objects are revealed (view only).</p>}
    </>
  );
}

function ReviewPane() {
  const report = useStudio((s) => s.report);
  const layout = useStudio((s) => s.layout);
  const diags = useStudio((s) => s.sectionDiagnostics);
  const [fonts, setFonts] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!report) return;
    const out: Record<string, boolean> = {};
    for (const f of report.report.fonts) out[f] = document.fonts.check(`12px "${f}"`) && fontInstalled(f);
    setFonts(out);
  }, [report]);
  const item = (i: { message: string; line?: number; objectId?: string }, k: number) => (
    <li key={k}>
      {i.message}
      {i.line && <button className="ms-link" onClick={() => vscodeApi.postMessage({ type: "revealSource", line: i.line })}>line {i.line}</button>}
      {i.objectId && <button className="ms-link" onClick={() => selectObject(i.objectId!)}>select</button>}
    </li>
  );
  return (
    <>
      <Section title="Layout">
        <p className="ms-muted">{layout ? `${layout.pages.length} page(s), computed by the editor; Word may break lines and pages differently.` : "Continuous view."}</p>
        {layout?.overflows.length ? <ul className="ms-issues">{layout.overflows.map((o, k) => <li key={k}>Content taller than page {o.page + 1}: scale it, split it or use a larger / landscape section.</li>)}</ul> : null}
        {diags.length ? <ul className="ms-issues">{diags.map((d, k) => <li key={k}>{d}</li>)}</ul> : null}
      </Section>
      {!report && <p className="ms-muted">Run Review › Preflight to check the document before delivery.</p>}
      {report && (
        <>
          <Section title={report.kind === "preflight" ? "Preflight" : `Export${report.target ? ` — ${report.target}` : ""}`}>
            <p>{report.report.blocked ? "Strict export would refuse this document." : report.kind === "preflight" ? "Exportable." : "Written."} Mode: {report.report.mode}.</p>
            <ul className="ms-native">{Object.entries(report.report.native).map(([k, n]) => <li key={k}><span>{k}</span><strong>{n}</strong></li>)}</ul>
          </Section>
          {report.report.missing.length > 0 && <Section title="Missing"><ul className="ms-issues">{report.report.missing.map(item)}</ul></Section>}
          {report.report.unsupported.length > 0 && <Section title="Unsupported"><ul className="ms-issues">{report.report.unsupported.map(item)}</ul></Section>}
          {report.report.fallbacks.length > 0 && <Section title="Fallbacks"><ul className="ms-issues">{report.report.fallbacks.map(item)}</ul></Section>}
          {report.report.fonts.length > 0 && (
            <Section title="Fonts">
              <ul className="ms-issues">{report.report.fonts.map((f) => <li key={f}>{f} {fonts[f] === false ? <strong className="ms-error">not available here — shown with a substitute</strong> : "available"}</li>)}</ul>
            </Section>
          )}
          {report.report.diagnostics.length > 0 && <Section title="Diagnostics"><ul className="ms-issues">{report.report.diagnostics.map(item)}</ul></Section>}
          <Section title="Fidelity limits"><ul className="ms-issues">{report.report.limits.map((l, k) => <li key={k}>{l}</li>)}</ul></Section>
        </>
      )}
    </>
  );
}

/** A font renders differently from the fallback (document.fonts.check is true for unknown local fonts). */
function fontInstalled(font: string): boolean {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return true;
  const sample = "mmmmmmmmmmlli1WQ@#";
  ctx.font = "32px monospace";
  const base = ctx.measureText(sample).width;
  ctx.font = `32px "${font}", monospace`;
  return ctx.measureText(sample).width !== base;
}

function MasterDesigner({ master }: { master: MasterDef }) {
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    void masterAction("usage", { id: master.id }).then((r: any) => setUsage(Array.isArray(r?.documents) ? r.documents.length : null));
  }, [master.id]);
  const edit = (patch: Partial<MasterDef>) => {
    studio.set({ masterEdit: { ...master, ...patch } });
    import("./store").then(({ resolveDocument }) => resolveDocument());
  };
  const story = (kind: "headers" | "footers", variant: "default" | "first" | "even") => (
    <label className="ms-field ms-field-wide ms-field-area" key={`${kind}-${variant}`}>
      <span>{kind === "headers" ? "Header" : "Footer"} · {variant}</span>
      <textarea rows={2} value={master[kind]?.[variant]?.markdown ?? ""} onChange={(e) => edit({ [kind]: { ...master[kind], [variant]: { ...master[kind]?.[variant], markdown: e.target.value } } } as Partial<MasterDef>)} />
    </label>
  );
  const page = master.page;
  const setPage = (p: Partial<MasterDef["page"]>) => edit({ page: { ...page, ...p, margins: { ...page.margins, ...p.margins } } });
  const theme = master.theme ?? { colors: {}, fonts: { heading: "Calibri Light", body: "Calibri" } };
  return (
    <>
      <div className="ms-master-banner" role="status">
        Editing master <strong>{master.name}</strong> — affects {usage === null ? "documents that use it" : `${usage} document(s)`}. Document edits are paused while you edit the master.
      </div>
      <Section title="Identity">
        <label className="ms-field ms-field-wide"><span>Name</span><input value={master.name} onChange={(e) => edit({ name: e.target.value })} /></label>
        <label className="ms-field ms-field-wide"><span>Description</span><input value={master.description ?? ""} onChange={(e) => edit({ description: e.target.value })} /></label>
        <p className="ms-muted">Id: {master.id}{master.basedOn ? ` · based on ${master.basedOn}` : ""}{master.provenance?.file ? ` · from ${master.provenance.file}` : ""}</p>
      </Section>
      <Section title="Page">
        <div className="ms-grid2">
          <label className="ms-field"><span>Size</span><select value={page.size ?? "A4"} onChange={(e) => setPage({ size: e.target.value as "A4" })}>{["A4", "Letter", "Legal", "A3", "A5", "custom"].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="ms-field"><span>Orientation</span><select value={page.orientation ?? "portrait"} onChange={(e) => setPage({ orientation: e.target.value as "portrait" })}><option>portrait</option><option>landscape</option></select></label>
          {(["top", "bottom", "left", "right", "header", "footer"] as const).map((k) => <Num key={k} label={k} value={page.margins?.[k]} onCommit={(v) => setPage({ margins: { [k]: v } })} />)}
        </div>
        <label className="ms-check"><input type="checkbox" checked={!!master.titlePage} onChange={(e) => edit({ titlePage: e.target.checked })} /> Different first page</label>
        <label className="ms-check"><input type="checkbox" checked={!!master.evenAndOdd} onChange={(e) => edit({ evenAndOdd: e.target.checked })} /> Different odd and even pages</label>
      </Section>
      <Section title="Theme">
        <div className="ms-grid2">
          <label className="ms-field"><span>Headings</span><input value={theme.fonts.heading} onChange={(e) => edit({ theme: { ...theme, fonts: { ...theme.fonts, heading: e.target.value } } })} /></label>
          <label className="ms-field"><span>Body</span><input value={theme.fonts.body} onChange={(e) => edit({ theme: { ...theme, fonts: { ...theme.fonts, body: e.target.value } } })} /></label>
        </div>
        {(["dk1", "dk2", "accent1", "accent2", "accent3", "hlink"] as const).map((slot) => (
          <Color key={slot} label={slot} value={theme.colors[slot]} onCommit={(v) => edit({ theme: { ...theme, colors: { ...theme.colors, [slot]: v ?? undefined } } })} />
        ))}
      </Section>
      <Section title="Headers & footers">
        {story("headers", "default")}
        {master.titlePage && story("headers", "first")}
        {master.evenAndOdd && story("headers", "even")}
        {story("footers", "default")}
        {master.titlePage && story("footers", "first")}
        {master.evenAndOdd && story("footers", "even")}
        <p className="ms-muted">Fields: {"{{page}} {{pages}} {{title}} {{field:name}}"}</p>
      </Section>
      <div className="ms-row ms-sticky-actions">
        <button className="ms-primary" onClick={async () => {
          await saveMaster(master);
          studio.set({ masterEdit: null });
          await refreshMasters();
        }}>Save master</button>
        <button className="ms-btn" onClick={() => {
          studio.set({ masterEdit: null });
          import("./store").then(({ resolveDocument }) => resolveDocument());
        }}>Cancel</button>
        {master.provenance?.source !== "starter" && <button className="ms-link" onClick={() => void masterAction("openSource", { id: master.id })}>master.json</button>}
      </div>
    </>
  );
}
