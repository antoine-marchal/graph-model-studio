/**
 * Title bar + ribbon, Slides Studio's chrome in Word's vocabulary: Accueil, Insertion, Mise en page,
 * Références, Conception, Révision, Affichage, and the contextual Format tab while an object is
 * selected. The ribbon re-renders only when the state it shows changes (hooks.ts).
 */
import React, { useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Icon, type IconName } from "./icons";
import { Big, Col, Group, Menu, MenuItem, PaletteMenu, Row, Small, NumField, CmField, keepFocus, tr, hexOf } from "./ui";
import { studio, useStudio, type RibbonTab } from "./store";
import { useEditorDerived } from "./hooks";
import {
  alignObjects, applyParagraphStyle, insertStyledParagraph, deleteObjects, duplicateObjects, floatBlockAt, getSync, groupObjects, inlineObject, insertObject, insertSectionBreak, reorder,
  setBlockProps, setPageSetup, setPlacement, ungroup, updateObjects, currentSectionBreak, setSectionProps, setDocumentMaster, enterMasterEdit, exitMasterEdit, addMasterObject, addStoryObject,
  startConnect, currentBlock, updateMasterObjects, setMasterObjectMode, deleteMasterObjects, type NewObject,
} from "./actions";
import { parseBlockProps, setSpanStyle } from "../extensions/StudioNodes";
import type { ObjectDescriptor } from "../../document/schema";
import { AUTO_FIELDS, AUTO_LABELS, TEXT_PRESETS, placeholderKey } from "../../document/placeholders";
import { masterAction, runPreflight } from "./bridge";
import { manualFit, setZoom } from "./PageLayer";
import { hostRedo, hostUndo } from "./commands";
import { groupParts } from "../../../slides-studio/packages/core/src/groups";
import { vscodeApi } from "../vscode-api";
import { ShapeGallery, StyleGallery, TableGrid } from "./galleries";
import { insertGmcBlock } from "../extensions/GmcBlock";
import { MasterPreview } from "./MasterBrowser";

const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];
const MARGINS: { id: string; label: string; m: number[] }[] = [
  { id: "normal", label: tr("Normales", "Normal"), m: [70.87, 70.87, 70.87, 70.87] },
  { id: "narrow", label: tr("Étroites", "Narrow"), m: [36, 36, 36, 36] },
  { id: "moderate", label: tr("Modérées", "Moderate"), m: [72, 54, 72, 54] },
  { id: "wide", label: tr("Larges", "Wide"), m: [72, 144, 72, 144] },
];

/** What the ribbon shows, derived from the editor (compared by value: no re-render while typing). */
function derive(editor: Editor) {
  const { state } = editor;
  const sel = state.selection;
  const block = currentBlock(state);
  const top = block?.node ?? null;
  const span = editor.getAttributes("msTextStyle") as { style?: string; msStyle?: string };
  const css = Object.fromEntries((span.style ?? "").split(";").filter(Boolean).map((d) => d.split(":").map((x) => x.trim())));
  const props = top ? parseBlockProps(top.attrs.msBlock) : {};
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    bullet: editor.isActive("bulletList"),
    ordered: editor.isActive("orderedList"),
    task: editor.isActive("taskList"),
    heading: editor.isActive("heading") ? (editor.getAttributes("heading").level as number) : 0,
    props,
    font: css["font-family"]?.replace(/"/g, ""),
    size: css["font-size"] ? parseFloat(css["font-size"]) : undefined,
    color: css.color?.replace("#", ""),
    highlight: css["background-color"]?.replace("#", ""),
    msStyle: span.msStyle,
    node: sel instanceof NodeSelection ? sel.node.type.name : null,
    topType: top?.type.name ?? null,
    topPos: block?.pos ?? null,
    canProps: !!top && "msBlock" in (top.attrs ?? {}),
    // Props only: the break's position shifts with every keystroke before it (looked up on use).
    section: currentSectionBreak(editor) ? { props: currentSectionBreak(editor)!.props } : null,
  };
}

function TitleBar({ readonly, onSource }: { readonly: boolean; onSource: () => void }) {
  const fileName = useStudio((s) => s.fileName);
  const masterEdit = useStudio((s) => s.masterEdit);
  const sync = useStudio((s) => s.sync);
  const flush = () => getSync()?.flush() ?? Promise.resolve();
  return (
    <header className="titlebar" role="toolbar" aria-label={tr("Accès rapide", "Quick access")}>
      <div className="qat">
        <button type="button" className="ibtn" aria-label={tr("Enregistrer (Ctrl+S)", "Save (Ctrl+S)")} title={tr("Enregistrer (Ctrl+S)", "Save (Ctrl+S)")} disabled={readonly} onClick={() => void flush().then(() => vscodeApi.postMessage({ type: "save" }))}>
          <Icon name="save" />
        </button>
        <button type="button" className="ibtn" aria-label={tr("Annuler (Ctrl+Z)", "Undo (Ctrl+Z)")} title={tr("Annuler (Ctrl+Z)", "Undo (Ctrl+Z)")} data-testid="undo" disabled={readonly} onClick={hostUndo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="ibtn" aria-label={tr("Rétablir (Ctrl+Y)", "Redo (Ctrl+Y)")} title={tr("Rétablir (Ctrl+Y)", "Redo (Ctrl+Y)")} data-testid="redo" disabled={readonly} onClick={hostRedo}>
          <Icon name="redo" />
        </button>
      </div>
      <div className="title">
        <span className="file-name" title={fileName}>{fileName}</span>
        {masterEdit && <span className="chip chip-new" title={tr("Les modifications s’appliquent au masque", "Changes apply to the master")}>{tr("Masque", "Master")} · {masterEdit.name}</span>}
        {readonly && <span className="chip">{tr("Lecture seule", "Read-only")}</span>}
        {sync === "conflict" && <span className="chip chip-old">{tr("Conflit", "Conflict")}</span>}
      </div>
      <div className="title-actions">
        <div className="seg" role="group" aria-label={tr("Mode d'édition", "Editing mode")}>
          <button type="button" className="ibtn is-active" aria-pressed>{tr("Visuel", "Visual")}</button>
          <button type="button" className="ibtn" title={tr("Ouvrir la source Markdown dans l'éditeur de texte", "Open the Markdown source in the text editor")} data-testid="open-source" onClick={onSource}>Source</button>
        </div>
        <div className="split" role="group" aria-label={tr("Exporter", "Export")}>
          <button type="button" className="ibtn is-primary has-label" data-testid="export" onClick={() => void flush().then(() => vscodeApi.postMessage({ type: "exportDocx" }))}>
            <Icon name="download" /> <span className="ms-hide-narrow">{tr("Exporter .docx", "Export .docx")}</span>
          </button>
          <Menu testId="export-menu" trigger={(open) => (
            <button type="button" className="ibtn is-primary split-caret" aria-haspopup="menu" aria-label={tr("Autres exports", "More exports")} onClick={open}>
              <Icon name="chevronDown" size={10} />
            </button>
          )}>
            {(close) => (
              <>
                <MenuItem close={close} icon="download" label={tr("Document Word modifiable (.docx)", "Editable Word document (.docx)")} onClick={() => void flush().then(() => vscodeApi.postMessage({ type: "exportDocx" }))} />
                <MenuItem close={close} icon="preflight" label={tr("Contrôle avant livraison", "Preflight check")} onClick={() => void runPreflight()} />
                <MenuItem close={close} icon="external" label={tr("HTML, PDF ou PNG…", "HTML, PDF or PNG…")} onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "markdownToolkit.export" })} />
              </>
            )}
          </Menu>
        </div>
      </div>
    </header>
  );
}

function HomeTab({ editor, d, ro }: { editor: Editor; d: ReturnType<typeof derive>; ro: boolean }) {
  const theme = useStudio((s) => s.sections[0]?.sheet.theme);
  const chain = () => editor.chain().focus();
  const off = ro;
  const fonts = [...new Set([theme?.fonts.body, theme?.fonts.heading, "Calibri", "Arial", "Georgia", "Times New Roman", "Segoe UI", "Verdana", "Consolas"].filter(Boolean) as string[])];
  const size = d.size;
  const step = (dir: 1 | -1) => {
    const cur = size ?? 11;
    const next = dir > 0 ? FONT_SIZES.find((s) => s > cur) ?? cur + 2 : [...FONT_SIZES].reverse().find((s) => s < cur) ?? Math.max(1, cur - 1);
    setSpanStyle(editor, { "font-size": `${next}pt` });
  };
  return (
    <>
      <Group label={tr("Presse-papiers", "Clipboard")}>
        <Big icon="paste" label={tr("Coller", "Paste")} disabled={off} title={tr("Coller (Ctrl+V)", "Paste (Ctrl+V)")} onClick={() => void pasteFromClipboard(editor)} />
        <Col>
          <Small icon="cut" label={tr("Couper", "Cut")} disabled={off || editor.state.selection.empty} title={tr("Couper (Ctrl+X)", "Cut (Ctrl+X)")} onClick={() => (editor.commands.focus(), document.execCommand("cut"))} />
          <Small icon="copy" label={tr("Copier", "Copy")} disabled={editor.state.selection.empty} title={tr("Copier (Ctrl+C)", "Copy (Ctrl+C)")} onClick={() => (editor.commands.focus(), document.execCommand("copy"))} />
          <Small icon="brush" label={tr("Reproduire la mise en forme", "Format painter")} disabled={off} active={!!painter} title={tr("Copier la mise en forme du texte sélectionné, puis sélectionner le texte cible", "Copy the formatting of the selected text, then select the target text")} onClick={() => togglePainter(editor)} />
        </Col>
      </Group>
      <Group label={tr("Police", "Font")}>
        <div className="rb-col">
          <div className="rb-row">
            <Menu testId="font-face-menu" trigger={(open) => (
              <button type="button" className="rb-small rb-field rb-face" disabled={off} onMouseDown={keepFocus} onClick={open} title={tr("Police", "Font")} data-testid="font-face">
                <span>{d.font ?? tr("Police du style", "Style font")}</span> <Icon name="chevronDown" size={10} />
              </button>
            )}>
              {(close) => (
                <>
                  <MenuItem close={close} label={tr("Police du style", "Style font")} current={!d.font} onClick={() => setSpanStyle(editor, { "font-family": null })} />
                  {fonts.map((f) => (
                    <button key={f} type="button" role="menuitem" className={`menu-item${d.font === f ? " is-current" : ""}`} style={{ fontFamily: f }} onMouseDown={keepFocus} onClick={() => (close(), setSpanStyle(editor, { "font-family": `"${f}"` }))}>
                      {f}
                    </button>
                  ))}
                </>
              )}
            </Menu>
            <Menu testId="font-size-menu" trigger={(open) => (
              <button type="button" className="rb-small rb-field rb-size" disabled={off} onMouseDown={keepFocus} onClick={open} title={tr("Taille de police", "Font size")} data-testid="font-size">
                <span>{size ? `${size} pt` : "—"}</span> <Icon name="chevronDown" size={10} />
              </button>
            )}>
              {(close) => (
                <>
                  <MenuItem close={close} label={tr("Taille du style", "Style size")} current={!size} onClick={() => setSpanStyle(editor, { "font-size": null })} />
                  {FONT_SIZES.map((v) => <MenuItem key={v} close={close} label={`${v} pt`} current={v === size} onClick={() => setSpanStyle(editor, { "font-size": `${v}pt` })} />)}
                </>
              )}
            </Menu>
            <Small iconOnly icon="fontGrow" label={tr("Augmenter la taille de police", "Increase font size")} disabled={off} onClick={() => step(1)} />
            <Small iconOnly icon="fontShrink" label={tr("Réduire la taille de police", "Decrease font size")} disabled={off} onClick={() => step(-1)} />
          </div>
          <div className="rb-row">
            <Small iconOnly icon="bold" label={tr("Gras (Ctrl+B)", "Bold (Ctrl+B)")} active={d.bold} disabled={off} testId="bold" onClick={() => chain().toggleBold().run()} />
            <Small iconOnly icon="italic" label={tr("Italique (Ctrl+I)", "Italic (Ctrl+I)")} active={d.italic} disabled={off} testId="italic" onClick={() => chain().toggleItalic().run()} />
            <Small iconOnly icon="underline" label={tr("Souligné (Ctrl+U)", "Underline (Ctrl+U)")} active={d.underline} disabled={off} onClick={() => chain().toggleUnderline().run()} />
            <Small iconOnly icon="eraser" label={tr("Barré", "Strikethrough")} active={d.strike} disabled={off} onClick={() => chain().toggleStrike().run()} />
            <PaletteMenu value={d.color} onChange={(v) => setSpanStyle(editor, { color: v ? `#${hexOf(v) ?? v}` : null })} trigger={(open) => (
              <button type="button" className="rb-small icon-only rb-swatch" disabled={off} onMouseDown={keepFocus} onClick={open} aria-label={tr("Couleur du texte", "Text color")} title={tr("Couleur du texte", "Text color")}>
                <Icon name="text" />
                <span className="rb-swatch-bar" style={{ background: d.color ? `#${d.color}` : "var(--fg)" }} />
              </button>
            )} />
            <PaletteMenu value={d.highlight} onChange={(v) => setSpanStyle(editor, { "background-color": v ? `#${hexOf(v) ?? v}` : null })} trigger={(open) => (
              <button type="button" className="rb-small icon-only rb-swatch" disabled={off} onMouseDown={keepFocus} onClick={open} aria-label={tr("Surlignage", "Highlight")} title={tr("Couleur de surlignage", "Highlight color")}>
                <Icon name="highlight" />
                <span className="rb-swatch-bar" style={{ background: d.highlight ? `#${d.highlight}` : "#FFE24D" }} />
              </button>
            )} />
            <Small iconOnly icon="clearFormat" label={tr("Effacer la mise en forme", "Clear formatting")} disabled={off} onClick={() => (chain().unsetAllMarks().run(), setBlockProps({ align: undefined, spaceBefore: undefined, spaceAfter: undefined, lineSpacing: undefined, indentLeft: undefined, indentRight: undefined, firstLine: undefined }))} />
          </div>
        </div>
      </Group>
      <Group label={tr("Paragraphe", "Paragraph")}>
        <div className="rb-col">
          <div className="rb-row">
            <Small iconOnly icon="bulletList" label={tr("Puces", "Bullets")} active={d.bullet} disabled={off} onClick={() => chain().toggleBulletList().run()} />
            <Small iconOnly icon="numberList" label={tr("Numérotation", "Numbering")} active={d.ordered} disabled={off} onClick={() => chain().toggleOrderedList().run()} />
            <Small iconOnly icon="check" label={tr("Liste de tâches", "Checklist")} active={d.task} disabled={off} onClick={() => chain().toggleTaskList().run()} />
            <Small iconOnly icon="outdent" label={tr("Diminuer le retrait", "Decrease indent")} disabled={off || !d.canProps} onClick={() => setBlockProps({ indentLeft: Math.max(0, (d.props.indentLeft ?? 0) - 35.4) || undefined })} />
            <Small iconOnly icon="indent" label={tr("Augmenter le retrait", "Increase indent")} disabled={off || !d.canProps} onClick={() => setBlockProps({ indentLeft: (d.props.indentLeft ?? 0) + 35.4 })} />
          </div>
          <div className="rb-row">
            {(["left", "center", "right", "justify"] as const).map((a) => (
              <Small key={a} iconOnly icon={({ left: "alignLeft", center: "alignCenter", right: "alignRight", justify: "alignJustify" } as const)[a]} label={{ left: tr("Aligner à gauche", "Align left"), center: tr("Centrer", "Center"), right: tr("Aligner à droite", "Align right"), justify: tr("Justifier", "Justify") }[a]} active={(d.props.align ?? "left") === a} disabled={off || !d.canProps} testId={`align-${a}`} onClick={() => setBlockProps({ align: a === "left" ? undefined : a })} />
            ))}
            <Menu testId="line-spacing-menu" trigger={(open) => <Small iconOnly icon="lineSpacing" label={tr("Interligne", "Line spacing")} disabled={off || !d.canProps} onClick={open} />}>
              {(close) => (
                <>
                  {LINE_SPACINGS.map((v) => <MenuItem key={v} close={close} label={v.toLocaleString()} current={d.props.lineSpacing === v} onClick={() => setBlockProps({ lineSpacing: v })} />)}
                  <MenuItem close={close} label={tr("Interligne du style", "Style line spacing")} current={d.props.lineSpacing === undefined} onClick={() => setBlockProps({ lineSpacing: undefined })} />
                  <MenuItem close={close} icon="spacing" label={tr("Ajouter un espace avant", "Add space before")} onClick={() => setBlockProps({ spaceBefore: 12 })} />
                  <MenuItem close={close} icon="spacing" label={tr("Supprimer l’espace après", "Remove space after")} onClick={() => setBlockProps({ spaceAfter: 0 })} />
                </>
              )}
            </Menu>
          </div>
        </div>
      </Group>
      <Group label={tr("Styles", "Styles")}>
        <StyleGallery editor={editor} current={d.heading ? `Heading${d.heading}` : d.props.style ?? (d.topType === "blockquote" ? "Quote" : "Normal")} disabled={off} />
      </Group>
    </>
  );
}

/** Rich paste from the system clipboard (HTML when available, else text). */
async function pasteFromClipboard(editor: Editor): Promise<void> {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      if (it.types.includes("text/html")) {
        const html = await (await it.getType("text/html")).text();
        editor.chain().focus().insertContent(html).run();
        return;
      }
    }
  } catch {
    // Clipboard API refused: plain text below.
  }
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.chain().focus().insertContent(text).run();
  } catch {
    // Nothing readable.
  }
}

/** Format painter: marks and paragraph properties of the selection, applied to the next selection. */
let painter: { marks: { type: string; attrs: Record<string, unknown> }[]; props: Record<string, unknown> } | null = null;
function togglePainter(editor: Editor): void {
  if (painter) {
    painter = null;
    studio.set({ tab: "home" });
    return;
  }
  const $from = editor.state.selection.$from;
  painter = { marks: $from.marks().map((m) => ({ type: m.type.name, attrs: m.attrs })), props: ($from.depth ? parseBlockProps($from.node(1).attrs.msBlock) : {}) as Record<string, unknown> };
  const apply = () => {
    if (editor.state.selection.empty || !painter) return;
    const p = painter;
    painter = null;
    editor.off("selectionUpdate", apply);
    const chain = editor.chain().unsetAllMarks();
    for (const m of p.marks) chain.setMark(m.type, m.attrs);
    chain.run();
    const { id: _id, ...props } = p.props as { id?: string };
    setBlockProps(props);
  };
  editor.on("selectionUpdate", apply);
}

function InsertTab({ editor, d, ro }: { editor: Editor; d: ReturnType<typeof derive>; ro: boolean }) {
  const masterEdit = useStudio((s) => s.masterEdit);
  const selection = useStudio((s) => s.selection);
  const chain = () => editor.chain().focus();
  const off = ro;
  const add = (k: NewObject) => (studio.get().storyEditor ? addStoryObject(k) : masterEdit ? addMasterObject(k) : insertObject(k));
  return (
    <>
      {masterEdit && (
        <Group label={tr("Masque", "Master")}>
          <Menu testId="placeholder-menu" trigger={(open) => <Big icon="placeholder" label={tr("Espace réservé", "Placeholder")} caret onClick={open} />}>
            {(close) => (
              <>
                <PlaceholderItems close={close} onPick={(key) => addMasterObject("textbox", { placeholder: key })} />
              </>
            )}
          </Menu>
        </Group>
      )}
      {!masterEdit && (
        <Group label={tr("Pages", "Pages")}>
          <Big icon="pageBreak" label={tr("Saut de page", "Page break")} disabled={off} title={tr("Saut de page (Ctrl+Entrée)", "Page break (Ctrl+Enter)")} onClick={() => (editor.commands as any).insertPageBreak()} />
          <Menu testId="section-menu" trigger={(open) => <Big icon="section" label={tr("Saut de section", "Section break")} caret disabled={off} onClick={open} />}>
            {(close) => (
              <>
                <MenuItem close={close} icon="page" label={tr("Page suivante", "Next page")} onClick={() => insertSectionBreak({ break: "nextPage" })} />
                <MenuItem close={close} icon="orientation" label={tr("Page suivante, paysage", "Next page, landscape")} onClick={() => insertSectionBreak({ break: "nextPage", orientation: "landscape" })} />
                <MenuItem close={close} icon="pages" label={tr("Page impaire suivante", "Next odd page")} onClick={() => insertSectionBreak({ break: "oddPage" })} />
                <MenuItem close={close} icon="continuous" label={tr("Continu", "Continuous")} onClick={() => insertSectionBreak({ break: "continuous" })} />
              </>
            )}
          </Menu>
        </Group>
      )}
      {!masterEdit && (
        <Group label={tr("Tableaux", "Tables")}>
          <Menu testId="table-menu" trigger={(open) => <Big icon="table" label={tr("Tableau", "Table")} caret disabled={off} onClick={open} />}>
            {(close) => <TableGrid onPick={(rows, cols) => (close(), chain().insertTable({ rows, cols, withHeaderRow: true }).run())} />}
          </Menu>
        </Group>
      )}
      <Group label={tr("Illustrations", "Illustrations")}>
        {!masterEdit && <Big icon="image" label="Image" disabled={off} onClick={() => window.dispatchEvent(new CustomEvent("btrmk:showImageDialog"))} />}
        <ShapeGallery onPick={add} trigger={(open) => <Big icon="shape" label={tr("Formes", "Shapes")} caret disabled={off} onClick={open} />} />
        <Big icon="text" label={tr("Zone de texte", "Text box")} disabled={off} onClick={() => add("textbox")} />
        {!masterEdit && <Big icon="connector" label={tr("Relier", "Connect")} disabled={off} title={selection.length === 2 ? tr("Relier les deux objets sélectionnés", "Connect the two selected objects") : tr("Cliquez l’objet de départ puis celui d’arrivée (Échap annule)", "Click the start object, then the end object (Esc cancels)")} onClick={startConnect} />}
        {!masterEdit && (
          <Menu testId="diagram-menu" trigger={(open) => <Big icon="diagram" label={tr("Diagramme", "Diagram")} caret disabled={off} onClick={open} />}>
            {(close) => (
              <>
                <MenuItem close={close} icon="diagram" label={tr("Diagramme Graph Model Studio", "Graph Model Studio diagram")} onClick={() => insertGmcBlock(editor)} />
                <MenuItem close={close} icon="mermaid" label="Mermaid" onClick={() => chain().insertContent({ type: "mermaidBlock" }).run()} />
              </>
            )}
          </Menu>
        )}
        {!masterEdit && <Big icon="equation" label={tr("Équation", "Equation")} disabled={off} onClick={() => chain().insertContent({ type: "mathBlock", attrs: { latex: "E = mc^2" } }).run()} />}
      </Group>
      {!masterEdit && (
        <Group label={tr("Liens", "Links")}>
          <Col>
            <Small icon="link" label={tr("Lien", "Link")} disabled={off} onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "betterMarkdown.insertLink" })} />
            <Small icon="bookmark" label={tr("Signet", "Bookmark")} disabled={off || !d.canProps} onClick={() => studio.set({ pane: "format", rightOpen: true })} title={tr("Identifiant du paragraphe : panneau Format", "Paragraph identifier: Format panel")} />
            <Small icon="crossRef" label={tr("Renvoi", "Cross-reference")} disabled={off} onClick={() => window.dispatchEvent(new CustomEvent("ms:crossref"))} />
          </Col>
        </Group>
      )}
      {!masterEdit && (
        <Group label={tr("En-tête et pied de page", "Header & footer")}>
          <Col>
            <Small icon="header" label={tr("En-tête", "Header")} onClick={() => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: "headers" }))} />
            <Small icon="footer" label={tr("Pied de page", "Footer")} onClick={() => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: "footers" }))} />
            <Small icon="field" label={tr("Numéro de page", "Page number")} onClick={() => window.dispatchEvent(new CustomEvent("ms:editStory", { detail: "footers:page" }))} />
          </Col>
        </Group>
      )}
      {!masterEdit && (
        <Group label={tr("Blocs", "Blocks")}>
          <Col>
            <Small icon="callout" label={tr("Encadré", "Callout")} disabled={off} onClick={() => insertStyledParagraph(tr("Encadré", "Callout"), "Callout")} />
            <Small icon="caption" label={tr("Figure + légende", "Figure + caption")} disabled={off} onClick={() => insertStyledParagraph(tr("Figure 1 : légende", "Figure 1: caption"), "Caption")} />
            <Small icon="signature" label={tr("Signature", "Signature")} disabled={off} onClick={() => chain().insertContent("<p>______________________</p><p>Nom, fonction</p>").run()} />
          </Col>
        </Group>
      )}
    </>
  );
}

function LayoutTab({ editor, d, ro }: { editor: Editor; d: ReturnType<typeof derive>; ro: boolean }) {
  const sections = useStudio((s) => s.sections);
  const masterEdit = useStudio((s) => s.masterEdit);
  const section = d.section;
  const idx = section ? sections.length - 1 : 0;
  const page = sections[Math.min(idx, sections.length - 1)]?.page;
  const setPage = (patch: Record<string, unknown>) => {
    if (masterEdit) return studio.set({ masterEdit: { ...masterEdit, page: { ...masterEdit.page, ...patch, margins: { ...masterEdit.page.margins, ...(patch.margins as object) } } } }), void import("./store").then((m) => m.resolveDocument());
    if (section) setSectionProps(currentSectionBreak(editor)!.pos, { ...section.props, ...patch });
    else setPageSetup(patch as never);
  };
  const off = ro;
  return (
    <>
      <Group label={tr("Mise en page", "Page setup")}>
        <Menu testId="margins-menu" trigger={(open) => <Big icon="margins" label={tr("Marges", "Margins")} caret disabled={off} onClick={open} />}>
          {(close) => (
            <>
              {MARGINS.map((m) => (
                <MenuItem key={m.id} close={close} icon="margins" current={!!page && Math.abs(page.margins.top - m.m[0]) < 1 && Math.abs(page.margins.left - m.m[3]) < 1} label={`${m.label} · ${(m.m[0] / 28.35).toFixed(2)} × ${(m.m[1] / 28.35).toFixed(2)} cm`} onClick={() => setPage({ margins: { top: m.m[0], right: m.m[1], bottom: m.m[2], left: m.m[3] } })} />
              ))}
              <p className="menu-note">{tr("Ajustez aussi les marges en faisant glisser les règles.", "You can also drag the margins on the rulers.")}</p>
            </>
          )}
        </Menu>
        <Menu testId="orientation-menu" trigger={(open) => <Big icon="orientation" label={tr("Orientation", "Orientation")} caret disabled={off} onClick={open} />}>
          {(close) => (
            <>
              <MenuItem close={close} icon="page" current={page?.orientation !== "landscape"} label={tr("Portrait", "Portrait")} onClick={() => setPage({ orientation: "portrait" })} />
              <MenuItem close={close} icon="orientation" current={page?.orientation === "landscape"} label={tr("Paysage", "Landscape")} onClick={() => setPage({ orientation: "landscape" })} />
            </>
          )}
        </Menu>
        <Menu testId="size-menu" trigger={(open) => <Big icon="size" label={tr("Taille", "Size")} caret disabled={off} onClick={open} />}>
          {(close) => (
            <>
              {[["A4", "21 × 29,7 cm"], ["Letter", "21,59 × 27,94 cm"], ["Legal", "21,59 × 35,56 cm"], ["A3", "29,7 × 42 cm"], ["A5", "14,8 × 21 cm"]].map(([s, dim]) => (
                <MenuItem key={s} close={close} icon="size" label={`${s} · ${dim}`} onClick={() => setPage({ size: s })} />
              ))}
            </>
          )}
        </Menu>
        <Menu testId="columns-menu" trigger={(open) => <Big icon="columns" label={tr("Colonnes", "Columns")} caret disabled={off || !!masterEdit} onClick={open} />}>
          {(close) => (
            <>
              {[1, 2, 3].map((n) => (
                <MenuItem key={n} close={close} icon="columns" current={(page?.columns.count ?? 1) === n} label={n === 1 ? tr("Une", "One") : n === 2 ? tr("Deux", "Two") : tr("Trois", "Three")} onClick={() => setPage({ columns: n > 1 ? { count: n } : undefined })} />
              ))}
              <p className="menu-note">{tr("Colonnes de section Word : exportées dans le .docx ; l’éditeur montre une colonne.", "Word section columns: exported to the .docx; the editor shows one column.")}</p>
            </>
          )}
        </Menu>
      </Group>
    </>
  );
}

/** Position, wrap, order, group, align: objects, or the block at the caret (made floating). */
function ArrangeTools({ editor, d, ro, selection }: { editor: Editor; d: ReturnType<typeof derive>; ro: boolean; selection: string[] }) {
  const meta = useStudio((s) => s.meta);
  const obj = selection[0] ? meta?.objects?.[selection[0]] : undefined;
  const off = ro;
  const position = obj ? (obj.placement === "page" ? "page" : "anchored") : "inline";
  return (
    <>
      <Menu testId="position-menu" trigger={(open) => <Big icon="anchor" label={tr("Position", "Position")} caret disabled={off || (!obj && d.topPos === null)} onClick={open} />}>
        {(close) => (
          <>
            <MenuItem close={close} icon="inline" current={position === "inline"} label={tr("Aligné sur le texte", "In line with text")} onClick={() => (obj ? inlineObject(selection[0]) : undefined)} />
            <MenuItem close={close} icon="float" current={position === "anchored"} label={tr("Flottant, se déplace avec le texte", "Floating, moves with text")} onClick={() => (obj ? setPlacement(selection[0], "anchored") : d.topPos !== null && floatBlockAt(d.topPos, "anchored"))} />
            <MenuItem close={close} icon="pin" current={position === "page"} label={tr("Fixe sur la page", "Fixed on the page")} onClick={() => (obj ? setPlacement(selection[0], "page") : d.topPos !== null && floatBlockAt(d.topPos, "page"))} />
          </>
        )}
      </Menu>
      <Col>
        <Menu testId="wrap-menu" trigger={(open) => <Small icon="wrapSquare" label={tr("Habillage", "Wrap text")} caret disabled={off || !obj} onClick={open} />}>
          {(close) => obj && (
            <>
              {([["square", "wrapSquare", tr("Carré", "Square")], ["topBottom", "wrapTopBottom", tr("Haut et bas", "Top and bottom")], ["front", "wrapFront", tr("Devant le texte", "In front of text")], ["behind", "wrapBehind", tr("Derrière le texte", "Behind text")]] as const).map(([id, icon, label]) => (
                <MenuItem key={id} close={close} icon={icon} disabled={obj.placement === "page" && (id === "square" || id === "topBottom")} current={(obj.plane === "behind" ? "behind" : obj.wrap === "none" ? "front" : obj.wrap ?? "square") === id} label={label}
                  onClick={() => updateObjects({ [selection[0]]: id === "behind" ? { plane: "behind", wrap: "none" } : id === "front" ? { plane: "front", wrap: "none" } : { plane: undefined, wrap: id } })} />
              ))}
            </>
          )}
        </Menu>
        <Menu testId="order-menu" trigger={(open) => <Small icon="layers" label={tr("Ordre", "Order")} caret disabled={off || !obj} onClick={open} />}>
          {(close) => (
            <>
              <MenuItem close={close} icon="front" label={tr("Mettre au premier plan", "Bring to front")} onClick={() => selection.forEach((id) => reorder(id, "front"))} />
              <MenuItem close={close} icon="forward" label={tr("Avancer", "Bring forward")} onClick={() => selection.forEach((id) => reorder(id, "forward"))} />
              <MenuItem close={close} icon="backward" label={tr("Reculer", "Send backward")} onClick={() => selection.forEach((id) => reorder(id, "backward"))} />
              <MenuItem close={close} icon="back" label={tr("Mettre à l’arrière-plan", "Send to back")} onClick={() => selection.forEach((id) => reorder(id, "back"))} />
            </>
          )}
        </Menu>
        <Menu testId="group-menu" trigger={(open) => <Small icon="group" label={tr("Grouper", "Group")} caret disabled={off || !obj} onClick={open} />}>
          {(close) => (
            <>
              <MenuItem close={close} icon="group" disabled={selection.length < 2} kbd="Ctrl+G" label={tr("Grouper", "Group")} onClick={() => groupObjects(selection)} />
              <MenuItem close={close} icon="ungroup" disabled={!obj?.group} kbd="Ctrl+Maj+G" label={tr("Dissocier", "Ungroup")} onClick={() => obj?.group && ungroup(groupParts(obj.group)[0])} />
            </>
          )}
        </Menu>
      </Col>
      <Col>
        <Menu testId="align-menu" trigger={(open) => <Small icon="alignCenter" label={tr("Aligner", "Align")} caret disabled={off || selection.length < 2} onClick={open} />}>
          {(close) => (
            <>
              {([["left", "alignLeft", tr("Aligner à gauche", "Align left")], ["center", "alignCenter", tr("Centrer", "Center")], ["right", "alignRight", tr("Aligner à droite", "Align right")], ["top", "vTop", tr("Aligner en haut", "Align top")], ["middle", "vMiddle", tr("Aligner au milieu", "Align middle")], ["bottom", "vBottom", tr("Aligner en bas", "Align bottom")]] as const).map(([m, icon, label]) => (
                <MenuItem key={m} close={close} icon={icon} label={label} onClick={() => alignObjects(selection, m)} />
              ))}
              <MenuItem close={close} icon="alignJustify" disabled={selection.length < 3} label={tr("Répartir horizontalement", "Distribute horizontally")} onClick={() => alignObjects(selection, "hdist")} />
              <MenuItem close={close} icon="alignJustify" disabled={selection.length < 3} label={tr("Répartir verticalement", "Distribute vertically")} onClick={() => alignObjects(selection, "vdist")} />
            </>
          )}
        </Menu>
        <Small icon="duplicate" label={tr("Dupliquer", "Duplicate")} disabled={off || !obj} onClick={() => duplicateObjects(selection)} />
        <Small icon="trash" label={tr("Supprimer", "Delete")} disabled={off || !obj} onClick={() => deleteObjects(selection)} />
      </Col>
    </>
  );
}

function ReferencesTab({ editor, ro }: { editor: Editor; ro: boolean }) {
  const chain = () => editor.chain().focus();
  return (
    <>
      <Group label={tr("Table des matières", "Table of contents")}>
        <Big icon="toc" label={tr("Table des matières", "Table of contents")} disabled={ro} onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "betterMarkdown.insertToc" })} />
        <Col>
          <Small icon="refresh" label={tr("Mettre à jour la table", "Update table")} onClick={() => vscodeApi.postMessage({ type: "runCommand", command: "markdown-embed.update" })} />
        </Col>
      </Group>
      <Group label={tr("Légendes", "Captions")}>
        <Big icon="caption" label={tr("Insérer une légende", "Insert caption")} disabled={ro} onClick={() => insertStyledParagraph(tr("Figure 1 : ", "Figure 1: "), "Caption")} />
      </Group>
      <Group label={tr("Renvois", "Cross-references")}>
        <Col>
          <Small icon="bookmark" label={tr("Signet du paragraphe", "Paragraph bookmark")} disabled={ro} onClick={() => studio.set({ pane: "format", rightOpen: true })} />
          <Small icon="crossRef" label={tr("Renvoi", "Cross-reference")} disabled={ro} onClick={() => window.dispatchEvent(new CustomEvent("ms:crossref"))} />
        </Col>
      </Group>
    </>
  );
}

function DesignTab({ editor, ro, d }: { editor: Editor; ro: boolean; d: ReturnType<typeof derive> }) {
  const masterEdit = useStudio((s) => s.masterEdit);
  const entries = useStudio((s) => s.entries);
  const masters = useStudio((s) => s.masters);
  const meta = useStudio((s) => s.meta);
  const section = d.section;
  const active = section ? section.props.master ?? meta?.master : meta?.master;
  const apply = (id: string) => (section ? setSectionProps(currentSectionBreak(editor)!.pos, { ...section.props, master: id, headers: "master" }) : setDocumentMaster(id));
  return (
    <>
      <Group label={tr("Masque", "Master")}>
        <Big icon="masterEdit" label={masterEdit ? tr("Fermer le masque", "Close master") : tr("Modifier le masque", "Edit master")} active={!!masterEdit} disabled={ro} testId="toggle-master-edit"
          title={tr("Concevoir la page du masque directement sur le papier : en-têtes, pieds, formes, images, espaces réservés", "Design the master page right on the paper: headers, footers, shapes, pictures, placeholders")}
          onClick={() => (masterEdit ? exitMasterEdit(true) : enterMasterEdit(active))} />
        <Menu testId="masters-gallery" className="ms-masters-menu" trigger={(open) => <Big icon="layout" label={tr("Masques", "Masters")} caret disabled={ro} onClick={open} />}>
          {(close) => (
            <div className="ms-master-gallery">
              <h4 className="layout-group">{tr("Appliquer à", "Apply to")} {section ? tr("la section", "the section") : tr("le document", "the document")}</h4>
              <div className="layout-grid">
                {entries.map((e) => {
                  const m = masters.find((x) => x.id === e.id);
                  return (
                    <button key={e.id} type="button" className={`layout-card${e.id === active ? " is-selected" : ""}`} disabled={!!e.errors} title={e.description ?? e.name} onClick={() => (close(), apply(e.id))}>
                      {m ? <MasterPreview master={m} width={100} sample={false} /> : null}
                      <span className="layout-name">{e.name}</span>
                      <span className="layout-alias">{e.source === "starter" ? tr("Intégré", "Built-in") : e.source === "docx" ? m?.provenance?.file ?? "Word" : tr("Bibliothèque", "Library")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Menu>
        <Big icon="layers" label={tr("Gérer les masques", "Manage masters")} testId="open-master-browser" title={tr("Tous les masques avec leurs vignettes : appliquer, modifier, dupliquer, importer", "All masters with their thumbnails: apply, edit, duplicate, import")} onClick={() => studio.set({ mastersOpen: true })} />
        <Col>
          <Small icon="importDoc" label={tr("Importer un modèle Word", "Import Word template")} disabled={ro} onClick={() => void masterAction("import")} />
          <Small icon="folderOpen" label={tr("Importer un document Word", "Import Word document")} onClick={() => void masterAction("importDocument")} />
          <Small icon="plus" label={tr("Nouveau masque", "New master")} disabled={ro} onClick={() => {
            // Webviews have no prompt(): VS Code asks for the name.
            vscodeApi.postMessage({ type: "runCommand", command: "markdownStudio.newMaster" });
          }} />
          <Small icon="refresh" label={tr("Rétablir le masque", "Reset to master")} disabled={ro || !meta?.styles} title={tr("Retirer les styles modifiés localement", "Remove the locally modified styles")} onClick={() => import("./actions").then((a) => a.updateMeta((m) => ({ ...m, styles: undefined })))} />
        </Col>
      </Group>
      <Group label={tr("Document", "Document")}>
        <Big icon="field" label={tr("Champs", "Fields")} onClick={() => studio.set({ pane: "document", rightOpen: true })} title={tr("Titre, client, version… : panneau Document", "Title, client, version…: Document panel")} />
      </Group>
    </>
  );
}

function ReviewTab() {
  return (
    <>
      <Group label={tr("Vérification", "Proofing")}>
        <Big icon="preflight" label={tr("Contrôle avant livraison", "Preflight check")} title={tr("Images et polices manquantes, styles, débordements, conversions de l’export Word", "Missing pictures and fonts, styles, overflow, Word export fallbacks")} onClick={() => void runPreflight()} />
      </Group>
      <Group label={tr("Comparer", "Compare")}>
        <Big icon="diff" label={tr("Modifications", "Changes")} title={tr("Comparer avec la version Git HEAD (révision Git, pas le suivi des modifications Word)", "Compare with Git HEAD (Git review, not Word track changes)")} onClick={() => window.dispatchEvent(new CustomEvent("ms:toggleDiff"))} />
      </Group>
    </>
  );
}

function ViewTab() {
  const showRulers = useStudio((s) => s.showRulers);
  const showBoundaries = useStudio((s) => s.showBoundaries);
  const showBlockHandles = useStudio((s) => s.showBlockHandles);
  const showLineNumbers = useStudio((s) => s.showLineNumbers);
  const showHidden = useStudio((s) => s.showHidden);
  const snap = useStudio((s) => s.snap);
  const zoom = useStudio((s) => s.zoom);
  return (
    <>
      <Group label={tr("Afficher", "Show")}>
        <Col>
          <Small icon="ruler" label={tr("Règles", "Rulers")} active={showRulers} onClick={() => studio.set({ showRulers: !showRulers })} />
          <Small icon="boundaries" label={tr("Limites du texte", "Text boundaries")} active={showBoundaries} onClick={() => studio.set({ showBoundaries: !showBoundaries })} />
          <Small icon="magnet" label={tr("Magnétisme", "Snap")} active={snap} title={tr("Magnétisme (Alt pour ignorer)", "Snap (Alt to ignore)")} onClick={() => studio.set({ snap: !snap })} />
        </Col>
        <Col>
          <Small icon="dragHandle" label={tr("Poignées de bloc", "Block handles")} active={showBlockHandles} title={tr("+ et poignée à gauche du bloc survolé", "+ and grip beside the hovered block")} onClick={() => studio.set({ showBlockHandles: !showBlockHandles })} />
          <Small icon="lineNumbers" label={tr("Numéros de ligne", "Line numbers")} active={showLineNumbers} title={tr("Ligne de la source Markdown de chaque bloc", "Markdown source line of each block")} onClick={() => studio.set({ showLineNumbers: !showLineNumbers })} />
          <Small icon={showHidden ? "eye" : "eyeOff"} label={tr("Objets masqués", "Hidden objects")} active={showHidden} title={tr("Montrer en transparence les objets masqués (affichage seulement)", "Show hidden objects ghosted (view only)")} onClick={() => studio.set({ showHidden: !showHidden })} />
        </Col>
      </Group>
      <Group label="Zoom">
        <Big icon="zoomIn" label="100 %" active={Math.abs(zoom - 1) < 0.005} onClick={() => setZoom(1, true)} />
        <Col>
          <Small icon="fitWidth" label={tr("Largeur de page", "Page width")} onClick={() => manualFit("width")} />
          <Small icon="fitPage" label={tr("Page entière", "Whole page")} onClick={() => manualFit("page")} />
        </Col>
      </Group>
      <Group label="Source">
        <Big icon="code" label={tr("Ouvrir la source", "Open source")} onClick={() => window.dispatchEvent(new CustomEvent("ms:source"))} />
        <Col>
          <Small icon="panel" label={tr("Réglages", "Settings")} onClick={() => window.postMessage({ type: "openSettings" }, "*")} />
          <Small icon="slideshow" label={tr("Mode zen", "Zen mode")} onClick={() => window.postMessage({ type: "toggleZen" }, "*")} />
        </Col>
      </Group>
    </>
  );
}

/** Placeholder kinds: text the document types (presets or a new key) and automatic fields. */
function PlaceholderItems({ close, onPick, current }: { close: () => void; onPick: (key: string) => void; current?: string }) {
  const cur = current && placeholderKey(current);
  return (
    <>
      <div className="menu-label">{tr("Texte saisi dans chaque document", "Text typed in each document")}</div>
      {TEXT_PRESETS().map((p) => <MenuItem key={p.key} close={close} icon="placeholder" label={p.label} current={cur === p.key} onClick={() => onPick(p.key)} />)}
      <MenuItem close={close} icon="plus" label={tr("Autre texte…", "Other text…")} onClick={() => onPick("*")} />
      <div className="menu-sep" role="separator" />
      <div className="menu-label">{tr("Champ automatique", "Automatic field")}</div>
      {AUTO_FIELDS.map((k) => <MenuItem key={k} close={close} icon="field" label={AUTO_LABELS()[k]} current={cur === k} onClick={() => onPick(k)} />)}
    </>
  );
}

/** Contextual Format tab of the selected object. */
function FormatTab({ editor, d, ro }: { editor: Editor; d: ReturnType<typeof derive>; ro: boolean }) {
  const masterEdit = useStudio((s) => s.masterEdit);
  if (masterEdit) return <MasterFormatTab />;
  return <ObjectFormatTab editor={editor} d={d} ro={ro} />;
}

/** Contextual Format tab in master edit mode: role (floating / fixed / placeholder), look, order. */
function MasterFormatTab() {
  const master = useStudio((s) => s.masterEdit);
  const sel = useStudio((s) => s.masterSel);
  const o = sel.length === 1 ? master?.background?.[sel[0]] : undefined;
  if (!o) return null;
  const id = sel[0];
  const set = (patch: Partial<ObjectDescriptor>) => updateMasterObjects({ [id]: patch });
  const mode = o.placeholder ? "placeholder" : o.locked?.geometry ? "fixed" : "floating";
  return (
    <>
      <Group label={tr("Rôle", "Role")}>
        <Big icon="float" label={tr("Flottant", "Floating")} active={mode === "floating"} onClick={() => setMasterObjectMode(id, "floating")} />
        <Big icon="pin" label={tr("Fixe", "Fixed")} active={mode === "fixed"} onClick={() => setMasterObjectMode(id, "fixed")} />
        <Menu trigger={(open) => <Big icon="placeholder" label={tr("Espace réservé", "Placeholder")} caret active={mode === "placeholder"} onClick={open} />}>
          {(close) => (
            <>
              <PlaceholderItems close={close} current={o.placeholder} onPick={(key) => setMasterObjectMode(id, "placeholder", key === "*" ? `texte-${id}` : key)} />
            </>
          )}
        </Menu>
      </Group>
      <Group label={tr("Styles de forme", "Shape styles")}>
        <PaletteMenu value={(o.style?.fill as string) ?? undefined} allowNone onChange={(v) => set({ style: { ...o.style, fill: v === "none" ? null : v ?? undefined } })} trigger={(open) => <Big icon="fillColor" label={tr("Remplissage", "Fill")} caret onClick={open} />} />
        <PaletteMenu value={(o.style?.line as string) ?? undefined} allowNone onChange={(v) => set({ style: { ...o.style, line: v === "none" ? null : v ?? undefined } })} trigger={(open) => <Big icon="borders" label={tr("Contour", "Outline")} caret onClick={open} />} />
      </Group>
      <Group label={tr("Organiser", "Arrange")}>
        <Col>
          <Small icon="front" label={tr("Devant le texte", "In front of text")} active={o.plane !== "behind"} onClick={() => set({ plane: "front" })} />
          <Small icon="back" label={tr("Derrière le texte", "Behind text")} active={o.plane === "behind"} onClick={() => set({ plane: "behind" })} />
        </Col>
        <Big icon="trash" label={tr("Supprimer", "Delete")} onClick={() => deleteMasterObjects([id])} />
      </Group>
      <Group label={tr("Taille", "Size")}>
        <div className="rb-col ms-rb-fields">
          <CmField className="compact-w" label="H" pt={o.box.height} min={0} onCommit={(v) => set({ box: { ...o.box, height: v } })} />
          <CmField className="compact-w" label={tr("L", "W")} pt={o.box.width} min={0} onCommit={(v) => set({ box: { ...o.box, width: v } })} />
        </div>
      </Group>
    </>
  );
}

function ObjectFormatTab({ editor, d, ro }: { editor: Editor; d: ReturnType<typeof derive>; ro: boolean }) {
  const selection = useStudio((s) => s.selection);
  const meta = useStudio((s) => s.meta);
  const o = selection[0] ? meta?.objects?.[selection[0]] : undefined;
  if (!o) return <Group label={tr("Organiser", "Arrange")}><ArrangeTools editor={editor} d={d} ro={ro} selection={selection} /></Group>;
  const id = selection[0];
  const set = (patch: Record<string, unknown>) => updateObjects({ [id]: patch });
  return (
    <>
      {o.type !== "image" && o.type !== "connector" && (
        <Group label={tr("Styles de forme", "Shape styles")}>
          <PaletteMenu value={(o.style?.fill as string) ?? undefined} allowNone onChange={(v) => set({ style: { ...o.style, fill: v === "none" ? null : v ?? undefined } })} trigger={(open) => <Big icon="fillColor" label={tr("Remplissage", "Fill")} caret disabled={ro} onClick={open} />} />
          <PaletteMenu value={(o.style?.line as string) ?? undefined} allowNone onChange={(v) => set({ style: { ...o.style, line: v === "none" ? null : v ?? undefined } })} trigger={(open) => <Big icon="borders" label={tr("Contour", "Outline")} caret disabled={ro} onClick={open} />} />
        </Group>
      )}
      <Group label={tr("Organiser", "Arrange")}>
        <ArrangeTools editor={editor} d={d} ro={ro} selection={selection} />
      </Group>
      <Group label={tr("Taille", "Size")}>
        <div className="rb-col ms-rb-fields">
          <CmField className="compact-w" label="H" pt={o.box.height} min={0} disabled={ro || !!o.locked?.geometry} onCommit={(v) => set({ box: { ...o.box, height: v } })} />
          <CmField className="compact-w" label={tr("L", "W")} pt={o.box.width} min={0} disabled={ro || !!o.locked?.geometry} onCommit={(v) => set({ box: { ...o.box, width: v } })} />
        </div>
      </Group>
      <Group label={tr("Verrous", "Locks")}>
        <Col>
          <Small icon={o.locked?.geometry ? "lock" : "unlock"} label={tr("Verrouiller la position", "Lock position")} active={!!o.locked?.geometry} onClick={() => set({ locked: { ...o.locked, geometry: !o.locked?.geometry || undefined } })} />
          <Small icon={o.locked?.content ? "lock" : "unlock"} label={tr("Verrouiller le contenu", "Lock content")} active={!!o.locked?.content} onClick={() => set({ locked: { ...o.locked, content: !o.locked?.content || undefined } })} />
          {o.type === "image" && <Small icon="inline" label={tr("Remettre dans le texte", "Back in line")} onClick={() => inlineObject(id)} />}
        </Col>
      </Group>
    </>
  );
}

export function Ribbon({ editor: documentEditor, readonly, onSource }: { editor: Editor; readonly: boolean; onSource: () => void }) {
  // While a header / footer is edited, the ribbon acts on its editor.
  const storyEditor = useStudio((s) => s.storyEditor);
  const editor = storyEditor ?? documentEditor;
  const tab = useStudio((s) => s.tab);
  const collapsed = useStudio((s) => s.ribbonCollapsed);
  const selection = useStudio((s) => s.selection);
  const masterEdit = useStudio((s) => s.masterEdit);
  const masterSel = useStudio((s) => s.masterSel);
  const d = useEditorDerived(editor, derive)!;
  // A selected object, or a selected block (picture, diagram, table…): its contextual Format tab.
  const blockSelected = !!d.node && !["msPageBreak", "msSection", "paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote"].includes(d.node);
  const contextual = masterEdit ? masterSel.length === 1 : selection.length > 0 || blockSelected;
  const active: RibbonTab = tab === "format" && !contextual ? "home" : tab;
  const tabs: { id: RibbonTab; label: string }[] = [
    { id: "home", label: tr("Accueil", "Home") },
    { id: "insert", label: tr("Insertion", "Insert") },
    { id: "layout", label: tr("Mise en page", "Layout") },
    { id: "references", label: tr("Références", "References") },
    { id: "design", label: tr("Conception", "Design") },
    { id: "review", label: tr("Révision", "Review") },
    { id: "view", label: tr("Affichage", "View") },
  ];
  const set = (patch: Record<string, unknown>) => studio.set(patch);
  return (
    <div className="ribbon-wrap">
      <TitleBar readonly={readonly} onSource={onSource} />
      <nav className="tabs" role="tablist" aria-label={tr("Ruban", "Ribbon")}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`tab${active === t.id ? " is-active" : ""}`} data-testid={`tab-${t.id}`}
            onClick={() => set({ tab: t.id, ribbonCollapsed: collapsed && active === t.id ? false : collapsed })} onDoubleClick={() => set({ ribbonCollapsed: !collapsed })}>
            {t.label}
          </button>
        ))}
        {contextual && (
          <button type="button" role="tab" aria-selected={active === "format"} className={`tab tab-contextual${active === "format" ? " is-active" : ""}`} data-testid="tab-format" onClick={() => set({ tab: "format" })} onDoubleClick={() => set({ ribbonCollapsed: !collapsed })}>
            {masterEdit ? tr("Format du masque", "Master format") : selection.length ? tr("Format de l’objet", "Object format") : tr("Format", "Format")}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="ibtn tabs-collapse" aria-label={collapsed ? tr("Afficher le ruban", "Show the ribbon") : tr("Réduire le ruban", "Collapse the ribbon")} title={collapsed ? tr("Afficher le ruban", "Show the ribbon") : tr("Réduire le ruban", "Collapse the ribbon")} onClick={() => set({ ribbonCollapsed: !collapsed })}>
          <Icon name="chevronDown" style={{ transform: collapsed ? undefined : "rotate(180deg)" }} />
        </button>
      </nav>
      {!collapsed && (
        <div className="ribbon" role="tabpanel" aria-label={tabs.find((t) => t.id === active)?.label ?? "Format"}>
          {active === "home" && <HomeTab editor={editor} d={d} ro={readonly} />}
          {active === "insert" && <InsertTab editor={editor} d={d} ro={readonly} />}
          {active === "layout" && <LayoutTab editor={editor} d={d} ro={readonly} />}
          {active === "references" && <ReferencesTab editor={editor} ro={readonly} />}
          {active === "design" && <DesignTab editor={editor} ro={readonly} d={d} />}
          {active === "review" && <ReviewTab />}
          {active === "view" && <ViewTab />}
          {active === "format" && <FormatTab editor={editor} d={d} ro={readonly} />}
        </div>
      )}
    </div>
  );
}

