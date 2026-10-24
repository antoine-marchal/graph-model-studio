/**
 * Ribbon: Home, Insert, Layout, References, Review, View, plus the contextual Object tab while an
 * object is selected. Labelled groups; toggles carry aria-pressed; double-click a tab (or the
 * chevron) collapses it.
 */
import React, { useEffect, useReducer, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronUp, ChevronDown, Italic, List, ListOrdered, ListChecks, Strikethrough, Underline,
  Square, Circle, Triangle, Diamond, ArrowRight, Minus, Type, Image as ImageIcon, Table, FileText, SeparatorHorizontal, Link2, Sigma, Workflow, Search,
  BringToFront, SendToBack, Group as GroupIcon, Ungroup, Lock, Eye, Copy, Trash2, IndentIncrease, IndentDecrease, Eraser, BookMarked, ListTree, ShieldCheck, GitCompare, Ruler as RulerIcon,
} from "lucide-react";
import { studio, useStudio } from "./store";
import {
  alignObjects, applyParagraphStyle, deleteObjects, duplicateObjects, floatSelectedImage, groupObjects, inlineObject, insertObject, insertSectionBreak, reorder, setBlockProps,
  setPageSetup, setPlacement, ungroup, updateObjects, currentSectionBreak, setSectionProps,
} from "./actions";
import { parseBlockProps, setSpanStyle } from "../extensions/StudioNodes";
import { runPreflight } from "./bridge";
import { setZoom } from "./PageLayer";
import { groupParts } from "../../../slides-studio/packages/core/src/groups";
import { vscodeApi } from "../vscode-api";
import type { NewObject } from "./actions";

type Tab = "home" | "insert" | "layout" | "references" | "review" | "view" | "object";

function Btn({ icon, label, onClick, pressed, disabled, large, title }: { icon?: React.ReactNode; label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; large?: boolean; title?: string }) {
  return (
    <button className={large ? "ms-rb ms-rb-large" : "ms-rb"} onMouseDown={(e) => e.preventDefault()} onClick={onClick} aria-pressed={pressed} disabled={disabled} title={title ?? label} aria-label={label}>
      {icon}
      {(large || !icon) && <span>{label}</span>}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ms-rgroup" role="group" aria-label={label}>
      <div className="ms-rgroup-body">{children}</div>
      <div className="ms-rgroup-label">{label}</div>
    </div>
  );
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
const COLORS = ["#1B1C1F", "#44546A", "#1F6BFF", "#C62828", "#2E7D32", "#ED7D31", "#7B1FA2", "#FFFFFF"];
const HIGHLIGHTS = ["#FFF59D", "#C8E6C9", "#BBDEFB", "#F8BBD0", "#FFE0B2"];

export function Ribbon({ editor, readonly, onFind }: { editor: Editor; readonly: boolean; onFind: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const collapsed = useStudio((s) => s.ribbonCollapsed);
  const selection = useStudio((s) => s.selection);
  const sections = useStudio((s) => s.sections);
  const meta = useStudio((s) => s.meta);
  const pageView = useStudio((s) => s.pageView);
  const showRulers = useStudio((s) => s.showRulers);
  const showGuides = useStudio((s) => s.showGuides);
  const showHidden = useStudio((s) => s.showHidden);
  const zoom = useStudio((s) => s.zoom);
  const [, rerender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    // Toggle states follow the selection, at most once per frame (typing stays cheap).
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), rerender()));
    };
    editor.on("selectionUpdate", schedule);
    editor.on("transaction", schedule);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", schedule);
      editor.off("transaction", schedule);
    };
  }, [editor]);
  useEffect(() => {
    if (selection.length) setTab((t) => (t === "home" || t === "insert" ? "object" : t));
    else setTab((t) => (t === "object" ? "home" : t));
  }, [selection.length > 0]);

  const sheet = sections[0]?.sheet;
  const paragraphStyles = sheet ? [...sheet.styles.values()].filter((s) => s.type === "paragraph") : [];
  const characterStyles = sheet ? [...sheet.styles.values()].filter((s) => s.type === "character") : [];
  const $from = editor.state.selection.$from;
  const top = $from.depth ? $from.node(1) : null;
  const props = top ? parseBlockProps(top.attrs.msBlock) : {};
  const currentStyle = editor.isActive("heading") ? `Heading${editor.getAttributes("heading").level}` : props.style ?? "Normal";
  const span = editor.getAttributes("msTextStyle") as { style?: string; msStyle?: string };
  const css = Object.fromEntries((span.style ?? "").split(";").filter(Boolean).map((d) => d.split(":").map((x) => x.trim())));
  const chain = () => editor.chain().focus();
  const obj = selection[0] ? meta?.objects?.[selection[0]] : undefined;
  const disabled = readonly;
  const shape = (kind: NewObject) => () => insertObject(kind);
  const section = currentSectionBreak(editor);
  const pageProps = section ? section.props : meta?.page ?? {};
  const setPage = (patch: Record<string, unknown>) => (section ? setSectionProps(section.pos, { ...section.props, ...patch }) : setPageSetup(patch));

  const tabs: [Tab, string][] = [["home", "Home"], ["insert", "Insert"], ["layout", "Layout"], ["references", "References"], ["review", "Review"], ["view", "View"]];
  if (selection.length) tabs.push(["object", obj?.type === "image" ? "Picture" : "Object"]);

  return (
    <div className={`ms-ribbon${collapsed ? " is-collapsed" : ""}`}>
      <div className="ms-rtabs" role="tablist" onDoubleClick={() => studio.set({ ribbonCollapsed: !collapsed })}>
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={id === "object" ? "ms-rtab-context" : ""} onClick={() => (setTab(id), collapsed && studio.set({ ribbonCollapsed: false }))}>
            {label}
          </button>
        ))}
        <span className="ms-spacer" />
        <button className="ms-icon" aria-label={collapsed ? "Expand ribbon" : "Collapse ribbon"} onClick={() => studio.set({ ribbonCollapsed: !collapsed })}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!collapsed && (
        <div className="ms-rbody" role="tabpanel">
          {tab === "home" && (
            <>
              <Group label="Style">
                <select aria-label="Paragraph style" value={currentStyle} disabled={disabled} onChange={(e) => applyParagraphStyle(e.target.value)}>
                  {paragraphStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select aria-label="Character style" value={span.msStyle ?? ""} disabled={disabled} onChange={(e) => setSpanStyle(editor, {}, e.target.value || null)}>
                  <option value="">Character style…</option>
                  {characterStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Group>
              <Group label="Font">
                <div className="ms-row">
                  <input aria-label="Font" placeholder="Font" list="ms-fonts" defaultValue={css["font-family"]?.replace(/"/g, "") ?? ""} key={css["font-family"] ?? "none"} disabled={disabled} onKeyDown={(e) => e.key === "Enter" && setSpanStyle(editor, { "font-family": (e.target as HTMLInputElement).value ? `"${(e.target as HTMLInputElement).value}"` : null })} />
                  <datalist id="ms-fonts">{[sheet?.theme.fonts.body, sheet?.theme.fonts.heading, "Calibri", "Arial", "Georgia", "Times New Roman", "Segoe UI", "Consolas"].filter(Boolean).map((f) => <option key={f} value={f!} />)}</datalist>
                  <select aria-label="Size" value={css["font-size"]?.replace("pt", "") ?? ""} disabled={disabled} onChange={(e) => setSpanStyle(editor, { "font-size": e.target.value ? `${e.target.value}pt` : null })}>
                    <option value="">Size</option>
                    {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="ms-row">
                  <Btn icon={<Bold size={15} />} label="Bold" pressed={editor.isActive("bold")} disabled={disabled} onClick={() => chain().toggleBold().run()} />
                  <Btn icon={<Italic size={15} />} label="Italic" pressed={editor.isActive("italic")} disabled={disabled} onClick={() => chain().toggleItalic().run()} />
                  <Btn icon={<Underline size={15} />} label="Underline" pressed={editor.isActive("underline")} disabled={disabled} onClick={() => chain().toggleUnderline().run()} />
                  <Btn icon={<Strikethrough size={15} />} label="Strikethrough" pressed={editor.isActive("strike")} disabled={disabled} onClick={() => chain().toggleStrike().run()} />
                  <span className="ms-swatches" role="group" aria-label="Text color">
                    {COLORS.map((c) => <button key={c} className="ms-swatch" style={{ background: c }} aria-label={`Text color ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setSpanStyle(editor, { color: c })} />)}
                  </span>
                  <span className="ms-swatches" role="group" aria-label="Highlight">
                    {HIGHLIGHTS.map((c) => <button key={c} className="ms-swatch ms-swatch-hl" style={{ background: c }} aria-label={`Highlight ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setSpanStyle(editor, { "background-color": c })} />)}
                  </span>
                  <Btn icon={<Eraser size={15} />} label="Clear formatting" disabled={disabled} onClick={() => (chain().unsetAllMarks().run(), setBlockProps({ align: undefined, spaceBefore: undefined, spaceAfter: undefined, lineSpacing: undefined, indentLeft: undefined, firstLine: undefined }))} />
                </div>
              </Group>
              <Group label="Paragraph">
                <div className="ms-row">
                  <Btn icon={<List size={15} />} label="Bullets" pressed={editor.isActive("bulletList")} disabled={disabled} onClick={() => chain().toggleBulletList().run()} />
                  <Btn icon={<ListOrdered size={15} />} label="Numbering" pressed={editor.isActive("orderedList")} disabled={disabled} onClick={() => chain().toggleOrderedList().run()} />
                  <Btn icon={<ListChecks size={15} />} label="Checklist" pressed={editor.isActive("taskList")} disabled={disabled} onClick={() => chain().toggleTaskList().run()} />
                  <Btn icon={<IndentDecrease size={15} />} label="Decrease indent" disabled={disabled} onClick={() => setBlockProps({ indentLeft: Math.max(0, (props.indentLeft ?? 0) - 18) || undefined })} />
                  <Btn icon={<IndentIncrease size={15} />} label="Increase indent" disabled={disabled} onClick={() => setBlockProps({ indentLeft: (props.indentLeft ?? 0) + 18 })} />
                </div>
                <div className="ms-row">
                  {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ["justify", AlignJustify]] as const).map(([a, Icon]) => (
                    <Btn key={a} icon={<Icon size={15} />} label={`Align ${a}`} pressed={(props.align ?? "left") === a} disabled={disabled} onClick={() => setBlockProps({ align: a === "left" ? undefined : a })} />
                  ))}
                  <select aria-label="Line spacing" value={props.lineSpacing ?? ""} disabled={disabled} onChange={(e) => setBlockProps({ lineSpacing: e.target.value ? Number(e.target.value) : undefined })}>
                    <option value="">Spacing</option>
                    {[1, 1.15, 1.5, 2, 2.5, 3].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </Group>
              <Group label="Editing">
                <Btn large icon={<Search size={18} />} label="Find" onClick={onFind} />
              </Group>
            </>
          )}
          {tab === "insert" && (
            <>
              <Group label="Pages">
                <Btn large icon={<FileText size={18} />} label="Page break" disabled={disabled} onClick={() => (editor.commands as any).insertPageBreak()} title="Page break (Ctrl+Enter)" />
                <Btn large icon={<SeparatorHorizontal size={18} />} label="Section" disabled={disabled} onClick={() => insertSectionBreak({ break: "nextPage" })} title="New section (next page)" />
              </Group>
              <Group label="Tables & media">
                <Btn large icon={<Table size={18} />} label="Table" disabled={disabled} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
                <Btn large icon={<ImageIcon size={18} />} label="Picture" disabled={disabled} onClick={() => window.dispatchEvent(new CustomEvent("btrmk:showImageDialog"))} />
                <Btn large icon={<Sigma size={18} />} label="Equation" disabled={disabled} onClick={() => chain().insertContent({ type: "mathBlock", attrs: { latex: "E = mc^2" } }).run()} />
                <Btn large icon={<Workflow size={18} />} label="Diagram" disabled={disabled} onClick={() => chain().insertContent({ type: "mermaidBlock", attrs: { code: "graph LR\n  A --> B" } }).run()} />
              </Group>
              <Group label="Objects">
                <Btn large icon={<Type size={18} />} label="Text box" disabled={disabled} onClick={shape("textbox")} />
                <div className="ms-grid">
                  <Btn icon={<Square size={15} />} label="Rectangle" disabled={disabled} onClick={shape("rect")} />
                  <Btn icon={<Square size={15} style={{ borderRadius: 4 }} />} label="Rounded rectangle" disabled={disabled} onClick={shape("roundRect")} />
                  <Btn icon={<Circle size={15} />} label="Ellipse" disabled={disabled} onClick={shape("ellipse")} />
                  <Btn icon={<Triangle size={15} />} label="Triangle" disabled={disabled} onClick={shape("triangle")} />
                  <Btn icon={<Diamond size={15} />} label="Diamond" disabled={disabled} onClick={shape("diamond")} />
                  <Btn icon={<ArrowRight size={15} />} label="Arrow" disabled={disabled} onClick={shape("rightArrow")} />
                  <Btn icon={<Minus size={15} />} label="Line" disabled={disabled} onClick={shape("line")} />
                  <Btn icon={<Workflow size={15} />} label="Connector (select two objects)" disabled={disabled} onClick={shape("connector")} />
                </div>
              </Group>
              <Group label="Links">
                <Btn large icon={<Link2 size={18} />} label="Link" disabled={disabled} onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "betterMarkdown.insertLink" })} />
              </Group>
              <Group label="Building blocks">
                <Btn label="Callout" disabled={disabled} onClick={() => (chain().insertContent("<p>Callout text</p>").run(), applyParagraphStyle(sheet?.styles.has("Callout") ? "Callout" : "Quote"))} />
                <Btn label="Figure + caption" disabled={disabled} onClick={() => (chain().insertContent("<p>Figure: caption</p>").run(), applyParagraphStyle("Caption"))} />
                <Btn label="Signature" disabled={disabled} onClick={() => chain().insertContent("<p>______________________</p><p>Name, title</p>").run()} />
              </Group>
            </>
          )}
          {tab === "layout" && (
            <>
              <Group label={section ? "Section page setup" : "Page setup"}>
                <select aria-label="Page size" value={pageProps.size ?? "A4"} disabled={disabled} onChange={(e) => setPage({ size: e.target.value })}>
                  {["A4", "Letter", "Legal", "A3", "A5"].map((s) => <option key={s}>{s}</option>)}
                </select>
                <select aria-label="Orientation" value={pageProps.orientation ?? "portrait"} disabled={disabled} onChange={(e) => setPage({ orientation: e.target.value })}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
                <select aria-label="Margins" value="" disabled={disabled} onChange={(e) => {
                  const m = { normal: 72, narrow: 36, wide: 108 }[e.target.value as "normal"];
                  if (m) setPage({ margins: { top: m, bottom: m, left: m, right: m } });
                }}>
                  <option value="">Margins…</option>
                  <option value="normal">Normal (2.54 cm)</option>
                  <option value="narrow">Narrow (1.27 cm)</option>
                  <option value="wide">Wide (3.81 cm)</option>
                </select>
                <select aria-label="Newspaper columns" title="Word section columns (exported to DOCX; the editor previews one column)" value={String((pageProps as any).columns?.count ?? 1)} disabled={disabled} onChange={(e) => setPage({ columns: Number(e.target.value) > 1 ? { count: Number(e.target.value) } : undefined })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n === 1 ? "One column" : `${n} columns (DOCX)`}</option>)}
                </select>
              </Group>
              <Group label="Breaks">
                <Btn label="Page break" disabled={disabled} onClick={() => (editor.commands as any).insertPageBreak()} />
                <Btn label="Section: next page" disabled={disabled} onClick={() => insertSectionBreak({ break: "nextPage" })} />
                <Btn label="Section: landscape" disabled={disabled} onClick={() => insertSectionBreak({ break: "nextPage", orientation: "landscape" })} />
                <Btn label="Keep with next" pressed={!!props.keepWithNext} disabled={disabled} onClick={() => setBlockProps({ keepWithNext: props.keepWithNext ? undefined : true })} />
                <Btn label="Keep lines together" pressed={!!props.keepTogether} disabled={disabled} onClick={() => setBlockProps({ keepTogether: props.keepTogether ? undefined : true })} />
                <Btn label="Page break before" pressed={!!props.pageBreakBefore} disabled={disabled} onClick={() => setBlockProps({ pageBreakBefore: props.pageBreakBefore ? undefined : true })} />
              </Group>
              <Group label="Arrange">
                <Btn icon={<BringToFront size={15} />} label="Bring to front" disabled={!selection.length || disabled} onClick={() => selection.forEach((id) => reorder(id, "front"))} />
                <Btn icon={<SendToBack size={15} />} label="Send to back" disabled={!selection.length || disabled} onClick={() => selection.forEach((id) => reorder(id, "back"))} />
                <Btn icon={<GroupIcon size={15} />} label="Group (Ctrl+G)" disabled={selection.length < 2 || disabled} onClick={() => groupObjects(selection)} />
              </Group>
            </>
          )}
          {tab === "references" && (
            <>
              <Group label="Contents">
                <Btn large icon={<ListTree size={18} />} label="Table of contents" disabled={disabled} onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "betterMarkdown.insertToc" })} />
              </Group>
              <Group label="Captions & bookmarks">
                <Btn label="Insert caption" disabled={disabled} onClick={() => (chain().insertContent("<p>Figure 1: </p>").run(), applyParagraphStyle("Caption"))} />
                <Btn icon={<BookMarked size={15} />} label="Bookmark paragraph" disabled={disabled} onClick={() => {
                  const id = window.prompt("Bookmark id (letters, digits, -)", props.id ?? "");
                  if (id !== null) setBlockProps({ id: /^[A-Za-z][\w-]*$/.test(id) ? id : undefined });
                }} />
                <Btn label="Cross-reference" disabled={disabled} onClick={() => {
                  const ids: string[] = [];
                  editor.state.doc.descendants((n) => {
                    const p = parseBlockProps(n.attrs?.msBlock);
                    if (p.id) ids.push(p.id);
                    return true;
                  });
                  const id = window.prompt(`Link to bookmark (${ids.join(", ") || "none yet"})`, ids[0] ?? "");
                  if (id) chain().insertContent(`<a href="#${id}">see ${id}</a>`).run();
                }} />
              </Group>
            </>
          )}
          {tab === "review" && (
            <>
              <Group label="Delivery">
                <Btn large icon={<ShieldCheck size={18} />} label="Preflight" onClick={() => void runPreflight()} title="Check missing assets, fonts, styles, overflow and export fallbacks" />
              </Group>
              <Group label="Other formats">
                <Btn label="HTML / PDF / PNG…" onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "markdownToolkit.export" })} />
                <Btn label="Refresh embeds" onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "markdown-embed.update" })} />
              </Group>
              <Group label="Changes">
                <Btn large icon={<GitCompare size={18} />} label="Diff vs HEAD" onClick={() => window.dispatchEvent(new CustomEvent("ms:toggleDiff"))} title="Git review (not Word track changes)" />
              </Group>
            </>
          )}
          {tab === "view" && (
            <>
              <Group label="Views">
                <Btn label="Page view" pressed={pageView} onClick={() => studio.set({ pageView: !pageView })} />
                <Btn icon={<RulerIcon size={15} />} label="Rulers" pressed={showRulers} onClick={() => studio.set({ showRulers: !showRulers })} />
                <Btn label="Margin guides" pressed={showGuides} onClick={() => studio.set({ showGuides: !showGuides })} />
                <Btn icon={<Eye size={15} />} label="Show hidden objects" pressed={showHidden} onClick={() => studio.set({ showHidden: !showHidden })} title="View only: hidden objects stay hidden in the document" />
              </Group>
              <Group label="Zoom">
                <Btn label="100%" onClick={() => setZoom(1, true)} pressed={zoom === 1} />
                <Btn label="Fit width" onClick={() => window.dispatchEvent(new CustomEvent("ms:fit"))} />
              </Group>
              <Group label="Panels">
                <Btn label="Navigation" onClick={() => studio.set((s) => ({ leftOpen: !s.leftOpen }))} />
                <Btn label="Inspector" onClick={() => studio.set((s) => ({ rightOpen: !s.rightOpen }))} />
                <Btn label="Zen" onClick={() => window.postMessage({ type: "toggleZen" }, "*")} />
                <Btn label="Frontmatter" onClick={() => window.dispatchEvent(new CustomEvent("btrmk:addFrontmatter"))} title="Add a YAML frontmatter block" />
                <Btn label="Settings" onClick={() => window.postMessage({ type: "openSettings" }, "*")} />
              </Group>
            </>
          )}
          {tab === "object" && obj && (
            <>
              <Group label="Position">
                <select aria-label="Placement" value={obj.placement === "page" ? `page-${obj.relativeTo ?? "margin"}` : "anchored"} disabled={disabled} onChange={(e) => {
                  const v = e.target.value;
                  setPlacement(selection[0], v === "anchored" ? "anchored" : "page", v === "page-page" ? "page" : "margin");
                }}>
                  <option value="anchored">Move with text</option>
                  <option value="page-margin">Fix on page (margins)</option>
                  <option value="page-page">Fix on page (edges)</option>
                </select>
                <select aria-label="Wrap" value={obj.plane === "behind" ? "behind" : obj.wrap ?? "square"} disabled={disabled || obj.placement === "page"} title={obj.placement === "page" ? "Objects fixed on the page do not wrap text" : "Text wrapping"} onChange={(e) => {
                  const v = e.target.value;
                  updateObjects({ [selection[0]]: v === "behind" ? { plane: "behind", wrap: "none" } : v === "front" ? { plane: "front", wrap: "none" } : { plane: undefined, wrap: v as "square" } });
                }}>
                  <option value="square">Square wrap</option>
                  <option value="topBottom">Top and bottom</option>
                  <option value="none">In front of text</option>
                  <option value="behind">Behind text</option>
                </select>
                {obj.type === "image" && <Btn label="In line with text" disabled={disabled} onClick={() => inlineObject(selection[0])} />}
              </Group>
              <Group label="Arrange">
                <div className="ms-row">
                  <Btn icon={<BringToFront size={15} />} label="Bring to front" onClick={() => selection.forEach((id) => reorder(id, "front"))} />
                  <Btn icon={<SendToBack size={15} />} label="Send to back" onClick={() => selection.forEach((id) => reorder(id, "back"))} />
                  <Btn label="Forward" onClick={() => selection.forEach((id) => reorder(id, "forward"))} />
                  <Btn label="Backward" onClick={() => selection.forEach((id) => reorder(id, "backward"))} />
                </div>
                <div className="ms-row">
                  <Btn icon={<GroupIcon size={15} />} label="Group" disabled={selection.length < 2} onClick={() => groupObjects(selection)} />
                  <Btn icon={<Ungroup size={15} />} label="Ungroup" disabled={!obj.group} onClick={() => ungroup(groupParts(obj.group)[0])} />
                  <Btn icon={<Copy size={15} />} label="Duplicate (Ctrl+D)" onClick={() => duplicateObjects(selection)} />
                  <Btn icon={<Trash2 size={15} />} label="Delete" onClick={() => deleteObjects(selection)} />
                </div>
              </Group>
              <Group label="Align">
                <div className="ms-row">
                  {(["left", "center", "right"] as const).map((m) => <Btn key={m} label={m} disabled={selection.length < 2} onClick={() => alignObjects(selection, m)} />)}
                  <Btn label="Distribute H" disabled={selection.length < 3} onClick={() => alignObjects(selection, "hdist")} />
                </div>
                <div className="ms-row">
                  {(["top", "middle", "bottom"] as const).map((m) => <Btn key={m} label={m} disabled={selection.length < 2} onClick={() => alignObjects(selection, m)} />)}
                  <Btn label="Distribute V" disabled={selection.length < 3} onClick={() => alignObjects(selection, "vdist")} />
                </div>
              </Group>
              <Group label="Lock">
                <Btn icon={<Lock size={15} />} label="Lock position" pressed={!!obj.locked?.geometry} onClick={() => updateObjects({ [selection[0]]: { locked: { ...obj.locked, geometry: !obj.locked?.geometry } } })} />
                <Btn label="Lock content" pressed={!!obj.locked?.content} onClick={() => updateObjects({ [selection[0]]: { locked: { ...obj.locked, content: !obj.locked?.content } } })} />
              </Group>
            </>
          )}
          {tab === "home" && editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === "image" && (
            <Group label="Picture">
              <Btn label="Float (wrap text)" disabled={disabled} onClick={floatSelectedImage} />
            </Group>
          )}
        </div>
      )}
    </div>
  );
}
