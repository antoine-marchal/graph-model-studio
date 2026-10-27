/**
 * Right-click menus, Slides Studio's engine (clipboard quick bar, submenus, keyboard: arrows move,
 * → / ← open and close submenus, Enter runs, Escape closes) with the commands of what was clicked:
 * selected text, the block under the caret, objects, the page, a header / footer, a master object
 * or an outline heading. Every command reuses the ribbon's actions.
 */
import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { Icon, type IconName } from "./icons";
import { tr, hexOf } from "./ui";
import { studio, useStudio, type MenuTarget } from "./store";
import {
  addMasterObject, alignObjects, applyParagraphStyle, deleteMasterObjects, deleteObjects, duplicateObjects, enterMasterEdit, exitMasterEdit, floatBlockAt, getEditor, getSync, groupObjects, inlineObject,
  insertSectionBreak, reorder, setBlockProps, setMasterObjectMode, setPageSetup, setPlacement, startConnect, ungroup, updateMasterObjects, updateObjects, currentSectionBreak,
} from "./actions";
import { parseBlockProps, setSpanStyle } from "../extensions/StudioNodes";
import { paletteTokens } from "../../document/styles";
import { pxToPt } from "../../document/units";
import { groupParts } from "../../../slides-studio/packages/core/src/groups";
import { revealSource } from "./commands";
import { manualFit, setZoom } from "./PageLayer";
import { vscodeApi } from "../vscode-api";
import { withUniqueGmcId } from "../extensions/GmcBlock";
import { AUTO_FIELDS, AUTO_LABELS, TEXT_PRESETS, placeholderKey } from "../../document/placeholders";

interface Cmd {
  id: string;
  label: string;
  icon?: IconName;
  kbd?: string;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  items?: Entry[];
  swatch?: string;
}
type Entry = Cmd | "sep";

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const key = (k: string) => (MAC ? k.replace(/Ctrl\+/g, "⌘").replace(/Shift\+/g, "⇧").replace(/Alt\+/g, "⌥") : tr(k.replace(/Shift/g, "Maj").replace(/Delete/g, "Suppr").replace(/Enter/g, "Entrée"), k));
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

const exec = (editor: Editor, cmd: "cut" | "copy") => () => (editor.commands.focus(), document.execCommand(cmd));
async function paste(editor: Editor): Promise<void> {
  try {
    for (const it of await navigator.clipboard.read()) {
      if (it.types.includes("text/html")) return void editor.chain().focus().insertContent(await (await it.getType("text/html")).text()).run();
    }
    const t = await navigator.clipboard.readText();
    if (t) editor.chain().focus().insertContent(t).run();
  } catch {
    // Clipboard refused: Ctrl+V still works.
  }
}

function styleItems(editor: Editor): Entry[] {
  const sheet = studio.get().sections[0]?.sheet;
  if (!sheet) return [];
  const $from = editor.state.selection.$from;
  const top = $from.depth ? $from.node(1) : null;
  const current = editor.isActive("heading") ? `Heading${editor.getAttributes("heading").level}` : parseBlockProps(top?.attrs.msBlock).style ?? "Normal";
  return [...sheet.styles.values()].filter((s) => s.type === "paragraph").map((s) => ({ id: `style-${s.id}`, label: s.name, checked: s.id === current, run: () => applyParagraphStyle(s.id) }));
}

function colorItems(run: (hex: string | null) => void): Entry[] {
  const theme = studio.get().sections[0]?.sheet.theme;
  const base = theme ? paletteTokens(theme).filter((t) => t.token.split(".").length === 2) : [];
  return [{ id: "color-auto", label: tr("Automatique", "Automatic"), run: () => run(null) }, "sep", ...base.map((t) => ({ id: `color-${t.token}`, label: t.token.replace("theme.", ""), swatch: `#${t.hex}`, run: () => run(t.hex) }))];
}

function textCommands(editor: Editor): { quick: Cmd[]; entries: Entry[] } {
  const ro = !editor.isEditable;
  return {
    quick: [
      { id: "cut", label: tr("Couper", "Cut"), icon: "cut", kbd: key("Ctrl+X"), disabled: ro, run: exec(editor, "cut") },
      { id: "copy", label: tr("Copier", "Copy"), icon: "copy", kbd: key("Ctrl+C"), run: exec(editor, "copy") },
      { id: "paste", label: tr("Coller", "Paste"), icon: "paste", kbd: key("Ctrl+V"), disabled: ro, run: () => void paste(editor) },
      { id: "clear", label: tr("Effacer", "Clear"), icon: "clearFormat", disabled: ro, run: () => editor.chain().focus().unsetAllMarks().run() },
    ],
    entries: [
      { id: "bold", label: tr("Gras", "Bold"), icon: "bold", kbd: key("Ctrl+B"), checked: editor.isActive("bold") || undefined, disabled: ro, run: () => editor.chain().focus().toggleBold().run() },
      { id: "italic", label: tr("Italique", "Italic"), icon: "italic", kbd: key("Ctrl+I"), checked: editor.isActive("italic") || undefined, disabled: ro, run: () => editor.chain().focus().toggleItalic().run() },
      { id: "underline", label: tr("Souligné", "Underline"), icon: "underline", kbd: key("Ctrl+U"), checked: editor.isActive("underline") || undefined, disabled: ro, run: () => editor.chain().focus().toggleUnderline().run() },
      "sep",
      { id: "size", label: tr("Taille", "Size"), icon: "heading", disabled: ro, items: [{ id: "size-auto", label: tr("Taille du style", "Style size"), run: () => setSpanStyle(editor, { "font-size": null }) }, "sep", ...FONT_SIZES.map((s) => ({ id: `size-${s}`, label: `${s} pt`, run: () => setSpanStyle(editor, { "font-size": `${s}pt` }) }))] },
      { id: "color", label: tr("Couleur du texte", "Text color"), icon: "fillColor", disabled: ro, items: colorItems((hex) => setSpanStyle(editor, { color: hex ? `#${hex}` : null })) },
      { id: "highlight", label: tr("Surlignage", "Highlight"), icon: "highlight", disabled: ro, items: colorItems((hex) => setSpanStyle(editor, { "background-color": hex ? `#${hex}` : null })) },
      { id: "style", label: tr("Style de paragraphe", "Paragraph style"), icon: "styles", disabled: ro, items: styleItems(editor) },
      "sep",
      { id: "link", label: tr("Lien…", "Link…"), icon: "link", disabled: ro, run: () => vscodeApi.postMessage({ type: "runCommand", command: "betterMarkdown.insertLink" }) },
      { id: "reveal", label: tr("Voir dans la source", "Show in source"), icon: "code", run: () => sourceOfSelection(editor) },
    ],
  };
}

function sourceOfSelection(editor: Editor): void {
  const $from = editor.state.selection.$from;
  if (!$from.depth) return;
  const line = getSync()?.lineOf($from.node(1));
  if (line) revealSource(line);
}

const BLOCK_LABEL: Record<string, string> = {
  paragraph: tr("Paragraphe", "Paragraph"), heading: tr("Titre", "Heading"), table: tr("Tableau", "Table"), image: "Image", codeBlock: tr("Code", "Code"), gmcBlock: tr("Diagramme GMC", "GMC diagram"),
  mermaidBlock: "Mermaid", mathBlock: tr("Équation", "Equation"), bulletList: tr("Liste", "List"), orderedList: tr("Liste numérotée", "Numbered list"), taskList: tr("Liste de tâches", "Checklist"),
  blockquote: tr("Citation", "Quote"), directiveBlock: tr("Contenu intégré", "Embedded content"), deckBlock: tr("Présentation", "Slide deck"), msPageBreak: tr("Saut de page", "Page break"), msSection: tr("Saut de section", "Section break"),
};

function blockCommands(editor: Editor, pos: number): { quick: Cmd[]; entries: Entry[] } {
  const ro = !editor.isEditable;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return { quick: [], entries: [] };
  const name = node.type.name;
  const breakNode = name === "msPageBreak" || name === "msSection";
  const props = parseBlockProps(node.attrs.msBlock);
  const canProps = "msBlock" in node.attrs;
  const del = () => editor.chain().focus().command(({ tr: t }) => (t.delete(pos, pos + node.nodeSize), true)).run();
  const move = (dir: -1 | 1) => () => {
    const $p = editor.state.doc.resolve(pos);
    const index = $p.index(0);
    const other = editor.state.doc.maybeChild(index + dir);
    if (!other) return;
    const t = editor.state.tr;
    if (dir < 0) t.delete(pos, pos + node.nodeSize).insert(pos - other.nodeSize, node);
    else t.delete(pos, pos + node.nodeSize).insert(pos + other.nodeSize, node);
    editor.view.dispatch(t.scrollIntoView());
  };
  const inTable = editor.isActive("table");
  const tableItems: Entry[] = inTable
    ? [
        { id: "row-above", label: tr("Insérer une ligne au-dessus", "Insert row above"), icon: "rowAbove", run: () => editor.chain().focus().addRowBefore().run() },
        { id: "row-below", label: tr("Insérer une ligne en dessous", "Insert row below"), icon: "rowBelow", run: () => editor.chain().focus().addRowAfter().run() },
        { id: "col-left", label: tr("Insérer une colonne à gauche", "Insert column left"), icon: "colLeft", run: () => editor.chain().focus().addColumnBefore().run() },
        { id: "col-right", label: tr("Insérer une colonne à droite", "Insert column right"), icon: "colRight", run: () => editor.chain().focus().addColumnAfter().run() },
        "sep",
        { id: "row-del", label: tr("Supprimer la ligne", "Delete row"), icon: "rowDelete", run: () => editor.chain().focus().deleteRow().run() },
        { id: "col-del", label: tr("Supprimer la colonne", "Delete column"), icon: "colDelete", run: () => editor.chain().focus().deleteColumn().run() },
        { id: "header-row", label: tr("Ligne d’en-tête", "Header row"), icon: "tableHeader", run: () => editor.chain().focus().toggleHeaderRow().run() },
      ]
    : [];
  return {
    quick: [
      { id: "cut", label: tr("Couper", "Cut"), icon: "cut", kbd: key("Ctrl+X"), disabled: ro, run: () => (editor.chain().setNodeSelection(pos).run(), exec(editor, "cut")()) },
      { id: "copy", label: tr("Copier", "Copy"), icon: "copy", kbd: key("Ctrl+C"), run: () => (editor.chain().setNodeSelection(pos).run(), exec(editor, "copy")()) },
      { id: "paste", label: tr("Coller", "Paste"), icon: "paste", kbd: key("Ctrl+V"), disabled: ro, run: () => void paste(editor) },
      { id: "duplicate", label: tr("Dupliquer", "Duplicate"), icon: "duplicate", disabled: ro || breakNode, run: () => editor.chain().focus().insertContentAt(pos + node.nodeSize, name === "gmcBlock" ? withUniqueGmcId(editor, node.toJSON()) : node.toJSON()).run() },
    ],
    entries: [
      ...(canProps ? [{ id: "style", label: tr("Style", "Style"), icon: "styles" as const, disabled: ro, items: styleItems(editor) }] : []),
      ...(inTable ? [{ id: "table", label: tr("Tableau", "Table"), icon: "table" as const, disabled: ro, items: tableItems }] : []),
      ...(name === "gmcBlock" ? [{ id: "edit-gmc", label: tr("Modifier le diagramme", "Edit diagram"), icon: "diagram" as const, run: () => (editor.view.nodeDOM(pos) as HTMLElement | null)?.querySelector<HTMLElement>("[data-testid='gmc-fence-preview'], .gmc-block-preview")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })) }] : []),
      ...(name === "directiveBlock" ? [{ id: "refresh", label: tr("Actualiser le contenu intégré", "Refresh embedded content"), icon: "refresh" as const, run: () => vscodeApi.postMessage({ type: "runCommand", command: "markdown-embed.update" }) }] : []),
      ...(breakNode ? [] : [{
        id: "position", label: tr("Position", "Position"), icon: "anchor" as const, disabled: ro,
        items: [
          { id: "inline", label: tr("Aligné sur le texte", "In line with text"), icon: "inline" as const, checked: true },
          { id: "float", label: tr("Flottant, se déplace avec le texte", "Floating, moves with text"), icon: "float" as const, run: () => floatBlockAt(pos, "anchored") },
          { id: "fixed", label: tr("Fixe sur la page", "Fixed on the page"), icon: "pin" as const, run: () => floatBlockAt(pos, "page") },
        ] as Entry[],
      }]),
      ...(canProps ? [{
        id: "breaks", label: tr("Enchaînements", "Line and page breaks"), icon: "keepNext" as const, disabled: ro,
        items: [
          { id: "keep-next", label: tr("Paragraphes solidaires", "Keep with next"), checked: !!props.keepWithNext, run: () => setBlockProps({ keepWithNext: props.keepWithNext ? undefined : true }) },
          { id: "keep-together", label: tr("Lignes solidaires", "Keep lines together"), checked: !!props.keepTogether, run: () => setBlockProps({ keepTogether: props.keepTogether ? undefined : true }) },
          { id: "break-before", label: tr("Saut de page avant", "Page break before"), checked: !!props.pageBreakBefore, run: () => setBlockProps({ pageBreakBefore: props.pageBreakBefore ? undefined : true }) },
        ] as Entry[],
      }] : []),
      "sep",
      { id: "up", label: tr("Monter", "Move up"), icon: "moveUp", kbd: key("Alt+↑"), disabled: ro || editor.state.doc.resolve(pos).index(0) === 0, run: move(-1) },
      { id: "down", label: tr("Descendre", "Move down"), icon: "moveDown", kbd: key("Alt+↓"), disabled: ro || editor.state.doc.resolve(pos).index(0) >= editor.state.doc.childCount - 1, run: move(1) },
      { id: "page-break", label: tr("Saut de page avant ce bloc", "Page break before this block"), icon: "pageBreak", disabled: ro, run: () => editor.chain().focus().insertContentAt(pos, { type: "msPageBreak" }).run() },
      { id: "format", label: canProps ? tr("Format du paragraphe…", "Paragraph format…") : tr("Mise en forme…", "Format…"), icon: "brush", run: () => studio.set({ pane: "format", rightOpen: true }) },
      { id: "reveal", label: tr("Voir dans la source", "Show in source"), icon: "code", run: () => { const l = getSync()?.lineOf(node); if (l) revealSource(l); } },
      "sep",
      { id: "delete", label: tr(`Supprimer : ${BLOCK_LABEL[name] ?? name}`, `Delete ${BLOCK_LABEL[name] ?? name}`), icon: "trash", danger: true, disabled: ro, run: del },
    ],
  };
}

function objectCommands(editor: Editor): { quick: Cmd[]; entries: Entry[] } {
  const ro = !editor.isEditable;
  const { selection, meta } = studio.get();
  const objs = selection.map((id) => [id, meta?.objects?.[id]] as const).filter((x) => !!x[1]);
  const one = objs.length === 1 ? objs[0][1]! : null;
  const id = objs[0]?.[0];
  const locked = objs.every(([, d]) => d!.locked?.geometry);
  const hidden = objs.every(([, d]) => d!.hidden);
  return {
    quick: [
      { id: "cut", label: tr("Couper", "Cut"), icon: "cut", kbd: key("Ctrl+X"), disabled: ro, run: () => (exec(editor, "copy")(), deleteObjects(selection)) },
      { id: "copy", label: tr("Copier", "Copy"), icon: "copy", kbd: key("Ctrl+C"), run: exec(editor, "copy") },
      { id: "paste", label: tr("Coller", "Paste"), icon: "paste", kbd: key("Ctrl+V"), disabled: ro, run: () => void paste(editor) },
      { id: "duplicate", label: tr("Dupliquer", "Duplicate"), icon: "duplicate", kbd: key("Ctrl+D"), disabled: ro, run: () => duplicateObjects(selection) },
    ],
    entries: [
      ...(one && (one.type === "textbox" || one.type === "shape") ? [{ id: "edit", label: tr("Modifier le texte", "Edit text"), icon: "edit" as const, kbd: key("Enter"), disabled: ro || !!one.locked?.content, run: () => editor.view.dom.querySelector(`.ms-object[data-id="${CSS.escape(id!)}"]`)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })) }] : []),
      ...(one ? [{
        id: "position", label: tr("Position", "Position"), icon: "anchor" as const, disabled: ro,
        items: [
          { id: "inline", label: tr("Aligné sur le texte", "In line with text"), icon: "inline" as const, disabled: one.type === "connector" || one.type === "shape", run: () => inlineObject(id!) },
          { id: "float", label: tr("Flottant, se déplace avec le texte", "Floating, moves with text"), icon: "float" as const, checked: one.placement === "anchored", run: () => setPlacement(id!, "anchored") },
          { id: "fixed", label: tr("Fixe sur la page", "Fixed on the page"), icon: "pin" as const, checked: one.placement === "page", run: () => setPlacement(id!, "page") },
        ] as Entry[],
      }] : []),
      ...(one && one.type !== "connector" ? [{
        id: "wrap", label: tr("Habillage", "Wrap text"), icon: "wrapSquare" as const, disabled: ro,
        items: ([["square", "wrapSquare", tr("Carré", "Square")], ["topBottom", "wrapTopBottom", tr("Haut et bas", "Top and bottom")], ["front", "wrapFront", tr("Devant le texte", "In front of text")], ["behind", "wrapBehind", tr("Derrière le texte", "Behind text")]] as const).map(([w, icon, label]) => ({
          id: `wrap-${w}`, label, icon, disabled: one.placement === "page" && (w === "square" || w === "topBottom"),
          checked: (one.plane === "behind" ? "behind" : one.wrap === "none" ? "front" : one.wrap ?? "square") === w,
          run: () => updateObjects({ [id!]: w === "behind" ? { plane: "behind", wrap: "none" } : w === "front" ? { plane: "front", wrap: "none" } : { plane: undefined, wrap: w } }),
        })) as Entry[],
      }] : []),
      "sep",
      { id: "order", label: tr("Ordre", "Order"), icon: "layers", disabled: ro, items: [
        { id: "front", label: tr("Mettre au premier plan", "Bring to front"), icon: "front", run: () => selection.forEach((x) => reorder(x, "front")) },
        { id: "forward", label: tr("Avancer", "Bring forward"), icon: "forward", run: () => selection.forEach((x) => reorder(x, "forward")) },
        { id: "backward", label: tr("Reculer", "Send backward"), icon: "backward", run: () => selection.forEach((x) => reorder(x, "backward")) },
        { id: "back", label: tr("Mettre à l’arrière-plan", "Send to back"), icon: "back", run: () => selection.forEach((x) => reorder(x, "back")) },
      ] },
      ...(objs.length > 1 ? [{ id: "align", label: tr("Aligner", "Align"), icon: "alignLeft" as const, disabled: ro || locked, items: [
        { id: "a-left", label: tr("À gauche", "Left"), icon: "alignLeft", run: () => alignObjects(selection, "left") },
        { id: "a-center", label: tr("Au centre", "Center"), icon: "alignCenter", run: () => alignObjects(selection, "center") },
        { id: "a-right", label: tr("À droite", "Right"), icon: "alignRight", run: () => alignObjects(selection, "right") },
        "sep",
        { id: "a-top", label: tr("En haut", "Top"), icon: "vTop", run: () => alignObjects(selection, "top") },
        { id: "a-middle", label: tr("Au milieu", "Middle"), icon: "vMiddle", run: () => alignObjects(selection, "middle") },
        { id: "a-bottom", label: tr("En bas", "Bottom"), icon: "vBottom", run: () => alignObjects(selection, "bottom") },
        ...(objs.length >= 3 ? (["sep", { id: "a-hd", label: tr("Répartir horizontalement", "Distribute horizontally"), run: () => alignObjects(selection, "hdist") }, { id: "a-vd", label: tr("Répartir verticalement", "Distribute vertically"), run: () => alignObjects(selection, "vdist") }] as Entry[]) : []),
      ] as Entry[] }] : []),
      ...(objs.length > 1 ? [{ id: "group", label: tr("Grouper", "Group"), icon: "group" as const, kbd: key("Ctrl+G"), disabled: ro, run: () => groupObjects(selection) }] : []),
      ...(one?.group ? [{ id: "ungroup", label: tr("Dissocier", "Ungroup"), icon: "ungroup" as const, kbd: key("Ctrl+Shift+G"), disabled: ro, run: () => ungroup(groupParts(one.group)[0]) }] : []),
      ...(one && one.type !== "connector" ? [{ id: "connect", label: tr("Relier à un autre objet", "Connect to another object"), icon: "connector" as const, disabled: ro, run: startConnect }] : []),
      ...(one?.type === "connector" ? [{ id: "route", label: tr("Tracé", "Route"), icon: "connector" as const, items: (["straight", "elbow"] as const).map((r) => ({ id: `route-${r}`, label: r === "straight" ? tr("Droit", "Straight") : tr("Coudé", "Elbow"), checked: (one.route ?? "straight") === r, run: () => updateObjects({ [id!]: { route: r } }) })) as Entry[] }] : []),
      "sep",
      { id: "lock", label: locked ? tr("Déverrouiller", "Unlock") : tr("Verrouiller", "Lock"), icon: locked ? "unlock" : "lock", disabled: ro, run: () => updateObjects(Object.fromEntries(objs.map(([x, d]) => [x, { locked: { ...d!.locked, geometry: !locked || undefined } }]))) },
      { id: "hide", label: hidden ? tr("Afficher", "Show") : tr("Masquer", "Hide"), icon: hidden ? "eye" : "eyeOff", disabled: ro, run: () => (updateObjects(Object.fromEntries(objs.map(([x]) => [x, { hidden: !hidden || undefined }]))), studio.set({ selection: [] })) },
      { id: "reveal", label: tr("Voir dans la source", "Show in source"), icon: "code", disabled: !one, run: () => sourceOfSelection(editor) },
      "sep",
      { id: "delete", label: objs.length > 1 ? tr(`Supprimer les ${objs.length} objets`, `Delete ${objs.length} objects`) : tr("Supprimer", "Delete"), icon: "trash", kbd: key("Delete"), danger: true, disabled: ro, run: () => deleteObjects(selection) },
    ],
  };
}

function pageCommands(editor: Editor, page: number): { quick: Cmd[]; entries: Entry[] } {
  const ro = !editor.isEditable;
  const s = studio.get();
  const section = currentSectionBreak(editor);
  const setPage = (p: Record<string, unknown>) => (section ? import("./actions").then((a) => a.setSectionProps(section.pos, { ...section.props, ...p })) : setPageSetup(p as never));
  const orientation = s.sections[s.layout?.pages[page]?.section ?? 0]?.page.orientation;
  return {
    quick: [],
    entries: [
      { id: "paste", label: tr("Coller", "Paste"), icon: "paste", kbd: key("Ctrl+V"), disabled: ro, run: () => void paste(editor) },
      "sep",
      { id: "orientation", label: tr("Orientation", "Orientation"), icon: "orientation", disabled: ro, items: [
        { id: "o-portrait", label: tr("Portrait", "Portrait"), checked: orientation !== "landscape", run: () => void setPage({ orientation: "portrait" }) },
        { id: "o-landscape", label: tr("Paysage", "Landscape"), checked: orientation === "landscape", run: () => void setPage({ orientation: "landscape" }) },
      ] },
      { id: "size", label: tr("Taille", "Size"), icon: "size", disabled: ro, items: ["A4", "Letter", "Legal", "A3", "A5"].map((x) => ({ id: `s-${x}`, label: x, run: () => void setPage({ size: x }) })) },
      { id: "section", label: tr("Nouvelle section", "New section"), icon: "section", disabled: ro, run: () => insertSectionBreak({ break: "nextPage" }) },
      "sep",
      { id: "header", label: tr("Modifier l’en-tête", "Edit header"), icon: "header", disabled: ro, run: () => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: "headers" })) },
      { id: "footer", label: tr("Modifier le pied de page", "Edit footer"), icon: "footer", disabled: ro, run: () => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: "footers" })) },
      { id: "master", label: tr("Modifier le masque", "Edit master"), icon: "masterEdit", disabled: ro, run: () => enterMasterEdit(section?.props.master ?? s.meta?.master) },
      "sep",
      { id: "rulers", label: tr("Règles", "Rulers"), icon: "ruler", checked: s.showRulers, run: () => studio.set({ showRulers: !s.showRulers }) },
      { id: "bounds", label: tr("Limites du texte", "Text boundaries"), icon: "boundaries", checked: s.showBoundaries, run: () => studio.set({ showBoundaries: !s.showBoundaries }) },
      { id: "zoom", label: "Zoom", icon: "zoomIn", items: [
        { id: "z-100", label: "100 %", checked: Math.abs(s.zoom - 1) < 0.005, run: () => setZoom(1, true) },
        { id: "z-width", label: tr("Largeur de page", "Page width"), run: () => manualFit("width") },
        { id: "z-page", label: tr("Page entière", "Whole page"), run: () => manualFit("page") },
      ] },
    ],
  };
}

function storyCommands(story: "headers" | "footers"): { quick: Cmd[]; entries: Entry[] } {
  const insert = (field: string) => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: `${story}:${field}` }));
  const s = studio.get();
  return {
    quick: [],
    entries: [
      { id: "edit", label: story === "headers" ? tr("Modifier l’en-tête", "Edit header") : tr("Modifier le pied de page", "Edit footer"), icon: story === "headers" ? "header" : "footer", run: () => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: story })) },
      { id: "fields", label: tr("Insérer un champ", "Insert field"), icon: "field", items: [
        { id: "f-page", label: tr("Numéro de page", "Page number"), run: () => insert("page") },
        { id: "f-pages", label: tr("Nombre de pages", "Page count"), run: () => insert("pages") },
        { id: "f-title", label: tr("Titre du document", "Document title"), run: () => insert("title") },
      ] },
      "sep",
      { id: "master", label: tr("Modifier dans le masque", "Edit in the master"), icon: "masterEdit", run: () => enterMasterEdit(s.meta?.master) },
    ],
  };
}

/** Page point under the context menu's opening click, pt from that page's top-left corner. */
function pagePointOfMenu(): { x: number; y: number } | undefined {
  const s = studio.get();
  const editor = getEditor();
  const target = s.contextMenu?.target;
  const index = target?.kind === "page" || target?.kind === "master" ? target.page : undefined;
  const page = index === undefined ? undefined : s.layout?.pages[index];
  if (!editor || !page || !s.contextMenu) return undefined;
  const root = editor.view.dom.getBoundingClientRect();
  const zoom = s.zoom || 1;
  return { x: pxToPt((s.contextMenu.x - root.left) / zoom - page.left), y: pxToPt((s.contextMenu.y - root.top) / zoom - page.top) };
}

function masterCommands(): { quick: Cmd[]; entries: Entry[] } {
  const s = studio.get();
  const ids = s.masterSel;
  const at = pagePointOfMenu();
  const d = ids.length === 1 ? s.masterEdit?.background?.[ids[0]] : undefined;
  const mode = d?.placeholder ? "placeholder" : d?.locked?.geometry ? "fixed" : "floating";
  const cur = d?.placeholder && placeholderKey(d.placeholder);
  // Placeholder kinds: text the document types (presets, or a new key), then automatic fields.
  const kinds = (pick: (key: string) => void, prefix: string): Entry[] => [
    ...TEXT_PRESETS().map((p) => ({ id: `${prefix}-${p.key}`, label: p.label, icon: "placeholder" as const, checked: prefix === "ph" ? cur === p.key : undefined, run: () => pick(p.key) })),
    { id: `${prefix}-other`, label: tr("Autre texte…", "Other text…"), icon: "plus" as const, run: () => pick("*") },
    "sep",
    ...AUTO_FIELDS.map((k) => ({ id: `${prefix}-${k}`, label: AUTO_LABELS()[k], icon: "field" as const, checked: prefix === "ph" ? cur === k : undefined, run: () => pick(k) })),
  ];
  return {
    quick: [],
    entries: [
      ...(d ? [
        { id: "floating", label: tr("Flottant (déplaçable)", "Floating (movable)"), icon: "float" as const, checked: mode === "floating", run: () => setMasterObjectMode(ids[0], "floating") },
        { id: "fixed", label: tr("Fixe (verrouillé sur la page)", "Fixed (locked on the page)"), icon: "pin" as const, checked: mode === "fixed", run: () => setMasterObjectMode(ids[0], "fixed") },
        { id: "placeholder", label: tr("Espace réservé", "Placeholder"), icon: "placeholder" as const, checked: mode === "placeholder", items: kinds((k) => setMasterObjectMode(ids[0], "placeholder", k === "*" ? `texte-${ids[0]}` : k), "ph") },
        "sep" as const,
        { id: "front", label: tr("Devant le texte", "In front of text"), icon: "wrapFront" as const, checked: d.plane !== "behind", run: () => updateMasterObjects({ [ids[0]]: { plane: "front" } }) },
        { id: "behind", label: tr("Derrière le texte", "Behind text"), icon: "wrapBehind" as const, checked: d.plane === "behind", run: () => updateMasterObjects({ [ids[0]]: { plane: "behind" } }) },
        "sep" as const,
        { id: "delete", label: tr("Supprimer du masque", "Delete from master"), icon: "trash" as const, danger: true, run: () => deleteMasterObjects(ids) },
      ] : []),
      ...(d ? ["sep" as const] : []),
      { id: "add", label: tr("Insérer dans le masque", "Insert in the master"), icon: "plus", items: [
        { id: "add-text", label: tr("Zone de texte", "Text box"), icon: "text", run: () => addMasterObject("textbox", {}, at) },
        { id: "add-rect", label: tr("Rectangle", "Rectangle"), icon: "shape", run: () => addMasterObject("rect", {}, at) },
        { id: "add-line", label: tr("Ligne", "Line"), icon: "line", run: () => addMasterObject("line", {}, at) },
        { id: "add-ellipse", label: tr("Ellipse", "Ellipse"), icon: "ellipse", run: () => addMasterObject("ellipse", {}, at) },
        "sep",
        { id: "add-ph", label: tr("Espace réservé", "Placeholder"), icon: "placeholder", items: kinds((k) => addMasterObject("textbox", { placeholder: k }, at), "add-ph") },
      ] },
      "sep",
      { id: "done", label: tr("Terminer la modification du masque", "Finish editing the master"), icon: "done", run: () => void exitMasterEdit(true) },
      { id: "cancel", label: tr("Abandonner les modifications du masque", "Discard master changes"), icon: "close", run: () => void exitMasterEdit(false) },
    ],
  };
}

function outlineCommands(editor: Editor, pos: number): { quick: Cmd[]; entries: Entry[] } {
  const node = editor.state.doc.nodeAt(pos);
  const level = node?.type.name === "heading" ? (node.attrs.level as number) : 1;
  return {
    quick: [],
    entries: [
      { id: "go", label: tr("Atteindre", "Go to"), icon: "next", run: () => editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run() },
      { id: "promote", label: tr("Hausser le niveau", "Promote"), icon: "outdent", disabled: level <= 1, run: () => editor.chain().setTextSelection(pos + 1).setHeading({ level: (level - 1) as 1 }).run() },
      { id: "demote", label: tr("Abaisser le niveau", "Demote"), icon: "indent", disabled: level >= 6, run: () => editor.chain().setTextSelection(pos + 1).setHeading({ level: (level + 1) as 1 }).run() },
      "sep",
      { id: "reveal", label: tr("Voir dans la source", "Show in source"), icon: "code", run: () => { const l = node && getSync()?.lineOf(node); if (l) revealSource(l); } },
    ],
  };
}

function commandsFor(editor: Editor, target: MenuTarget) {
  switch (target.kind) {
    case "text": return textCommands(editor);
    case "block": return blockCommands(editor, target.pos);
    case "object": return objectCommands(editor);
    case "page": return pageCommands(editor, target.page);
    case "story": return storyCommands(target.story);
    case "master": return masterCommands();
    case "outline": return outlineCommands(editor, target.pos);
  }
}

/* Menu engine (Slides Studio) ------------------------------------------ */

const itemsOf = (panel: HTMLElement | null) => (panel ? [...panel.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"], :scope > [role="menuitemcheckbox"], :scope > .ctx-quick > [role="menuitem"]')].filter((b) => !b.disabled) : []);
function moveFocus(panel: HTMLElement | null, dir: 1 | -1 | "first" | "last") {
  const list = itemsOf(panel);
  if (!list.length) return;
  const i = list.indexOf(document.activeElement as HTMLButtonElement);
  const next = dir === "first" ? 0 : dir === "last" ? list.length - 1 : (i + dir + list.length) % list.length;
  list[next].focus();
}

function Panel({ entries, quick, onRun, origin, parentRef, sub, autoFocus }: { entries: Entry[]; quick?: Cmd[]; onRun: (c: Cmd) => void; origin?: { x: number; y: number }; parentRef?: React.RefObject<HTMLElement | null>; sub?: { close: () => void }; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpenState] = useState<{ id: string; key: boolean } | null>(null);
  const setOpen = (id: string | null, viaKey = false) => setOpenState(id ? { id, key: viaKey } : null);
  const timer = useRef(0);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const { innerWidth: W, innerHeight: H } = window;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    let x: number;
    let y: number;
    let ox = "left";
    let oy = "top";
    if (origin) {
      x = origin.x + w > W - 8 ? Math.max(8, origin.x - w) : origin.x;
      y = origin.y + h > H - 8 ? Math.max(8, origin.y - h) : origin.y;
      if (x < origin.x) ox = "right";
      if (y < origin.y) oy = "bottom";
    } else {
      const a = parentRef!.current!.getBoundingClientRect();
      x = a.right + w > W - 8 ? Math.max(8, a.left - w + 4) : a.right - 4;
      y = Math.max(8, Math.min(a.top - 6, H - h - 8));
    }
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.style.transformOrigin = `${oy} ${ox}`;
    m.style.maxHeight = `${H - 16}px`;
    if (autoFocus) moveFocus(m, "first");
  }, [origin, parentRef, autoFocus]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest(".ctx-menu") !== ref.current) return;
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
      e.preventDefault();
      moveFocus(ref.current, k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : k === "Home" ? "first" : "last");
    } else if (k === "ArrowRight" && document.activeElement?.getAttribute("aria-haspopup")) {
      e.preventDefault();
      setOpen((document.activeElement as HTMLElement).dataset.cmd ?? null, true);
    } else if (k === "ArrowLeft" && sub) {
      e.preventDefault();
      e.stopPropagation();
      sub.close();
    } else if ((k === "ArrowLeft" || k === "ArrowRight") && document.activeElement?.closest(".ctx-quick")) {
      e.preventDefault();
      const q = [...ref.current!.querySelectorAll<HTMLButtonElement>(".ctx-quick > button:not(:disabled)")];
      const i = q.indexOf(document.activeElement as HTMLButtonElement);
      q[(i + (k === "ArrowRight" ? 1 : -1) + q.length) % q.length]?.focus();
    }
  };
  const hover = (id: string | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(id), id ? 90 : 220);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div ref={ref} className={`ctx-menu${sub ? " is-sub" : ""}`} role="menu" onKeyDown={onKeyDown} data-testid={sub ? "context-submenu" : "context-menu"} onContextMenu={(e) => e.preventDefault()}>
      {quick && quick.length > 0 && (
        <>
          <div className="ctx-quick" role="group" aria-label={tr("Presse-papiers", "Clipboard")}>
            {quick.map((c) => (
              <button key={c.id} type="button" role="menuitem" className="ctx-quick-btn" disabled={c.disabled} title={`${c.label}${c.kbd ? ` (${c.kbd})` : ""}`} aria-label={c.label} data-cmd={c.id} data-testid={`ctx-${c.id}`} onClick={() => onRun(c)} onPointerEnter={(e) => (e.currentTarget.focus({ preventScroll: true }), hover(null))}>
                <Icon name={c.icon!} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <div className="ctx-sep" role="separator" />
        </>
      )}
      {entries.map((e, i) => {
        if (e === "sep") return entries[i - 1] && entries[i - 1] !== "sep" && i < entries.length - 1 ? <div key={`s${i}`} className="ctx-sep" role="separator" /> : null;
        return <MenuRow key={e.id} c={e} open={open?.id === e.id} openedByKey={!!open?.key} onHover={hover} onKeyOpen={(id) => setOpen(id, true)} onRun={onRun} onClose={() => setOpen(null)} />;
      })}
    </div>
  );
}

function MenuRow({ c, open, openedByKey, onHover, onKeyOpen, onRun, onClose }: { c: Cmd; open: boolean; openedByKey: boolean; onHover: (id: string | null) => void; onKeyOpen: (id: string) => void; onRun: (c: Cmd) => void; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const role = c.checked !== undefined ? "menuitemcheckbox" : "menuitem";
  const icon: ReactNode = c.swatch ? <span className={`ctx-swatch${c.checked ? " is-checked" : ""}`} style={{ background: c.swatch }} /> : c.checked ? <Icon name="check" className="ctx-check" /> : c.icon ? <Icon name={c.icon} /> : <span className="ctx-icon-pad" />;
  const subApi = useRef({ close: () => (onClose(), ref.current?.focus()) });
  subApi.current.close = () => (onClose(), ref.current?.focus());
  return (
    <>
      <button ref={ref} type="button" role={role} aria-checked={c.checked} aria-haspopup={c.items ? "menu" : undefined} aria-expanded={c.items ? open : undefined} aria-keyshortcuts={c.kbd}
        className={`ctx-item${c.danger ? " is-danger" : ""}${open ? " is-open" : ""}`} disabled={c.disabled || (c.items && !c.items.some((x) => x !== "sep"))} data-cmd={c.id} data-testid={`ctx-${c.id}`}
        onPointerEnter={() => (ref.current?.focus({ preventScroll: true }), onHover(c.items ? c.id : null))}
        onClick={(e) => (c.items ? (e.detail === 0 ? onKeyOpen(c.id) : onHover(c.id)) : onRun(c))}>
        <span className="ctx-icon">{icon}</span>
        <span className="ctx-label">{c.label}</span>
        {c.kbd && <kbd>{c.kbd}</kbd>}
        {c.items && <Icon name="next" size={12} className="ctx-more" />}
      </button>
      {open && c.items && <Panel entries={c.items} onRun={onRun} parentRef={ref} sub={subApi.current} autoFocus={openedByKey} />}
    </>
  );
}

export function ContextMenu({ editor }: { editor: Editor }) {
  const menu = useStudio((s) => s.contextMenu);
  if (!menu) return null;
  return <OpenMenu key={`${menu.x}:${menu.y}:${menu.target.kind}`} editor={editor} {...menu} />;
}

function OpenMenu({ editor, x, y, target }: { editor: Editor; x: number; y: number; target: MenuTarget }) {
  const [{ quick, entries }] = useState(() => commandsFor(editor, target));
  const [origin] = useState({ x, y });
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef(document.activeElement as HTMLElement | null);
  const close = () => {
    studio.set({ contextMenu: null });
    restore.current?.focus?.({ preventScroll: true });
  };
  useEffect(() => {
    const outside = (e: Event) => !root.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), close());
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", esc, true);
    window.addEventListener("wheel", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("wheel", outside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  });
  const run = (c: Cmd) => {
    if (c.disabled || !c.run) return;
    studio.set({ contextMenu: null });
    c.run();
  };
  return createPortal(
    <div ref={root} className="ctx-root ms-ui">
      <Panel entries={entries} quick={quick} onRun={run} origin={origin} autoFocus />
    </div>,
    document.body,
  );
}

/**
 * Right-click routing on the paper: an object (selected first), a header / footer, the page around
 * the text, selected text, or the block under the pointer (the caret moves there, as in Word).
 */
export function openContextMenu(editor: Editor, e: MouseEvent): void {
  const t = e.target as HTMLElement;
  if (t.closest(".ms-story-editor, input, textarea, .ctx-menu")) return;
  e.preventDefault();
  const at = { x: e.clientX, y: e.clientY };
  const s = studio.get();
  if (s.masterEdit) {
    const id = t.closest<HTMLElement>(".ms-furniture.is-editable")?.dataset.id;
    if (id && !s.masterSel.includes(id)) studio.set({ masterSel: [id] });
    else if (!id && !t.closest(".ms-sel-frame")) studio.set({ masterSel: [] });
    const pageEl = t.closest<HTMLElement>(".ms-page");
    return studio.set({ contextMenu: { ...at, target: { kind: "master", page: pageEl ? Number(pageEl.dataset.page) - 1 : undefined } } });
  }
  const objectEl = t.closest<HTMLElement>(".ms-object, .ms-sel-frame");
  if (objectEl) {
    const id = objectEl.dataset.id ?? s.selection[0];
    if (id && !s.selection.includes(id)) {
      const pos = findObject(editor, id);
      if (pos !== undefined) editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
      studio.set({ selection: [id] });
    }
    return studio.set({ contextMenu: { ...at, target: { kind: "object" } } });
  }
  const story = t.closest<HTMLElement>(".ms-story");
  if (story) return studio.set({ contextMenu: { ...at, target: { kind: "story", page: Number(story.closest<HTMLElement>(".ms-page")?.dataset.page ?? 1) - 1, story: story.classList.contains("ms-story-headers") ? "headers" : "footers" } } });
  const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
  const inText = editor.view.dom.contains(t) && t !== editor.view.dom;
  if (!inText || !hit) {
    const page = Number(t.closest<HTMLElement>(".ms-page")?.dataset.page ?? 1) - 1;
    return studio.set({ contextMenu: { ...at, target: { kind: "page", page: Math.max(0, page) } } });
  }
  const sel = editor.state.selection;
  if (!sel.empty && hit.pos >= sel.from && hit.pos <= sel.to && !(sel instanceof NodeSelection)) return studio.set({ contextMenu: { ...at, target: { kind: "text" } } });
  const $p = editor.state.doc.resolve(hit.pos);
  const pos = $p.depth ? $p.before(1) : hit.inside >= 0 ? hit.inside : hit.pos;
  const node = editor.state.doc.nodeAt(pos);
  if (node?.isAtom || node?.type.name === "image") editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  else if (sel.empty || !(hit.pos >= sel.from && hit.pos <= sel.to)) editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(hit.pos))));
  studio.set({ contextMenu: { ...at, target: { kind: "block", pos } } });
}

function findObject(editor: Editor, id: string): number | undefined {
  let found: number | undefined;
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name === "msObject" && n.attrs.id === id) found = pos;
  });
  return found;
}

export { hexOf };
