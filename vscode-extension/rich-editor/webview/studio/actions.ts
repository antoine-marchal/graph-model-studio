/**
 * Studio commands. Each one is a single source edit (editor transaction and / or frontmatter meta
 * change, sent together), so it is one VS Code undo step.
 */
// `tr` names transactions here: the French / English string helper is `loc`.
import { tr as loc } from "../../../slides-studio/packages/core/src/i18n";
import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import type { Node as PMNode } from "@tiptap/pm/model";
import { uniqueId } from "../../document/markers";
import { storyGroupId } from "../../document/groups";
import { TEXT_PRESETS, isAutoField, placeholderKey, placeholderPrompt } from "../../document/placeholders";
import type { BlockProps, MasterDef, ObjectDescriptor, SectionProps, StorySet, StudioMeta, StyleDef } from "../../document/schema";
import { pxToPt } from "../../document/units";
import { groupParts, inGroup } from "../../../slides-studio/packages/core/src/groups";
import type { DocumentSync } from "./documentSync";
import { lookupMaster, notify, objectOf, resolveDocument, studio } from "./store";
import { saveMaster } from "./bridge";
import { parseBlockProps } from "../extensions/StudioNodes";

let editorRef: Editor | null = null;
let syncRef: DocumentSync | null = null;
export const bindActions = (editor: Editor, sync: DocumentSync) => {
  editorRef = editor;
  syncRef = sync;
  editor.on("transaction", ({ transaction }) => transaction.docChanged && refreshGroupTexts(editor));
  refreshGroupTexts(editor);
};
export const getEditor = () => editorRef;
export const getSync = () => syncRef;

const objects = () => studio.get().meta?.objects ?? {};

/** All object ids in the body plus those only in meta. */
function takenIds(): Set<string> {
  const ids = new Set(Object.keys(objects()));
  editorRef?.state.doc.forEach((n) => n.type.name === "msObject" && ids.add(String(n.attrs.id)));
  return ids;
}

export function updateMeta(change: (meta: StudioMeta) => StudioMeta | null, delay = 0): void {
  syncRef?.updateMeta(change, delay);
}

/** `delay`: the edit waits for the rest of its gesture (see DocumentSync.updateMeta). */
export function updateObjects(patches: Record<string, Partial<ObjectDescriptor> | null>, delay = 0): void {
  updateMeta((meta) => {
    const objs = { ...meta.objects };
    for (const [id, patch] of Object.entries(patches)) {
      if (patch === null) delete objs[id];
      else if (objs[id]) objs[id] = { ...objs[id], ...patch, box: { ...objs[id].box, ...patch.box } };
      else objs[id] = patch as ObjectDescriptor;
    }
    return { ...meta, version: meta.version ?? 1, objects: Object.keys(objs).length ? objs : undefined };
  }, delay);
}

/** Position before the top-level block holding the selection. */
function topLevelPos(editor: Editor): number {
  const $from = editor.state.selection.$from;
  return $from.depth ? $from.before(1) : $from.pos;
}

export type NewObject = "textbox" | "rect" | "roundRect" | "ellipse" | "triangle" | "diamond" | "rightArrow" | "chevron" | "line" | "connector";

/** Insert an object anchored to the current paragraph (its marker goes right before it). */
export function insertObject(kind: NewObject, extra: Partial<ObjectDescriptor> = {}): string | undefined {
  const editor = editorRef;
  if (!editor || !syncRef) return undefined;
  const sel = studio.get().selection;
  if (kind === "connector" && sel.length !== 2) {
    notify("info", loc("Sélectionnez deux objets (Maj+clic) pour les relier.", "Select two objects (Shift+click) to connect them."));
    return undefined;
  }
  const id = uniqueId(kind === "textbox" ? "textbox" : kind === "connector" ? "connector" : "shape", takenIds());
  const box = kind === "line" ? { x: 0, y: 12, width: 160, height: 0 } : kind === "connector" ? { x: 0, y: 0, width: 0, height: 0 } : { x: 0, y: 6, width: kind === "textbox" ? 200 : 120, height: kind === "textbox" ? 70 : 80 };
  const descriptor: ObjectDescriptor = {
    type: kind === "textbox" ? "textbox" : kind === "connector" ? "connector" : "shape",
    placement: "anchored",
    box,
    wrap: kind === "textbox" ? "square" : kind === "line" || kind === "connector" ? "none" : "square",
    ...(kind !== "textbox" && kind !== "connector" ? { shape: kind } : {}),
    ...(kind === "textbox" ? { style: { fill: "FFFFFF", line: "theme.dk2", lineWidth: 0.75 } } : {}),
    ...(kind === "connector" ? { from: { id: sel[0] }, to: { id: sel[1] }, style: { endArrow: "triangle" } } : {}),
    ...extra,
  };
  const schema = editor.schema;
  const body = kind === "textbox" ? [schema.nodes.paragraph.create(null, schema.text("Text"))] : [];
  const node = schema.nodes.msObject.create({ id }, body);
  const at = kind === "connector" ? anchorPosOf(sel[0]) ?? topLevelPos(editor) : topLevelPos(editor);
  syncRef.touched = true;
  // Descriptor first: the node view renders positioned from the start; both go in one edit.
  updateObjects({ [id]: descriptor });
  const tr = editor.state.tr.insert(at, node);
  editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)));
  studio.set({ selection: [id], pane: "format" });
  return id;
}

function anchorPosOf(id: string): number | undefined {
  let found: number | undefined;
  editorRef?.state.doc.forEach((n, pos) => {
    if (n.type.name === "msObject" && n.attrs.id === id) found = pos;
  });
  return found;
}

/** New id for an object: its marker, descriptor and the connectors attached to it follow (one edit). */
export function renameObject(id: string, next: string): void {
  const editor = editorRef;
  const pos = anchorPosOf(id);
  if (!editor || !syncRef || pos === undefined || next === id) return;
  if (takenIds().has(next)) return notify("warning", loc(`L’identifiant « ${next} » est déjà utilisé.`, `The id "${next}" is already used.`));
  const d = objectOf(id);
  const ends: Record<string, Partial<ObjectDescriptor>> = {};
  for (const [cid, c] of Object.entries(objects())) {
    if (c.from?.id === id) ends[cid] = { ...ends[cid], from: { ...c.from, id: next } };
    if (c.to?.id === id) ends[cid] = { ...ends[cid], to: { ...c.to, id: next } };
  }
  syncRef.touched = true;
  updateObjects({ ...ends, [id]: null, ...(d ? { [next]: { ...d, ...ends[id], name: d.name === id ? undefined : d.name } } : {}) });
  editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "id", next));
  studio.set((s) => ({ selection: s.selection.map((x) => (x === id ? next : x)) }));
}

/** Image in the text flow → anchored object (and back with `inlineObject`). */
export function floatSelectedImage(): void {
  const editor = editorRef;
  if (!editor || !syncRef) return;
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== "image") {
    notify("info", loc("Sélectionnez d’abord une image dans le texte.", "Select an image in the text first."));
    return;
  }
  const dom = editor.view.nodeDOM(sel.from) as HTMLElement | null;
  const img = dom?.querySelector("img") ?? (dom instanceof HTMLImageElement ? dom : null);
  const zoom = studio.get().zoom || 1;
  const width = img ? pxToPt(img.getBoundingClientRect().width / zoom) : 200;
  const height = img ? pxToPt(img.getBoundingClientRect().height / zoom) : 150;
  const id = uniqueId(String(sel.node.attrs.alt || "image").toLowerCase(), takenIds());
  const $pos = editor.state.doc.resolve(sel.from);
  const from = $pos.depth ? $pos.before(1) : sel.from;
  const to = $pos.depth ? $pos.after(1) : sel.to;
  const top = editor.state.doc.nodeAt(from)!;
  const imageOnly = top.childCount <= 1 || top.type.name === "image";
  const wrapper = editor.schema.nodes.msObject.create({ id }, [top.type.name === "image" ? top : editor.schema.nodes.paragraph.create(null, sel.node)]);
  syncRef.touched = true;
  updateObjects({ [id]: { type: "image", placement: "anchored", box: { x: 0, y: 0, width, height }, wrap: "square", name: String(sel.node.attrs.alt || id) } });
  const tr = editor.state.tr;
  if (imageOnly) tr.replaceWith(from, to, wrapper);
  else tr.delete(sel.from, sel.to).insert(from, wrapper);
  editor.view.dispatch(tr);
  studio.set({ selection: [id] });
}

/** Object back into the text flow: its body replaces it, its descriptor goes. */
export function inlineObject(id: string): void {
  const editor = editorRef;
  const pos = anchorPosOf(id);
  if (!editor || pos === undefined || !syncRef) return;
  const node = editor.state.doc.nodeAt(pos)!;
  syncRef.touched = true;
  editor.view.dispatch(node.childCount ? editor.state.tr.replaceWith(pos, pos + node.nodeSize, node.content) : editor.state.tr.delete(pos, pos + node.nodeSize));
  updateObjects({ [id]: null });
  studio.set({ selection: [] });
}

export function deleteObjects(ids: string[]): void {
  const editor = editorRef;
  if (!editor || !syncRef) return;
  const locked = ids.filter((id) => objectOf(id)?.locked?.geometry);
  if (locked.length) notify("info", loc(`Verrouillé : ${locked.join(", ")} (déverrouillez dans Calques pour supprimer).`, `Locked: ${locked.join(", ")} (unlock in Layers to delete).`));
  const targets = ids.filter((id) => !locked.includes(id));
  // Connectors attached to deleted objects go with them.
  for (const [cid, c] of Object.entries(objects())) if (c.type === "connector" && (targets.includes(c.from?.id ?? "") || targets.includes(c.to?.id ?? ""))) targets.push(cid);
  const tr = editor.state.tr;
  const ranges: [number, number][] = [];
  editor.state.doc.forEach((n, pos) => n.type.name === "msObject" && targets.includes(String(n.attrs.id)) && ranges.push([pos, pos + n.nodeSize]));
  for (const [a, b] of ranges.reverse()) tr.delete(a, b);
  syncRef.touched = true;
  if (ranges.length) editor.view.dispatch(tr);
  updateObjects(Object.fromEntries(targets.map((id) => [id, null])));
  studio.set({ selection: [] });
}

export function duplicateObjects(ids: string[]): void {
  const editor = editorRef;
  if (!editor || !syncRef) return;
  const taken = takenIds();
  const patches: Record<string, ObjectDescriptor> = {};
  const tr = editor.state.tr;
  const fresh: string[] = [];
  for (const id of ids) {
    const pos = anchorPosOf(id);
    const d = objectOf(id);
    if (pos === undefined || !d || d.type === "connector") continue;
    const node = tr.doc.nodeAt(tr.mapping.map(pos))!;
    const nid = uniqueId(id, taken);
    taken.add(nid);
    fresh.push(nid);
    patches[nid] = { ...structuredClone(d), name: d.name ? `${d.name} copy` : undefined, box: { ...d.box, x: d.box.x + 12, y: d.box.y + 12 } };
    tr.insert(tr.mapping.map(pos), node.type.create({ id: nid }, node.content));
  }
  syncRef.touched = true;
  updateObjects(patches);
  editor.view.dispatch(tr);
  studio.set({ selection: fresh });
}

export function alignObjects(ids: string[], mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "hdist" | "vdist"): void {
  const ds = ids.map((id) => [id, objectOf(id)] as const).filter((x): x is [string, ObjectDescriptor] => !!x[1] && !x[1].locked?.geometry);
  if (ds.length < 2) return notify("info", loc("Sélectionnez au moins deux objets déverrouillés.", "Select at least two unlocked objects."));
  const patches: Record<string, Partial<ObjectDescriptor>> = {};
  const L = Math.min(...ds.map(([, d]) => d.box.x)), R = Math.max(...ds.map(([, d]) => d.box.x + d.box.width));
  const T = Math.min(...ds.map(([, d]) => d.box.y)), B = Math.max(...ds.map(([, d]) => d.box.y + d.box.height));
  if (mode === "hdist" || mode === "vdist") {
    const horiz = mode === "hdist";
    const sorted = [...ds].sort((a, b) => (horiz ? a[1].box.x - b[1].box.x : a[1].box.y - b[1].box.y));
    const total = sorted.reduce((a, [, d]) => a + (horiz ? d.box.width : d.box.height), 0);
    const gap = ((horiz ? R - L : B - T) - total) / (sorted.length - 1);
    let at = horiz ? L : T;
    for (const [id, d] of sorted) {
      patches[id] = { box: horiz ? { ...d.box, x: Math.round(at * 100) / 100 } : { ...d.box, y: Math.round(at * 100) / 100 } };
      at += (horiz ? d.box.width : d.box.height) + gap;
    }
  } else {
    for (const [id, d] of ds) {
      const b = { ...d.box };
      if (mode === "left") b.x = L;
      if (mode === "right") b.x = R - b.width;
      if (mode === "center") b.x = (L + R) / 2 - b.width / 2;
      if (mode === "top") b.y = T;
      if (mode === "bottom") b.y = B - b.height;
      if (mode === "middle") b.y = (T + B) / 2 - b.height / 2;
      patches[id] = { box: b };
    }
  }
  updateObjects(patches);
}

export function groupObjects(ids: string[]): void {
  if (ids.length < 2) return notify("info", loc("Sélectionnez au moins deux objets à grouper.", "Select at least two objects to group."));
  const taken = new Set(Object.values(objects()).flatMap((d) => groupParts(d.group)));
  const name = uniqueId("group", taken);
  updateObjects(Object.fromEntries(ids.map((id) => [id, { group: objectOf(id)?.group ? `${name}/${objectOf(id)!.group}` : name }])));
}

export function ungroup(path: string): void {
  const patches: Record<string, Partial<ObjectDescriptor>> = {};
  for (const [id, d] of Object.entries(objects())) {
    if (!inGroup(d.group, path)) continue;
    const parts = groupParts(d.group);
    const depth = groupParts(path).length;
    const rest = [...parts.slice(0, depth - 1), ...parts.slice(depth)];
    patches[id] = { group: rest.length ? rest.join("/") : undefined };
  }
  updateObjects(patches);
}

/** Layer order within a plane (front = highest z). */
export function reorder(id: string, dir: "front" | "back" | "forward" | "backward"): void {
  const d = objectOf(id);
  if (!d) return;
  const plane = d.plane ?? "front";
  const peers = Object.entries(objects()).filter(([, o]) => (o.plane ?? "front") === plane).sort((a, b) => (a[1].z ?? 0) - (b[1].z ?? 0));
  const order = peers.map(([pid]) => pid);
  const i = order.indexOf(id);
  order.splice(i, 1);
  const to = dir === "front" ? order.length : dir === "back" ? 0 : dir === "forward" ? Math.min(order.length, i + 1) : Math.max(0, i - 1);
  order.splice(to, 0, id);
  updateObjects(Object.fromEntries(order.map((oid, z) => [oid, { z }])));
}

/** Layers panel drag result: new front → back order and group paths. */
export function applyLayerOrder(frontToBack: string[], groups: Map<string, string | undefined>): void {
  const n = frontToBack.length;
  updateObjects(Object.fromEntries(frontToBack.map((id, i) => [id, { z: n - 1 - i, group: groups.get(id) }])));
}

/** Change placement keeping the object where it is on screen. */
export function setPlacement(id: string, placement: "anchored" | "page", relativeTo: "margin" | "page" = "margin"): void {
  const d = objectOf(id);
  const editor = editorRef;
  if (!d || !editor) return;
  const dom = editor.view.dom.querySelector<HTMLElement>(`.ms-object[data-id="${CSS.escape(id)}"]`);
  const layout = studio.get().layout;
  if (!dom) return updateObjects({ [id]: { placement, relativeTo } });
  const left = parseFloat(dom.style.left) || 0;
  const top = parseFloat(dom.style.top) || 0;
  const anchorY = Number(dom.dataset.anchorY) || 0;
  const colLeft = Number(dom.dataset.colLeft) || 0;
  let x: number;
  let y: number;
  if (placement === "page" && layout) {
    const page = layout.pages.find((p) => anchorY >= p.top && anchorY < p.top + p.height + 28) ?? layout.pages[0];
    x = left - page.left - (relativeTo === "margin" ? page.margins.left : 0);
    y = top - page.top - (relativeTo === "margin" ? page.margins.top : 0);
  } else {
    x = left - colLeft;
    y = top - anchorY;
  }
  updateObjects({ [id]: { placement, relativeTo: placement === "page" ? relativeTo : undefined, wrap: placement === "page" ? "none" : d.wrap ?? "square", box: { ...d.box, x: pxToPt(x), y: pxToPt(y) } } });
}

/** Move an object's marker before another top-level block (re-anchor), keeping its page position. */
export function reanchor(id: string, beforePos: number, box: ObjectDescriptor["box"], delay = 0): void {
  const editor = editorRef;
  const pos = anchorPosOf(id);
  if (!editor || pos === undefined || !syncRef) return;
  const node = editor.state.doc.nodeAt(pos)!;
  const selected = editor.state.selection instanceof NodeSelection && editor.state.selection.from === pos;
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  const at = tr.mapping.map(beforePos);
  tr.insert(at, node);
  // The moved object stays selected (copy, delete and nudges keep acting on it).
  if (selected) tr.setSelection(NodeSelection.create(tr.doc, at));
  syncRef.touched = true;
  editor.view.dispatch(tr);
  updateObjects({ [id]: { box } }, delay);
}

/* Paragraph / character formatting ----------------------------------- */

/** Containers whose child blocks are formatted on their own (objects, columns, alignment, `:::` groups). */
const BLOCK_CONTAINERS = new Set(["msObject", "columns", "column", "alignBlock", "directiveBlock"]);

/**
 * Block holding the caret: a top-level block, or a block of a container (object body, column,
 * `:::` group) — paragraph formatting reaches inside them. A selected object stands for its first block.
 */
export function currentBlock(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "msObject") return sel.node.firstChild ? { node: sel.node.firstChild, pos: sel.from + 1 } : null;
  const $from = sel.$from;
  // A selected block (diagram, image, table…) is its own block; its selection starts outside it.
  if (sel instanceof NodeSelection && ($from.depth === 0 || BLOCK_CONTAINERS.has($from.parent.type.name))) return { node: sel.node, pos: sel.from };
  for (let d = $from.depth; d > 0; d--) if (d === 1 || BLOCK_CONTAINERS.has($from.node(d - 1).type.name)) return { node: $from.node(d), pos: $from.before(d) };
  return null;
}

/** Merge `patch` into the `ms:block` properties of the blocks in the selection (container bodies included). */
export function setBlockProps(patch: Partial<BlockProps>): void {
  const story = activeStory();
  if (story) return styleStory(story, patch);
  const editor = editorRef;
  if (!editor || !syncRef) return;
  const { from, to } = editor.state.selection;
  const tr = editor.state.tr;
  editor.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (BLOCK_CONTAINERS.has(node.type.name)) return true;
    if (parent !== editor.state.doc && !BLOCK_CONTAINERS.has(parent?.type.name ?? "")) return false;
    if (!("msBlock" in node.attrs)) return false;
    const props = { ...parseBlockProps(node.attrs.msBlock), ...patch };
    for (const k of Object.keys(props) as (keyof BlockProps)[]) if (props[k] === undefined || props[k] === null || (props[k] as unknown) === "") delete props[k];
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, msBlock: Object.keys(props).length ? JSON.stringify(props) : null });
    return false;
  });
  syncRef.touched = true;
  editor.view.dispatch(tr);
}

/** New paragraph in `style` after the block holding the selection (never merged into it); caret at its end. */
export function insertStyledParagraph(text: string, style: string): void {
  const editor = editorRef;
  if (!editor) return;
  const sel = editor.state.selection;
  const $p = sel.$to;
  let d = $p.depth;
  while (d > 1 && !/^(doc|msObject|column)$/.test($p.node(d - 1).type.name)) d--;
  const at = sel instanceof NodeSelection ? sel.to : d ? $p.after(d) : $p.pos;
  const node = { type: "paragraph", attrs: { msBlock: JSON.stringify({ style }) }, content: text ? [{ type: "text", text }] : [] };
  editor.chain().focus().insertContentAt(at, node).setTextSelection(at + 1 + text.length).run();
}

/**
 * Text of the `::: id` group `id` (header, footer, placeholder): updated, or added at the start of the
 * text; `change` registers the id in the frontmatter in the same edit. Empty `markdown` with
 * `dropEmpty` removes the group.
 */
export function setGroupText(id: string, markdown: string, change?: (meta: StudioMeta) => StudioMeta, dropEmpty = false): void {
  const editor = editorRef;
  if (!editor || !syncRef) return;
  if (change) updateMeta(change);
  let found: { pos: number; node: PMNode } | undefined;
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === "msStory" && node.attrs.id === id) found = { pos, node };
  });
  const tr = editor.state.tr;
  if (found && !markdown && dropEmpty) tr.delete(found.pos, found.pos + found.node.nodeSize);
  else if (found) {
    if (found.node.attrs.markdown === markdown) return;
    tr.setNodeMarkup(found.pos, undefined, { id, markdown });
  } else if (markdown || !dropEmpty) tr.insert(0, editor.schema.nodes.msStory.create({ id, markdown }));
  else return;
  syncRef.touched = true;
  editor.view.dispatch(tr);
}

/** Texts of the header / footer / placeholder groups, kept in the store for the page layout. */
function refreshGroupTexts(editor: Editor): void {
  const texts: Record<string, string> = {};
  editor.state.doc.forEach((n) => {
    if (n.type.name === "msStory") texts[String(n.attrs.id)] = String(n.attrs.markdown);
  });
  if (JSON.stringify(texts) === JSON.stringify(studio.get().groupTexts)) return;
  studio.set({ groupTexts: texts });
  resolveDocument();
}

/** The header / footer text area being edited, if any (`data-kind`, `data-variant`). */
function activeStory(): HTMLTextAreaElement | null {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement && el.classList.contains("ms-story-input") ? el : null;
}

/** Style / alignment of the header or footer being edited: the whole story (document `blocks.<id>`, a master's `block`). */
function styleStory(ta: HTMLTextAreaElement, patch: Partial<BlockProps>): void {
  const kind = ta.dataset.kind as "headers" | "footers";
  const variant = (ta.dataset.variant ?? "default") as keyof StorySet;
  const clean = (p: BlockProps): BlockProps | undefined => {
    const out = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "")) as BlockProps;
    return Object.keys(out).length ? out : undefined;
  };
  const m = studio.get().masterEdit;
  if (m) {
    const s = m[kind]?.[variant] ?? {};
    updateMaster({ [kind]: { ...m[kind], [variant]: { ...s, block: clean({ ...s.block, ...patch }) } } } as Partial<MasterDef>);
    return;
  }
  const id = storyGroupId(kind, variant);
  setGroupText(id, ta.value, (meta) => {
    const blocks = { ...meta.blocks, [id]: clean({ ...meta.blocks?.[id], ...patch })! };
    if (!blocks[id]) delete blocks[id];
    const story = { ...meta[kind]?.[variant], id };
    delete story.markdown;
    return { ...meta, [kind]: { ...meta[kind], [variant]: story }, blocks: Object.keys(blocks).length ? blocks : undefined };
  });
}

/** Named paragraph style (headings keep their level; style stored in ms:block). */
export function applyParagraphStyle(styleId: string | null): void {
  const story = activeStory();
  if (story) return styleStory(story, { style: styleId && styleId !== "Normal" ? styleId : undefined });
  const sheet = studio.get().sections[0].sheet;
  const s = styleId ? sheet.styles.get(styleId) : undefined;
  const editor = editorRef;
  if (!editor) return;
  if (s?.outlineLevel && s.outlineLevel <= 6 && /^Heading\d$/.test(s.id)) {
    editor.chain().focus().setHeading({ level: s.outlineLevel as 1 }).run();
    setBlockProps({ style: undefined });
    return;
  }
  if (styleId === "Normal" || styleId === null) {
    if (editor.isActive("heading")) editor.chain().focus().setParagraph().run();
    setBlockProps({ style: undefined });
    return;
  }
  if (editor.isActive("heading") && !s?.outlineLevel) editor.chain().focus().setParagraph().run();
  setBlockProps({ style: styleId });
}

/* Styles, masters, page ------------------------------------------------ */

export function setStyleOverride(id: string, patch: Partial<StyleDef> | null): void {
  updateMeta((meta) => {
    const styles = { ...meta.styles };
    if (patch === null) delete styles[id];
    else styles[id] = { ...styles[id], ...patch, paragraph: { ...styles[id]?.paragraph, ...patch.paragraph }, run: { ...styles[id]?.run, ...patch.run } };
    return { ...meta, styles: Object.keys(styles).length ? styles : undefined };
  });
}

export function setDocumentMaster(id: string | undefined): void {
  updateMeta((meta) => ({ ...meta, version: meta.version ?? 1, master: id }));
}

export function setPageSetup(patch: StudioMeta["page"]): void {
  updateMeta((meta) => ({ ...meta, page: { ...meta.page, ...patch, margins: { ...meta.page?.margins, ...patch?.margins } } }));
}

export function insertSectionBreak(props: SectionProps): void {
  const editor = editorRef;
  if (!editor || !syncRef) return;
  syncRef.touched = true;
  editor.chain().focus().insertContent({ type: "msSection", attrs: { props: JSON.stringify(props) } }).run();
}

export function setSectionProps(pos: number, props: SectionProps): void {
  const editor = editorRef;
  if (!editor || !syncRef) return;
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== "msSection") return;
  syncRef.touched = true;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { props: JSON.stringify(props) }));
}

/** Section break before the selection (null = the first section, defined by the frontmatter). */
export function currentSectionBreak(editor: Editor): { pos: number; props: SectionProps } | null {
  const at = editor.state.selection.from;
  let found: { pos: number; props: SectionProps } | null = null;
  editor.state.doc.forEach((n, pos) => {
    if (pos >= at || n.type.name !== "msSection") return;
    try {
      found = { pos, props: JSON.parse(n.attrs.props || "{}") };
    } catch {
      found = { pos, props: {} };
    }
  });
  return found;
}

export function selectObject(id: string): void {
  const editor = editorRef;
  const pos = anchorPosOf(id);
  if (!editor || pos === undefined) return;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)).scrollIntoView());
  studio.set({ selection: [id] });
}

export function selectBlockAt(pos: number): void {
  const editor = editorRef;
  if (!editor) return;
  editor.chain().focus().setTextSelection(Math.min(pos + 1, editor.state.doc.content.size)).scrollIntoView().run();
}

/* Integrity: unique ids after paste / duplicate / split; descriptors follow their objects. */

const integrityKey = new PluginKey("msIntegrity");
export const StudioIntegrity = Extension.create({
  name: "msIntegrity",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: integrityKey,
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta("msSourceUpdate"))) return null;
          const seenObj = new Set<string>();
          const seenBlock = new Set<string>();
          const tr = newState.tr;
          const clones: Record<string, ObjectDescriptor> = {};
          const taken = new Set(Object.keys(objects()));
          newState.doc.forEach((n) => n.type.name === "msObject" && taken.add(String(n.attrs.id)));
          // Objects and block ids live on top-level blocks only.
          newState.doc.forEach((n: PMNode, pos: number) => {
            if (n.type.name === "msObject") {
              const id = String(n.attrs.id);
              if (seenObj.has(id)) {
                const nid = uniqueId(id, taken);
                taken.add(nid);
                const d = objectOf(id);
                if (d) clones[nid] = { ...structuredClone(d), box: { ...d.box, x: d.box.x + 12, y: d.box.y + 12 } };
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, id: nid });
              }
              seenObj.add(id);
            }
            const props = n.attrs?.msBlock ? parseBlockProps(n.attrs.msBlock) : null;
            if (props?.id) {
              if (seenBlock.has(props.id)) {
                const { id: _drop, ...rest } = props;
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, msBlock: Object.keys(rest).length ? JSON.stringify(rest) : null });
              }
              seenBlock.add(props.id);
            }
          });
          // Objects removed by the user: their descriptors go too.
          const before = new Set<string>();
          oldState.doc.forEach((n) => n.type.name === "msObject" && before.add(String(n.attrs.id)));
          const removed = [...before].filter((id) => !seenObj.has(id) && objectOf(id));
          if (Object.keys(clones).length || removed.length) {
            queueMicrotask(() => updateObjects({ ...clones, ...Object.fromEntries(removed.map((id) => [id, null])) }));
          }
          // Anchor lost: the object now follows the next block.
          const mapping = new Mapping();
          for (const t of trs) mapping.appendMapping(t.mapping);
          oldState.doc.forEach((n, pos, i) => {
            if (n.type.name !== "msObject" || !seenObj.has(String(n.attrs.id))) return;
            const next = oldState.doc.maybeChild(i + 1);
            if (!next || next.type.name === "msObject") return;
            const after = pos + n.nodeSize;
            if (mapping.mapResult(after + 1).deleted && mapping.mapResult(after + next.nodeSize - 1).deleted) {
              queueMicrotask(() => notify("info", loc(`« ${objectOf(String(n.attrs.id))?.name ?? n.attrs.id} » a perdu son paragraphe : il suit maintenant le suivant.`, `"${objectOf(String(n.attrs.id))?.name ?? n.attrs.id}" lost its paragraph: it now follows the next one.`)));
            }
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

export { TextSelection };

/* Any block becomes a floating object ----------------------------------- */

/**
 * The top-level block at `pos` becomes a positioned object, kept where it is on screen: "anchored"
 * follows the next paragraph, "page" stays on its page. Pictures become picture objects; anything
 * else (paragraphs, tables, lists, code, diagrams…) a borderless text frame around the block.
 */
export function floatBlockAt(pos: number, placement: "anchored" | "page"): string | undefined {
  const editor = editorRef;
  if (!editor || !syncRef) return undefined;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || ["msObject", "msPageBreak", "msSection"].includes(node.type.name)) return undefined;
  const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
  if (!dom) return undefined;
  const zoom = studio.get().zoom || 1;
  const root = editor.view.dom.getBoundingClientRect();
  const r = dom.getBoundingClientRect();
  const x = (r.left - root.left) / zoom;
  const y = (r.top - root.top) / zoom;
  const width = pxToPt(r.width / zoom);
  const height = pxToPt(r.height / zoom);
  const image = node.type.name === "image" || (node.childCount === 1 && node.firstChild?.type.name === "image");
  const base = image ? String((node.type.name === "image" ? node : node.firstChild!).attrs.alt || "image").toLowerCase() : node.type.name === "table" ? "table" : "frame";
  const id = uniqueId(base, takenIds());
  let box = { x: 0, y: 0, width, height };
  if (placement === "page") {
    const pages = studio.get().layout?.pages ?? [];
    const page = pages.find((p) => y >= p.top && y < p.top + p.height) ?? pages[0];
    if (page) box = { x: pxToPt(x - page.left - page.margins.left), y: pxToPt(y - page.top - page.margins.top), width, height };
  }
  const where = placement === "page" ? { relativeTo: "margin" as const, wrap: "none" as const } : { wrap: "topBottom" as const };
  const descriptor: ObjectDescriptor = image
    ? { type: "image", placement, box, ...where }
    : { type: "textbox", placement, box, ...where, style: { fill: null, line: null, padding: 0 } };
  syncRef.touched = true;
  updateObjects({ [id]: descriptor });
  const tr = editor.state.tr;
  // The object anchors to the block after it: a document that ends here gets an empty paragraph.
  if (pos + node.nodeSize >= tr.doc.content.size) tr.insert(pos + node.nodeSize, editor.schema.nodes.paragraph.create());
  tr.replaceWith(pos, pos + node.nodeSize, editor.schema.nodes.msObject.create({ id }, [node]));
  editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
  studio.set({ selection: [id], tab: "format" });
  return id;
}

/* Connector tool ---------------------------------------------------------- */

export function startConnect(): void {
  const { selection, connectFrom } = studio.get();
  if (connectFrom !== null) return studio.set({ connectFrom: null });
  if (selection.length === 2) {
    insertObject("connector");
    return;
  }
  studio.set({ connectFrom: selection.length === 1 ? selection[0] : "" });
}

/** Connector tool click on an object; false when the tool is off. */
export function connectClick(id: string): boolean {
  const { connectFrom } = studio.get();
  if (connectFrom === null) return false;
  if (!connectFrom) {
    studio.set({ connectFrom: id, selection: [id] });
    return true;
  }
  if (connectFrom !== id) {
    studio.set({ selection: [connectFrom, id], connectFrom: null });
    insertObject("connector");
  }
  return true;
}

/* Master editing on the canvas ------------------------------------------ */

/** The master being edited came from a built-in starter: saving creates a library copy. */
let masterOrigin: { id: string; starter: boolean } | null = null;

export function enterMasterEdit(ref?: string): void {
  const s = studio.get();
  const m = (ref && lookupMaster(ref)) || lookupMaster("studio-body");
  if (!m) return notify("warning", loc("Aucun masque à modifier.", "No master to edit."));
  const starter = !!s.entries.find((e) => e.id === m.id)?.readonly;
  masterOrigin = { id: m.id, starter };
  const copy: MasterDef = structuredClone(m);
  if (starter) {
    copy.id = uniqueId(`${m.id.replace(/^studio-/, "")}-custom`, new Set(s.entries.map((e) => e.id)));
    copy.name = `${m.name} (${loc("personnalisé", "custom")})`;
    copy.provenance = { source: "user" };
  }
  editorRef?.commands.blur();
  studio.set({ masterEdit: copy, masterEditOf: m.id, masterSel: [], selection: [], tab: "insert", pane: "format", rightOpen: true });
  resolveDocument();
}

/** Close master edit mode; `save` writes the master (a starter becomes a library copy applied here). */
export async function exitMasterEdit(save: boolean): Promise<void> {
  const m = studio.get().masterEdit;
  if (!m) return;
  if (save) {
    await saveMaster(m);
    if (masterOrigin?.starter) {
      const current = studio.get().meta?.master;
      if (!current || current === masterOrigin.id) setDocumentMaster(m.id);
    }
  }
  masterOrigin = null;
  studio.set({ masterEdit: null, masterEditOf: null, masterSel: [], tab: "home" });
  resolveDocument();
}

function setMaster(change: (m: MasterDef) => MasterDef): void {
  const m = studio.get().masterEdit;
  if (!m) return;
  studio.set({ masterEdit: change(structuredClone(m)) });
  resolveDocument();
}

export function updateMaster(patch: Partial<MasterDef>): void {
  setMaster((m) => ({ ...m, ...patch }));
}

export function updateMasterObjects(patches: Record<string, Partial<ObjectDescriptor> | null>): void {
  setMaster((m) => {
    const bg = { ...m.background };
    for (const [id, patch] of Object.entries(patches)) {
      if (patch === null) delete bg[id];
      else if (bg[id]) bg[id] = { ...bg[id], ...patch, box: { ...bg[id].box, ...patch.box } };
    }
    return { ...m, background: bg };
  });
}

/** New id for a master object (placeholder keys stay as they are). */
export function renameMasterObject(id: string, next: string): void {
  const d = studio.get().masterEdit?.background?.[id];
  if (!d || next === id) return;
  if (studio.get().masterEdit?.background?.[next]) return notify("warning", loc(`L’identifiant « ${next} » est déjà utilisé.`, `The id "${next}" is already used.`));
  setMaster((m) => ({ ...m, background: Object.fromEntries(Object.entries(m.background ?? {}).map(([k, v]) => (k === id ? [next, { ...v, name: v.name === id ? undefined : v.name }] : [k, v]))) }));
  studio.set((s) => ({ masterSel: s.masterSel.map((x) => (x === id ? next : x)) }));
}

/**
 * New master object at the page's upper third. `placeholder`: a text placeholder (key: the document
 * types its text) or an automatic field (date, page, pages); `"*"` makes a new text key.
 */
/** `at`: top-left from the page's top-left corner, pt (where the page was right-clicked). */
export function addMasterObject(kind: NewObject, extra: Partial<ObjectDescriptor> = {}, at?: { x: number; y: number }): void {
  const m = studio.get().masterEdit;
  if (!m) return;
  const taken = new Set(Object.keys(m.background ?? {}));
  const ph = extra.placeholder === "*" ? uniqueId("texte", new Set([...taken, ...TEXT_PRESETS().map((p) => p.key)])) : extra.placeholder && placeholderKey(extra.placeholder);
  const id = uniqueId(ph ?? (kind === "textbox" ? "texte" : "forme"), taken);
  const preset = TEXT_PRESETS().find((p) => p.key === ph);
  const page = studio.get().sections[0]?.page;
  const w = kind === "textbox" ? (ph && isAutoField(ph) ? 140 : 300) : kind === "line" ? 200 : 120;
  const h = kind === "textbox" ? Math.max(28, (preset?.fontSize ?? 12) * 1.9) : kind === "line" ? 0 : 80;
  const d: ObjectDescriptor = {
    type: kind === "textbox" ? "textbox" : "shape",
    ...(kind !== "textbox" ? { shape: kind as ObjectDescriptor["shape"] } : {}),
    placement: "page",
    relativeTo: "page",
    box: at && page
      ? { x: Math.round(Math.min(Math.max(0, at.x), page.width - w) * 100) / 100, y: Math.round(Math.min(Math.max(0, at.y), page.height - h) * 100) / 100, width: w, height: h }
      : { x: page ? (page.width - w) / 2 : 100, y: page ? page.height / 3 : 200, width: w, height: h },
    plane: "front",
    ...(kind === "textbox" ? { text: ph ? (isAutoField(ph) ? undefined : placeholderPrompt(ph)) : loc("Texte", "Text"), style: { fill: null, line: null, fontSize: preset?.fontSize ?? 12 } } : {}),
    ...extra,
    ...(ph ? { placeholder: ph } : {}),
  };
  setMaster((x) => ({ ...x, background: { ...x.background, [id]: d } }));
  studio.set({ masterSel: [id], tab: "format", pane: "format" });
}

/**
 * Master object role: floating (movable), fixed (locked in place) or a placeholder — a box each
 * document fills with its own text (`key`), or an automatic field (date, page, pages).
 */
export function setMasterObjectMode(id: string, mode: "floating" | "fixed" | "placeholder", placeholder?: string): void {
  const d = studio.get().masterEdit?.background?.[id];
  if (!d) return;
  if (mode === "placeholder") {
    const key = placeholderKey(placeholder ?? d.placeholder ?? (TEXT_PRESETS().some((p) => p.key === id) ? id : "title"));
    updateMasterObjects({ [id]: { type: "textbox", shape: undefined, placeholder: key, text: isAutoField(key) ? undefined : d.placeholder && placeholderKey(d.placeholder) === key ? d.text : placeholderPrompt(key), style: { ...d.style, fill: d.style?.fill ?? null, line: d.style?.line ?? null } } });
  } else {
    updateMasterObjects({ [id]: { placeholder: undefined, ...(d.placeholder ? { text: d.text ?? loc("Texte", "Text") } : {}), locked: { ...d.locked, geometry: mode === "fixed" || undefined } } });
  }
}

export function deleteMasterObjects(ids: string[]): void {
  updateMasterObjects(Object.fromEntries(ids.map((id) => [id, null])));
  studio.set({ masterSel: [] });
}
