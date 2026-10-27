/**
 * Inspector, Slides Studio's right pane: Format (selected object, master object, or the paragraph /
 * block / section at the caret — blocks carry no on-paper chrome, their settings live here),
 * Styles (provenance and local overrides), Calques (layers) and Contrôle (layout, preflight and
 * export report). Caret-derived values come from useEditorDerived: no React commit while typing.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { frontToBack, layerKey, layerTree, moveLayer, type LayerNode } from "../../../slides-studio/packages/core/src/groups";
import type { BlockProps, MasterDef, ObjectDescriptor, SectionProps, StyleDef } from "../../document/schema";
import { studio, useStudio, objectOf, notify, type Pane } from "./store";
import {
  applyLayerOrder, currentBlock, currentSectionBreak, deleteMasterObjects, floatBlockAt, getSync, inlineObject, reorder, selectObject, setBlockProps, setMasterObjectMode, setPageSetup, setPlacement,
  setSectionProps, setStyleOverride, updateMaster, updateMasterObjects, updateMeta, updateObjects, exitMasterEdit, renameObject, renameMasterObject,
} from "./actions";
import { parseBlockProps, setSpanStyle } from "../extensions/StudioNodes";
import { masterAction } from "./bridge";
import { AUTO_FIELDS, AUTO_LABELS, TEXT_PRESETS, isAutoField, placeholderKey, placeholderPrompt } from "../../document/placeholders";
import { useEditorDerived } from "./hooks";
import { revealSource } from "./commands";
import { GmcOptions } from "../extensions/GmcBlock";
import { gmcViewNames } from "../conversion-utils";
import { Icon, type IconName } from "./icons";
import { CmField, ColorPicker, EditableId, IconButton, NumField, Section, Seg, hexOf, tr } from "./ui";

const PANES: { id: Pane; icon: IconName; label: string }[] = [
  { id: "format", icon: "brush", label: tr("Format", "Format") },
  { id: "styles", icon: "styles", label: tr("Styles", "Styles") },
  { id: "layers", icon: "layers", label: tr("Calques", "Layers") },
  { id: "check", icon: "preflight", label: tr("Contrôle", "Check") },
];

export function Inspector({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const pane = useStudio((s) => s.pane);
  const masterEdit = useStudio((s) => s.masterEdit);
  return (
    <aside className="inspector" aria-label={tr("Inspecteur", "Inspector")} data-testid="inspector">
      <div className="insp-tabs" role="tablist" aria-label={tr("Panneau", "Panel")}>
        {PANES.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={pane === t.id} className={`insp-tab${pane === t.id ? " is-active" : ""}`} onClick={() => studio.set({ pane: t.id })} data-testid={`pane-${t.id}`}>
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>
      {pane === "format" && (masterEdit ? <MasterFormat master={masterEdit} /> : <FormatPane editor={editor} readonly={readonly} />)}
      {pane === "styles" && <StylesPane editor={editor} readonly={readonly} />}
      {pane === "layers" && <LayersPane />}
      {pane === "check" && <CheckPane />}
    </aside>
  );
}

/* Format ------------------------------------------------------------------ */

function FormatPane({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const selection = useStudio((s) => s.selection);
  const objects = useStudio((s) => s.meta?.objects);
  const sel = selection.filter((id) => objects?.[id]);
  if (sel.length > 1)
    return (
      <>
        <div className="insp-head"><span className="insp-kind">{sel.length} {tr("objets", "objects")}</span></div>
        <p className="hint insp-hint">{tr("Aligner, répartir, grouper et ordonner : onglet Format de la forme, ou clic droit sur la sélection.", "Align, distribute, group and order: Shape Format tab, or right-click the selection.")}</p>
      </>
    );
  if (sel.length === 1) return <ObjectFormat id={sel[0]} d={objects![sel[0]]} readonly={readonly} />;
  return <BlockFormat editor={editor} readonly={readonly} />;
}

const TYPE_LABEL = (d: ObjectDescriptor) => (d.type === "image" ? "Image" : d.type === "textbox" ? tr("Zone de texte", "Text box") : d.type === "connector" ? tr("Connecteur", "Connector") : tr("Forme", "Shape"));

/** Geometry, position mode, wrap, appearance and locks: shared by document and master objects. */
function ObjectSections({ d, set, readonly, master }: { d: ObjectDescriptor; set: (p: Partial<ObjectDescriptor>) => void; readonly: boolean; master?: boolean }) {
  const locked = !!d.locked?.geometry || readonly;
  const box = (k: keyof ObjectDescriptor["box"]) => (v: number) => set({ box: { ...d.box, [k]: k === "width" || k === "height" ? Math.max(0, v) : v } });
  const wrapValue = d.plane === "behind" ? "behind" : d.wrap === "none" || d.placement === "page" ? "front" : d.wrap ?? "square";
  return (
    <>
      {d.type !== "connector" && (
        <Section title={tr("Position et taille", "Position and size")} aside={<span className="hint">{d.placement === "page" ? (d.relativeTo === "page" ? tr("depuis le bord", "from the edge") : tr("depuis les marges", "from the margins")) : tr("depuis l’ancre", "from the anchor")}</span>}>
          <div className="grid2">
            <CmField label="X" pt={d.box.x} onCommit={box("x")} disabled={locked} testId="field-x" />
            <CmField label="Y" pt={d.box.y} onCommit={box("y")} disabled={locked} testId="field-y" />
            <CmField label={tr("L", "W")} pt={d.box.width} onCommit={box("width")} disabled={locked} min={0} testId="field-w" />
            <CmField label="H" pt={d.box.height} onCommit={box("height")} disabled={locked} min={0} testId="field-h" />
            <NumField label="Rot." unit="°" step={1} value={d.rotation ?? 0} onCommit={(v) => set({ rotation: v || undefined })} disabled={locked} />
          </div>
        </Section>
      )}
      {!master && d.type !== "connector" && (
        <Section title={tr("Habillage", "Text wrapping")}>
          <Seg label={tr("Habillage", "Text wrapping")} value={wrapValue} disabled={readonly} onChange={(w) => set(w === "behind" ? { plane: "behind", wrap: "none" } : w === "front" ? { plane: "front", wrap: "none" } : { plane: undefined, wrap: w as "square" })}
            options={[
              ...(d.placement !== "page" ? [{ id: "square", icon: "wrapSquare" as const, title: tr("Carré", "Square") }, { id: "topBottom", icon: "wrapTopBottom" as const, title: tr("Haut et bas", "Top and bottom") }] : []),
              { id: "front", icon: "wrapFront", title: tr("Devant le texte", "In front of text") },
              { id: "behind", icon: "wrapBehind", title: tr("Derrière le texte", "Behind text") },
            ]} />
        </Section>
      )}
      {d.type !== "image" && (
        <Section title={tr("Apparence", "Appearance")}>
          {d.type !== "connector" && d.shape !== "line" && <ColorPicker label={tr("Remplissage", "Fill")} value={d.style?.fill} allowNone onChange={(v) => set({ style: { ...d.style, fill: v } })} testId="fill" />}
          <ColorPicker label={tr("Contour", "Outline")} value={d.style?.line} allowNone onChange={(v) => set({ style: { ...d.style, line: v } })} testId="line" />
          <div className="grid2">
            <NumField label={tr("Épais.", "Width")} unit="pt" step={0.25} min={0} value={d.style?.lineWidth ?? 1} onCommit={(v) => set({ style: { ...d.style, lineWidth: v } })} />
            <NumField label={tr("Transp.", "Transp.")} unit="%" step={5} min={0} value={d.style?.transparency ?? 0} onCommit={(v) => set({ style: { ...d.style, transparency: Math.min(100, v) || undefined } })} />
          </div>
          <Seg label={tr("Trait", "Dash")} value={d.style?.dash ?? "solid"} onChange={(v) => set({ style: { ...d.style, dash: v } })} options={[{ id: "solid", label: tr("Plein", "Solid") }, { id: "dash", label: tr("Tirets", "Dash") }, { id: "dot", label: tr("Points", "Dot") }]} />
        </Section>
      )}
      {(d.type === "textbox" || d.type === "shape") && (
        <Section title={tr("Texte", "Text")}>
          <ColorPicker label={tr("Couleur", "Color")} value={d.style?.color} onChange={(v) => set({ style: { ...d.style, color: v ?? undefined } })} />
          <div className="grid2">
            <NumField label={tr("Taille", "Size")} unit="pt" step={1} min={1} value={d.style?.fontSize} onCommit={(v) => set({ style: { ...d.style, fontSize: v } })} />
            <CmField label={tr("Marge", "Padding")} pt={d.style?.padding ?? 4} min={0} onCommit={(v) => set({ style: { ...d.style, padding: v } })} />
          </div>
          <Seg label={tr("Alignement", "Alignment")} value={d.style?.align ?? "left"} onChange={(v) => set({ style: { ...d.style, align: v } })} options={[{ id: "left", icon: "alignLeft", title: tr("Gauche", "Left") }, { id: "center", icon: "alignCenter", title: tr("Centre", "Center") }, { id: "right", icon: "alignRight", title: tr("Droite", "Right") }, { id: "justify", icon: "alignJustify", title: tr("Justifié", "Justify") }]} />
          <Seg label={tr("Vertical", "Vertical")} value={d.style?.valign ?? "top"} onChange={(v) => set({ style: { ...d.style, valign: v } })} options={[{ id: "top", icon: "vTop", title: tr("Haut", "Top") }, { id: "middle", icon: "vMiddle", title: tr("Milieu", "Middle") }, { id: "bottom", icon: "vBottom", title: tr("Bas", "Bottom") }]} />
        </Section>
      )}
    </>
  );
}

function ObjectFormat({ id, d, readonly }: { id: string; d: ObjectDescriptor; readonly: boolean }) {
  const set = (patch: Partial<ObjectDescriptor>) => updateObjects({ [id]: patch });
  const mode = d.placement === "page" ? "page" : "anchored";
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{TYPE_LABEL(d)}</span>
        <EditableId value={id} title={tr("Identifiant — double-clic pour renommer", "Id — double-click to rename")} onRename={readonly ? undefined : (next) => renameObject(id, next)} />
        <span className="grow" />
        <IconButton icon={d.locked?.geometry ? "lock" : "unlock"} label={d.locked?.geometry ? tr("Déverrouiller", "Unlock") : tr("Verrouiller", "Lock")} active={!!d.locked?.geometry} disabled={readonly} onClick={() => set({ locked: { ...d.locked, geometry: !d.locked?.geometry || undefined } })} />
        <IconButton icon={d.hidden ? "eyeOff" : "eye"} label={d.hidden ? tr("Afficher", "Show") : tr("Masquer", "Hide")} active={!!d.hidden} disabled={readonly} onClick={() => set({ hidden: !d.hidden || undefined })} />
      </div>
      {d.type !== "connector" && (
        <Section title={tr("Position", "Position")}>
          <Seg label={tr("Position", "Position")} value={mode} disabled={readonly || !!d.locked?.geometry} onChange={(m) => setPlacement(id, m)}
            options={[{ id: "anchored", icon: "float", label: tr("Flottant", "Floating"), title: tr("Se déplace avec le texte (ancré au paragraphe)", "Moves with text (anchored to its paragraph)") }, { id: "page", icon: "pin", label: tr("Fixe", "Fixed"), title: tr("Fixe sur la page", "Fixed on the page") }]} />
          {mode === "page" && (
            <Seg label={tr("Référence", "Relative to")} value={d.relativeTo ?? "margin"} onChange={(r) => setPlacement(id, "page", r)} options={[{ id: "margin", label: tr("Marges", "Margins") }, { id: "page", label: tr("Bords de page", "Page edges") }]} />
          )}
          {d.type !== "shape" && <button type="button" className="btn btn-block" disabled={readonly} onClick={() => inlineObject(id)}><Icon name="inline" /> {tr("Aligner sur le texte", "Put in line with text")}</button>}
        </Section>
      )}
      {d.type === "connector" && (
        <Section title={tr("Connexion", "Connection")}>
          <p className="hint">{tr("De", "From")} <code>{d.from?.id ?? "?"}</code> {tr("à", "to")} <code>{d.to?.id ?? "?"}</code>{(!objectOf(d.from?.id ?? "") || !objectOf(d.to?.id ?? "")) && <strong className="hint-error"> — {tr("extrémité manquante", "missing end")}</strong>}</p>
          <Seg label={tr("Tracé", "Route")} value={d.route ?? "straight"} onChange={(r) => set({ route: r })} options={[{ id: "straight", label: tr("Droit", "Straight") }, { id: "elbow", label: tr("Coudé", "Elbow") }]} />
          <Seg label={tr("Flèche", "Arrow")} value={d.style?.endArrow ?? "triangle"} onChange={(a) => set({ style: { ...d.style, endArrow: a } })} options={[{ id: "none", label: tr("Aucune", "None") }, { id: "triangle", label: "▶" }, { id: "arrow", label: "➤" }]} />
        </Section>
      )}
      <ObjectSections d={d} set={set} readonly={readonly} />
      <Section title={tr("Verrous", "Locks")}>
        <label className="check"><input type="checkbox" checked={!!d.locked?.content} disabled={readonly} onChange={(e) => set({ locked: { ...d.locked, content: e.target.checked || undefined } })} /> {tr("Verrouiller le contenu", "Lock content")}</label>
        <p className="hint">{tr("Verrous propres à l’éditeur (pas une protection Word).", "Editor-only locks (not Word protection).")}</p>
      </Section>
    </>
  );
}

interface Caret {
  name: string;
  pos: number;
  level: number;
  props: BlockProps;
  canProps: boolean;
  css: Record<string, string>;
  /** Props only: the break's position shifts while typing before it (looked up on commit). */
  section: { props: SectionProps } | null;
  sectionIndex: number;
  /** The block itself is selected (diagram, image, table…), not text in it. */
  selected: boolean;
  /** Fence options and source of a selected GMC diagram. */
  gmc?: { meta: string; views: string[] };
}

function caretOf(editor: Editor): Caret {
  const { from } = editor.state.selection;
  const block = currentBlock(editor.state);
  const top = block?.node ?? editor.state.doc.nodeAt(from);
  const span = editor.getAttributes("msTextStyle") as { style?: string };
  let sectionIndex = 0;
  editor.state.doc.forEach((n, p) => {
    if (n.type.name === "msSection" && p < from) sectionIndex++;
  });
  return {
    name: top?.type.name ?? "doc",
    pos: block?.pos ?? from,
    level: top?.type.name === "heading" ? (top.attrs.level as number) : 0,
    props: parseBlockProps(top?.attrs.msBlock),
    canProps: !!top && "msBlock" in top.attrs,
    css: Object.fromEntries((span.style ?? "").split(";").filter(Boolean).map((x) => x.split(":").map((s) => s.trim()))),
    section: currentSectionBreak(editor) ? { props: currentSectionBreak(editor)!.props } : null,
    sectionIndex,
    selected: editor.state.selection instanceof NodeSelection,
    gmc: top?.type.name === "gmcBlock" ? { meta: String(top.attrs.meta ?? ""), views: gmcViewNames(top.textContent) } : undefined,
  };
}

const BLOCK_KIND: Record<string, string> = {
  paragraph: tr("Paragraphe", "Paragraph"), heading: tr("Titre", "Heading"), table: tr("Tableau", "Table"), image: "Image", codeBlock: tr("Code", "Code"), gmcBlock: tr("Diagramme GMC", "GMC diagram"),
  mermaidBlock: "Mermaid", mathBlock: tr("Équation", "Equation"), bulletList: tr("Liste à puces", "Bulleted list"), orderedList: tr("Liste numérotée", "Numbered list"), taskList: tr("Liste de tâches", "Checklist"),
  blockquote: tr("Citation", "Quote"), directiveBlock: tr("Contenu intégré", "Embedded content"), deckBlock: tr("Présentation", "Slide deck"), msPageBreak: tr("Saut de page", "Page break"), msSection: tr("Saut de section", "Section break"), horizontalRule: tr("Trait", "Rule"),
};

function BlockFormat({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const c = useEditorDerived(editor, caretOf);
  const sections = useStudio((s) => s.sections);
  const meta = useStudio((s) => s.meta);
  const entries = useStudio((s) => s.entries);
  if (!c) return null;
  const p = c.props;
  const ro = readonly || !c.canProps;
  const sec = sections[c.sectionIndex];
  const page = sec?.page;
  const sectionSet = (patch: Record<string, unknown>) => {
    const live = currentSectionBreak(editor);
    if (live) setSectionProps(live.pos, { ...live.props, ...patch });
    else setPageSetup(patch as never);
  };
  const margins = (k: string) => (v: number) => sectionSet({ margins: { ...(c.section?.props.margins ?? meta?.page?.margins), [k]: v } });
  const floatable = !["msPageBreak", "msSection", "msObject", "doc"].includes(c.name);
  const line = () => {
    const node = editor.state.doc.nodeAt(c.pos);
    const l = node && getSync()?.lineOf(node);
    if (l) revealSource(l);
  };
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{c.level ? `${BLOCK_KIND.heading} ${c.level}` : BLOCK_KIND[c.name] ?? c.name}</span>
        {p.style && <code className="insp-id">{sections[0]?.sheet.styles.get(p.style)?.name ?? p.style}</code>}
        <span className="grow" />
        <IconButton icon="code" label={tr("Voir dans la source", "Show in source")} onClick={line} />
      </div>
      {floatable && (
        <Section title={tr("Position", "Position")}>
          <Seg label={tr("Position", "Position")} value="inline" disabled={readonly} onChange={(m) => m !== "inline" && floatBlockAt(c.pos, m)}
            options={[{ id: "inline", icon: "inline", label: tr("Aligné", "Inline"), title: tr("Aligné sur le texte", "In line with text") }, { id: "anchored", icon: "float", label: tr("Flottant", "Float"), title: tr("Transformer en objet flottant", "Make floating") }, { id: "page", icon: "pin", label: tr("Fixe", "Fixed"), title: tr("Fixer sur la page", "Fix on the page") }]} />
        </Section>
      )}
      {c.gmc && (
        <Section title={tr("Diagramme", "Diagram")}>
          <div className="insp-fence">
            <GmcOptions meta={c.gmc.meta} views={c.gmc.views} editable={!readonly} onChange={(meta) => {
              const node = editor.state.doc.nodeAt(c.pos);
              if (node?.type.name === "gmcBlock") editor.view.dispatch(editor.state.tr.setNodeMarkup(c.pos, undefined, { ...node.attrs, meta }));
            }} />
          </div>
          <div className="insp-actions">
            <button type="button" className="btn" disabled={readonly} onClick={() => (editor.view.nodeDOM(c.pos) as HTMLElement | null)?.querySelector(".gmc-block-preview")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))}><Icon name="edit" /> {tr("Modifier le diagramme", "Edit diagram")}</button>
            <button type="button" className="btn" onClick={() => ((editor.view.nodeDOM(c.pos) as HTMLElement | null)?.querySelector<HTMLElement>(".mermaid-block-toggle[aria-expanded]"))?.click()}><Icon name="code" /> {tr("Code du modèle", "Model code")}</button>
          </div>
        </Section>
      )}
      {c.canProps && (
        <>
          <Section title={tr("Paragraphe", "Paragraph")}>
            <Seg label={tr("Alignement", "Alignment")} value={p.align ?? "left"} disabled={ro} onChange={(v) => setBlockProps({ align: v })} options={[{ id: "left", icon: "alignLeft", title: tr("Gauche", "Left") }, { id: "center", icon: "alignCenter", title: tr("Centre", "Center") }, { id: "right", icon: "alignRight", title: tr("Droite", "Right") }, { id: "justify", icon: "alignJustify", title: tr("Justifié", "Justify") }]} />
            <div className="grid2">
              <CmField label={tr("Gauche", "Left")} pt={p.indentLeft ?? 0} min={0} disabled={ro} onCommit={(v) => setBlockProps({ indentLeft: v || undefined })} />
              <CmField label={tr("Droite", "Right")} pt={p.indentRight ?? 0} min={0} disabled={ro} onCommit={(v) => setBlockProps({ indentRight: v || undefined })} />
              <CmField label={tr("1re ligne", "First")} pt={p.firstLine ?? 0} disabled={ro} onCommit={(v) => setBlockProps({ firstLine: v || undefined })} />
              <NumField label={tr("Interl.", "Line")} unit="×" step={0.05} min={0.5} value={p.lineSpacing} disabled={ro} onCommit={(v) => setBlockProps({ lineSpacing: v })} />
              <NumField label={tr("Avant", "Before")} unit="pt" step={2} min={0} value={p.spaceBefore} disabled={ro} onCommit={(v) => setBlockProps({ spaceBefore: v })} />
              <NumField label={tr("Après", "After")} unit="pt" step={2} min={0} value={p.spaceAfter} disabled={ro} onCommit={(v) => setBlockProps({ spaceAfter: v })} />
            </div>
          </Section>
          <Section title={tr("Enchaînements", "Line and page breaks")}>
            <label className="check"><input type="checkbox" checked={!!p.keepWithNext} disabled={ro} onChange={(e) => setBlockProps({ keepWithNext: e.target.checked || undefined })} /> {tr("Paragraphes solidaires", "Keep with next")}</label>
            <label className="check"><input type="checkbox" checked={!!p.keepTogether} disabled={ro} onChange={(e) => setBlockProps({ keepTogether: e.target.checked || undefined })} /> {tr("Lignes solidaires", "Keep lines together")}</label>
            <label className="check"><input type="checkbox" checked={!!p.pageBreakBefore} disabled={ro} onChange={(e) => setBlockProps({ pageBreakBefore: e.target.checked || undefined })} /> {tr("Saut de page avant", "Page break before")}</label>
            <label className="check"><input type="checkbox" checked={p.widowControl !== false} disabled={ro} onChange={(e) => setBlockProps({ widowControl: e.target.checked ? undefined : false })} /> {tr("Éviter veuves et orphelines", "Widow / orphan control")}</label>
          </Section>
          <Section title={tr("Caractère", "Character")}>
            <div className="grid2">
              <NumField label={tr("Taille", "Size")} unit="pt" step={1} min={1} value={c.css["font-size"] ? parseFloat(c.css["font-size"]) : undefined} disabled={readonly} onCommit={(v) => setSpanStyle(editor, { "font-size": v ? `${v}pt` : null })} />
            </div>
            <ColorPicker label={tr("Couleur", "Color")} value={c.css.color?.replace("#", "") || undefined} onChange={(v) => setSpanStyle(editor, { color: v ? `#${hexOf(v) ?? v}` : null })} />
            <ColorPicker label={tr("Surlignage", "Highlight")} value={c.css["background-color"]?.replace("#", "") || undefined} allowNone onChange={(v) => setSpanStyle(editor, { "background-color": v && v !== "none" ? `#${hexOf(v) ?? v}` : null })} />
          </Section>
          <Section title={tr("Signet", "Bookmark")}>
            <input className="select" key={`${c.pos}:${p.id ?? ""}`} defaultValue={p.id ?? ""} disabled={ro} placeholder={tr("ex. annexe", "e.g. appendix")} aria-label={tr("Identifiant de signet", "Bookmark id")} onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (p.id ?? "")) return;
              if (v && !/^[A-Za-z][\w-]{0,63}$/.test(v)) return notify("warning", tr("Un identifiant commence par une lettre (lettres, chiffres, - et _).", "Ids start with a letter and use letters, digits, - and _."));
              setBlockProps({ id: v || undefined });
            }} />
          </Section>
        </>
      )}
      {/* A selected block shows its own settings only (as a selected element in Slides Studio). */}
      {!c.selected && <><Section title={c.section ? tr(`Section ${c.sectionIndex + 1}`, `Section ${c.sectionIndex + 1}`) : tr("Mise en page", "Page setup")} aside={page && <span className="hint">{page.orientation === "landscape" ? tr("paysage", "landscape") : tr("portrait", "portrait")}</span>}>
        <select className="select" aria-label={tr("Masque", "Master")} value={(c.section ? c.section.props.master : meta?.master) ?? ""} disabled={readonly} onChange={(e) => sectionSet({ master: e.target.value || undefined, ...(c.section ? { headers: e.target.value ? "master" : "link" } : {}) })}>
          <option value="">{c.section ? tr("Comme la section précédente", "Same as previous section") : tr("Aucun (par défaut)", "None (defaults)")}</option>
          {entries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {page && (
          <div className="grid2">
            <CmField label={tr("Haut", "Top")} pt={page.margins.top} min={0} disabled={readonly} onCommit={margins("top")} />
            <CmField label={tr("Bas", "Bottom")} pt={page.margins.bottom} min={0} disabled={readonly} onCommit={margins("bottom")} />
            <CmField label={tr("Gauche", "Left")} pt={page.margins.left} min={0} disabled={readonly} onCommit={margins("left")} />
            <CmField label={tr("Droite", "Right")} pt={page.margins.right} min={0} disabled={readonly} onCommit={margins("right")} />
          </div>
        )}
        {c.section && (
          <>
            <select className="select" aria-label={tr("Début de section", "Section start")} value={c.section.props.break ?? "nextPage"} disabled={readonly} onChange={(e) => sectionSet({ break: e.target.value })}>
              <option value="nextPage">{tr("Page suivante", "Next page")}</option>
              <option value="oddPage">{tr("Page impaire suivante", "Next odd page")}</option>
              <option value="evenPage">{tr("Page paire suivante", "Next even page")}</option>
              <option value="continuous">{tr("Continu", "Continuous")}</option>
            </select>
            <Seg label={tr("En-têtes", "Headers")} value={c.section.props.headers ?? (c.section.props.master ? "master" : "link")} disabled={readonly} onChange={(v) => sectionSet({ headers: v })} options={[{ id: "link", label: tr("Lier au précédent", "Link to previous") }, { id: "master", label: tr("Du masque", "From master") }]} />
          </>
        )}
      </Section>
      <Section title={tr("Champs du document", "Document fields")}>
        <FieldsEditor readonly={readonly} />
      </Section></>}
    </>
  );
}

function FieldsEditor({ readonly }: { readonly: boolean }) {
  const meta = useStudio((s) => s.meta);
  const sections = useStudio((s) => s.sections);
  const defs = Object.assign({}, ...(sections[0]?.chain ?? []).map((m) => m.fields ?? {})) as Record<string, { label: string; default?: string }>;
  const names = [...new Set([...Object.keys(defs), ...Object.keys(meta?.fields ?? {})])];
  if (!names.length) return <p className="hint">{tr("Le masque ne définit aucun champ.", "The master defines no fields.")}</p>;
  return (
    <div className="stack">
      {names.map((n) => (
        <label key={n} className="field">
          <span>{defs[n]?.label ?? n}</span>
          <input className="select" key={meta?.fields?.[n] ?? ""} defaultValue={meta?.fields?.[n] ?? ""} placeholder={defs[n]?.default ?? ""} disabled={readonly} onBlur={(e) => {
            const v = e.target.value;
            if ((meta?.fields?.[n] ?? "") === v) return;
            updateMeta((m) => {
              const fields = { ...m.fields };
              if (v) fields[n] = v;
              else delete fields[n];
              return { ...m, fields: Object.keys(fields).length ? fields : undefined };
            });
          }} />
        </label>
      ))}
    </div>
  );
}

/* Master edit: the master itself or one of its objects ------------------- */

function MasterFormat({ master }: { master: MasterDef }) {
  const sel = useStudio((s) => s.masterSel);
  const d = sel.length === 1 ? master.background?.[sel[0]] : undefined;
  if (d) return <MasterObjectFormat id={sel[0]} d={d} />;
  return <MasterPage master={master} />;
}

function MasterObjectFormat({ id, d }: { id: string; d: ObjectDescriptor }) {
  const set = (patch: Partial<ObjectDescriptor>) => updateMasterObjects({ [id]: patch });
  const mode = d.placeholder ? "placeholder" : d.locked?.geometry ? "fixed" : "floating";
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{d.placeholder ? tr("Espace réservé", "Placeholder") : TYPE_LABEL(d)}</span>
        <EditableId value={id} title={tr("Identifiant — double-clic pour renommer", "Id — double-click to rename")} onRename={(next) => renameMasterObject(id, next)} />
        <span className="grow" />
        <IconButton icon="trash" label={tr("Supprimer du masque", "Delete from master")} onClick={() => deleteMasterObjects([id])} />
      </div>
      <Section title={tr("Rôle dans le masque", "Role in the master")}>
        <Seg label={tr("Rôle", "Role")} value={mode} onChange={(m) => setMasterObjectMode(id, m)}
          options={[{ id: "floating", icon: "float", label: tr("Flottant", "Floating") }, { id: "fixed", icon: "pin", label: tr("Fixe", "Fixed") }, { id: "placeholder", icon: "placeholder", label: tr("Réservé", "Placeholder") }]} />
        {mode === "placeholder" && (() => {
          const key = placeholderKey(d.placeholder!);
          const auto = isAutoField(key);
          const preset = TEXT_PRESETS().some((p) => p.key === key);
          return (
            <>
              <select className="select" aria-label={tr("Contenu", "Content")} value={auto || preset ? key : "*"} onChange={(e) => setMasterObjectMode(id, "placeholder", e.target.value === "*" ? `texte-${id}` : e.target.value)}>
                <optgroup label={tr("Texte saisi dans chaque document", "Text typed in each document")}>
                  {TEXT_PRESETS().map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  <option value="*">{tr("Autre texte…", "Other text…")}</option>
                </optgroup>
                <optgroup label={tr("Champ automatique", "Automatic field")}>
                  {AUTO_FIELDS.map((k) => <option key={k} value={k}>{AUTO_LABELS()[k]}</option>)}
                </optgroup>
              </select>
              {!auto && (
                <>
                  <label className="field">
                    <span>{tr("Clé (champ du document)", "Key (document field)")}</span>
                    <input className="select" key={`k-${key}`} defaultValue={key} onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== key && /^[A-Za-z][\w-]{0,63}$/.test(next)) set({ placeholder: next });
                    }} />
                  </label>
                  <label className="field">
                    <span>{tr("Invite (affichée vide)", "Prompt (shown when empty)")}</span>
                    <input className="select" key={`p-${key}`} defaultValue={d.text ?? ""} placeholder={placeholderPrompt(key)} onBlur={(e) => e.target.value !== (d.text ?? "") && set({ text: e.target.value || undefined })} />
                  </label>
                </>
              )}
            </>
          );
        })()}
        {mode !== "placeholder" && d.type === "textbox" && (
          <textarea className="textarea" rows={2} value={d.text ?? ""} aria-label={tr("Texte", "Text")} onChange={(e) => set({ text: e.target.value })} />
        )}
        <p className="hint">{mode === "placeholder" ? (isAutoField(placeholderKey(d.placeholder!)) ? tr("Calculé à l’affichage ; exporté comme champ Word.", "Computed when shown; exported as a Word field.") : tr("Chaque document y saisit son propre texte (clic sur la page).", "Each document types its own text in it (click on the page).")) : mode === "fixed" ? tr("Verrouillé à sa place sur chaque page.", "Locked in place on every page.") : tr("Se déplace librement dans le masque.", "Moves freely in the master.")}</p>
      </Section>
      <Section title={tr("Plan", "Plane")}>
        <Seg label={tr("Plan", "Plane")} value={d.plane === "behind" ? "behind" : "front"} onChange={(v) => set({ plane: v })} options={[{ id: "front", icon: "wrapFront", label: tr("Devant", "Front") }, { id: "behind", icon: "wrapBehind", label: tr("Derrière", "Behind") }]} />
      </Section>
      <ObjectSections d={d} set={set} readonly={false} master />
    </>
  );
}

function MasterPage({ master }: { master: MasterDef }) {
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    void masterAction("usage", { id: master.id }).then((r: any) => setUsage(Array.isArray(r?.documents) ? r.documents.length : null), () => setUsage(null));
  }, [master.id]);
  const page = master.page;
  const setPage = (p: Partial<MasterDef["page"]>) => updateMaster({ page: { ...page, ...p, margins: { ...page.margins, ...p.margins } as never } });
  const theme = master.theme ?? { colors: {}, fonts: { heading: "Calibri Light", body: "Calibri" } };
  const m = page.margins ?? {};
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{tr("Masque", "Master")}</span>
        <EditableId value={master.name} title={tr("Nom du masque — double-clic pour renommer", "Master name — double-click to rename")} onRename={(name) => updateMaster({ name })} />
      </div>
      <p className="hint insp-hint">{usage === null ? tr("Modifie tous les documents qui utilisent ce masque.", "Changes every document using this master.") : tr(`Utilisé par ${usage} document(s).`, `Used by ${usage} document(s).`)} {tr("Clic droit sur la page pour ajouter un objet ou un espace réservé.", "Right-click the page to add an object or a placeholder.")}</p>
      <Section title={tr("Page", "Page")}>
        <div className="grid2">
          <select className="select" aria-label={tr("Taille", "Size")} value={page.size ?? "A4"} onChange={(e) => setPage({ size: e.target.value as "A4" })}>{["A4", "Letter", "Legal", "A3", "A5"].map((s) => <option key={s}>{s}</option>)}</select>
          <Seg label={tr("Orientation", "Orientation")} value={page.orientation ?? "portrait"} onChange={(o) => setPage({ orientation: o })} options={[{ id: "portrait", icon: "page", title: tr("Portrait", "Portrait") }, { id: "landscape", icon: "orientation", title: tr("Paysage", "Landscape") }]} />
          {(["top", "bottom", "left", "right", "header", "footer"] as const).map((k) => (
            <CmField key={k} label={{ top: tr("Haut", "Top"), bottom: tr("Bas", "Bottom"), left: tr("Gauche", "Left"), right: tr("Droite", "Right"), header: tr("En-tête", "Header"), footer: tr("Pied", "Footer") }[k]} pt={(m as Record<string, number>)[k]} min={0} onCommit={(v) => setPage({ margins: { [k]: v } as never })} />
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={!!master.titlePage} onChange={(e) => updateMaster({ titlePage: e.target.checked })} /> {tr("Première page différente", "Different first page")}</label>
        <label className="check"><input type="checkbox" checked={!!master.evenAndOdd} onChange={(e) => updateMaster({ evenAndOdd: e.target.checked })} /> {tr("Pages paires et impaires différentes", "Different odd and even pages")}</label>
      </Section>
      <Section title={tr("Thème", "Theme")}>
        <div className="grid2">
          <label className="field"><span>{tr("Titres", "Headings")}</span><input className="select" value={theme.fonts.heading} onChange={(e) => updateMaster({ theme: { ...theme, fonts: { ...theme.fonts, heading: e.target.value } } })} /></label>
          <label className="field"><span>{tr("Corps", "Body")}</span><input className="select" value={theme.fonts.body} onChange={(e) => updateMaster({ theme: { ...theme, fonts: { ...theme.fonts, body: e.target.value } } })} /></label>
        </div>
        {(["dk1", "dk2", "accent1", "accent2", "accent3", "accent4", "hlink"] as const).map((slot) => (
          <ThemeColor key={slot} slot={slot} value={theme.colors[slot]} onChange={(v) => updateMaster({ theme: { ...theme, colors: { ...theme.colors, [slot]: v } } })} />
        ))}
      </Section>
      <Section title={tr("En-têtes et pieds", "Headers and footers")}>
        <p className="hint">{tr("Double-cliquez l’en-tête ou le pied sur la page pour les modifier.", "Double-click the header or footer on the page to edit them.")}</p>
      </Section>
      <div className="insp-section">
        <div className="row">
          <button type="button" className="btn btn-primary" data-testid="master-done" onClick={() => void exitMasterEdit(true)}><Icon name="done" /> {tr("Terminer", "Done")}</button>
          <button type="button" className="btn" onClick={() => void exitMasterEdit(false)}>{tr("Abandonner", "Discard")}</button>
          {master.provenance?.source !== "starter" && <button type="button" className="btn" onClick={() => void masterAction("openSource", { id: master.id })}>master.json</button>}
        </div>
      </div>
    </>
  );
}

function ThemeColor({ slot, value, onChange }: { slot: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <span className="swatch" style={{ background: value ? `#${value}` : "transparent" }} data-none={!value} />
      <span className="color-label">{slot}</span>
      <input type="color" className="color-native" value={value ? `#${value}` : "#000000"} onChange={(e) => onChange(e.target.value.slice(1).toUpperCase())} aria-label={slot} />
    </label>
  );
}

/* Styles ------------------------------------------------------------------ */

function StylesPane({ editor, readonly }: { editor: Editor; readonly: boolean }) {
  const sheet = useStudio((s) => s.sections[0]?.sheet);
  const meta = useStudio((s) => s.meta);
  const current = useEditorDerived(editor, (e) => (e.isActive("heading") ? `Heading${e.getAttributes("heading").level}` : parseBlockProps(e.state.selection.$from.depth ? e.state.selection.$from.node(1).attrs.msBlock : undefined).style ?? "Normal"));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? current ?? "Normal";
  const style = sheet?.styles.get(selected);
  const usage = useMemo(() => {
    let n = 0;
    editor.state.doc.descendants((node) => {
      const id = parseBlockProps(node.attrs?.msBlock).style ?? (node.type.name === "heading" ? `Heading${node.attrs.level}` : node.type.name === "paragraph" ? "Normal" : null);
      if (id === selected) n++;
      return node.type.name !== "paragraph";
    });
    return n;
  }, [selected, sheet]);
  if (!sheet) return null;
  const local = meta?.styles?.[selected];
  const set = (group: "run" | "paragraph", key: string, value: unknown) => setStyleOverride(selected, { [group]: { ...(local?.[group] ?? {}), [key]: value } } as Partial<StyleDef>);
  const origin = (k: string) => {
    const o = style?.origin[k];
    if (!o) return undefined;
    return o.from === "local" ? tr("local", "local") : o.from === "default" ? tr("défaut", "default") : `${tr("masque", "master")}${o.style !== selected ? ` ← ${o.style}` : ""}`;
  };
  return (
    <>
      <div className="layers-list ms-style-list" role="listbox" aria-label={tr("Styles", "Styles")}>
        {[...sheet.styles.values()].filter((s) => s.type !== "table").map((s) => (
          <div key={s.id} role="option" tabIndex={0} aria-selected={s.id === selected} className={`layer-row${s.id === selected ? " is-selected" : ""}`} onClick={() => setPicked(s.id)} onKeyDown={(e) => e.key === "Enter" && setPicked(s.id)}>
            <span className="layer-icon">{s.type === "character" ? "a" : "¶"}</span>
            <span className="layer-label">
              <span className={`layer-name ms-style-preview ${s.type === "character" ? `ms-cs-${s.id}` : `ms-s-${s.id}`}`}>{s.name}</span>
              {s.overridden && <span className="layer-sub">{tr("modifié localement", "changed locally")}</span>}
            </span>
            {s.id === current && <span className="layer-sub">{tr("au curseur", "at caret")}</span>}
          </div>
        ))}
      </div>
      {style && (
        <>
          <div className="insp-head">
            <span className="insp-kind">{style.name}</span>
            <span className="grow" />
            {local && <button type="button" className="btn" disabled={readonly} onClick={() => setStyleOverride(selected, null)}>{tr("Rétablir le masque", "Reset to master")}</button>}
          </div>
          <p className="hint insp-hint">{tr(`Basé sur ${style.basedOn ?? "—"} · ${usage} bloc(s) l’utilisent.`, `Based on ${style.basedOn ?? "—"} · used by ${usage} block(s).`)}</p>
          <Section title={tr("Police", "Font")} aside={<span className="hint">{origin("run.size")}</span>}>
            <div className="grid2">
              <NumField label={tr("Taille", "Size")} unit="pt" step={1} min={1} value={style.run.size} disabled={readonly} onCommit={(v) => set("run", "size", v)} />
              <input className="select" key={style.run.font ?? ""} defaultValue={style.run.font ?? ""} aria-label={tr("Police", "Font")} disabled={readonly} onBlur={(e) => e.target.value !== (style.run.font ?? "") && set("run", "font", e.target.value || undefined)} />
            </div>
            <ColorPicker label={tr("Couleur", "Color")} value={style.run.color} onChange={(v) => set("run", "color", v ?? undefined)} />
            <div className="row">
              <IconButton icon="bold" label={tr("Gras", "Bold")} active={!!style.run.bold} disabled={readonly} onClick={() => set("run", "bold", !style.run.bold)} />
              <IconButton icon="italic" label={tr("Italique", "Italic")} active={!!style.run.italic} disabled={readonly} onClick={() => set("run", "italic", !style.run.italic)} />
              <IconButton icon="underline" label={tr("Souligné", "Underline")} active={!!style.run.underline} disabled={readonly} onClick={() => set("run", "underline", !style.run.underline)} />
            </div>
          </Section>
          {style.type === "paragraph" && (
            <Section title={tr("Paragraphe", "Paragraph")}>
              <div className="grid2">
                <NumField label={tr("Avant", "Before")} unit="pt" step={2} min={0} value={style.paragraph.spaceBefore} disabled={readonly} onCommit={(v) => set("paragraph", "spaceBefore", v)} />
                <NumField label={tr("Après", "After")} unit="pt" step={2} min={0} value={style.paragraph.spaceAfter} disabled={readonly} onCommit={(v) => set("paragraph", "spaceAfter", v)} />
                <NumField label={tr("Interl.", "Line")} unit="×" step={0.05} min={0.5} value={style.paragraph.lineSpacing} disabled={readonly} onCommit={(v) => set("paragraph", "lineSpacing", v)} />
              </div>
              <label className="check"><input type="checkbox" checked={!!style.paragraph.keepWithNext} disabled={readonly} onChange={(e) => set("paragraph", "keepWithNext", e.target.checked)} /> {tr("Paragraphes solidaires", "Keep with next")}</label>
            </Section>
          )}
          <p className="hint insp-hint">{tr("Modifications locales à ce document ; le masque reste inchangé.", "Local overrides in this document; the master stays unchanged.")}</p>
        </>
      )}
    </>
  );
}

/* Layers ------------------------------------------------------------------ */

const LAYER_ICON = (d: ObjectDescriptor): IconName => (d.type === "image" ? "image" : d.type === "textbox" ? "text" : d.type === "connector" ? "connector" : "shape");

function LayersPane() {
  const meta = useStudio((s) => s.meta);
  const selection = useStudio((s) => s.selection);
  const sections = useStudio((s) => s.sections);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; where: "before" | "after" | "inside" } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const all = Object.entries(meta?.objects ?? {}).map(([id, d]) => ({ id, group: d.group, z: d.z, d }));
  type Item = (typeof all)[number];
  const planes = { front: all.filter((o) => o.d.plane !== "behind"), behind: all.filter((o) => o.d.plane === "behind") };
  const inherited = Object.entries(sections[0]?.background ?? {});
  const commitDrop = (tree: LayerNode<Item>[]) => {
    if (drag && drop) {
      const result = moveLayer(tree, drag, drop.key, drop.where);
      if (result) applyLayerOrder(result.order, result.groups);
    }
    setDrag(null);
    setDrop(null);
  };
  const rows = (nodes: LayerNode<Item>[], tree: LayerNode<Item>[], depth = 0): React.ReactNode[] =>
    nodes.flatMap((n) => {
      const key = layerKey(n);
      const dropClass = drop?.key === key ? ` drop-${drop.where}` : "";
      const dnd = {
        draggable: true,
        onDragStart: (e: React.DragEvent) => (setDrag(key), (e.dataTransfer.effectAllowed = "move")),
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          setDrop({ key, where: n.kind === "group" && y > 0.3 && y < 0.7 ? "inside" : y < 0.5 ? "before" : "after" });
        },
        onDrop: (e: React.DragEvent) => (e.preventDefault(), commitDrop(tree)),
        onDragEnd: () => (setDrag(null), setDrop(null)),
      };
      if (n.kind === "group") {
        const isOpen = open[n.path] ?? true;
        return [
          <div key={key} className={`layer-row${dropClass}`} style={{ paddingLeft: 6 + depth * 14 }} {...dnd}>
            <button type="button" className="layer-twisty" aria-label={isOpen ? tr("Replier", "Collapse") : tr("Déplier", "Expand")} aria-expanded={isOpen} onClick={() => setOpen({ ...open, [n.path]: !isOpen })}>
              <Icon name={isOpen ? "chevronDown" : "next"} size={12} />
            </button>
            <span className="layer-icon"><Icon name="group" size={14} /></span>
            <span className="layer-label"><span className="layer-name">{n.path.split("/").pop()}</span><span className="layer-sub">{tr("groupe", "group")}</span></span>
          </div>,
          ...(isOpen ? rows(n.children, tree, depth + 1) : []),
        ];
      }
      const { id, d } = n.el;
      const sel = selection.includes(id);
      return [
        <div key={key} className={`layer-row${sel ? " is-selected" : ""}${d.hidden ? " is-hidden" : ""}${dropClass}`} style={{ paddingLeft: 22 + depth * 14 }} tabIndex={0} role="option" aria-selected={sel} data-testid={`layer-${id}`} {...dnd}
          onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? studio.set({ selection: sel ? selection.filter((x) => x !== id) : [...selection, id] }) : selectObject(id))}
          onDoubleClick={() => setRenaming(id)}
          onContextMenu={(e) => (e.preventDefault(), sel || selectObject(id), studio.set({ contextMenu: { x: e.clientX, y: e.clientY, target: { kind: "object" } } }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") selectObject(id);
            else if (e.altKey && e.key === "ArrowUp") (e.preventDefault(), reorder(id, "forward"));
            else if (e.altKey && e.key === "ArrowDown") (e.preventDefault(), reorder(id, "backward"));
            else if (e.key === "F2") setRenaming(id);
          }}>
          <span className="layer-icon"><Icon name={LAYER_ICON(d)} size={14} /></span>
          {renaming === id ? (
            <input className="layer-rename" autoFocus defaultValue={d.name ?? id} aria-label={tr("Nom du calque", "Layer name")} onClick={(e) => e.stopPropagation()} onBlur={(e) => (setRenaming(null), updateObjects({ [id]: { name: e.target.value && e.target.value !== id ? e.target.value : undefined } }))} onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && (e.target as HTMLInputElement).blur()} />
          ) : (
            <span className="layer-label"><span className="layer-name">{d.name ?? id}</span><span className="layer-sub">{TYPE_LABEL(d)} · {d.placement === "page" ? tr("fixe", "fixed") : tr("flottant", "floating")}</span></span>
          )}
          <span className="layer-tools">
            <button type="button" className={`layer-tool${d.locked?.geometry ? " is-on" : ""}`} aria-label={d.locked?.geometry ? tr("Déverrouiller", "Unlock") : tr("Verrouiller", "Lock")} onClick={(e) => (e.stopPropagation(), updateObjects({ [id]: { locked: { ...d.locked, geometry: !d.locked?.geometry || undefined } } }))}><Icon name={d.locked?.geometry ? "lock" : "unlock"} size={13} /></button>
            <button type="button" className={`layer-tool${d.hidden ? " is-on" : ""}`} aria-label={d.hidden ? tr("Afficher", "Show") : tr("Masquer", "Hide")} onClick={(e) => (e.stopPropagation(), updateObjects({ [id]: { hidden: !d.hidden || undefined } }))}><Icon name={d.hidden ? "eyeOff" : "eye"} size={13} /></button>
          </span>
        </div>,
      ];
    });
  const plane = (title: string, list: Item[]) => {
    const tree = layerTree(frontToBack(list));
    return (
      <>
        <div className="layers-bar"><span className="hint">{title}</span><span className="grow" /><span className="layers-count">{list.length}</span></div>
        <div className="layers-list" role="listbox" aria-label={title} aria-multiselectable>{list.length ? rows(tree, tree) : <p className="layers-help">{tr("Aucun objet.", "No objects.")}</p>}</div>
      </>
    );
  };
  return (
    <div className="layers">
      {plane(tr("Devant le texte", "In front of text"), planes.front)}
      <div className="layers-bar"><Icon name="paragraph" size={14} /><span className="hint">{tr("Texte du document", "Document text")}</span></div>
      {plane(tr("Derrière le texte", "Behind text"), planes.behind)}
      {inherited.length > 0 && (
        <>
          <div className="layers-bar"><span className="hint">{tr("Du masque", "From the master")}</span><span className="grow" /><span className="layers-count">{inherited.length}</span></div>
          <div className="layers-list">
            {inherited.map(([id, d]) => (
              <div key={id} className="layer-row is-hidden" style={{ paddingLeft: 22 }} title={tr("Modifiable dans le masque", "Editable in the master")}>
                <span className="layer-icon"><Icon name={d.placeholder ? "placeholder" : LAYER_ICON(d)} size={14} /></span>
                <span className="layer-label"><span className="layer-name">{d.name ?? id}</span><span className="layer-sub">{d.placeholder ? tr("espace réservé", "placeholder") : tr("masque", "master")}</span></span>
                <span className="layer-tools"><span className="layer-tool is-on"><Icon name="lock" size={13} /></span></span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="layers-help">{tr("Glisser pour réordonner · Alt+↑/↓ · F2 renommer. L’ordre des calques ne déplace jamais le texte.", "Drag to reorder · Alt+↑/↓ · F2 rename. Layer order never moves text.")}</p>
    </div>
  );
}

/* Check ------------------------------------------------------------------- */

function CheckPane() {
  const report = useStudio((s) => s.report);
  const layout = useStudio((s) => s.layout);
  const diags = useStudio((s) => s.sectionDiagnostics);
  const [fonts, setFonts] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!report) return;
    const out: Record<string, boolean> = {};
    for (const f of report.report.fonts) out[f] = fontInstalled(f);
    setFonts(out);
  }, [report]);
  const item = (i: { message: string; line?: number; objectId?: string }, k: number, level = "warning") => (
    <li key={k} className={level}>
      <Icon name="warn" />
      <span>
        {i.message}
        {i.line && <> · <button type="button" className="link" onClick={() => revealSource(i.line!)}>{tr("ligne", "line")} {i.line}</button></>}
        {i.objectId && <> · <button type="button" className="link" onClick={() => selectObject(i.objectId!)}>{tr("sélectionner", "select")}</button></>}
      </span>
    </li>
  );
  const layoutIssues = [...(layout?.overflows ?? []).map((o) => ({ message: tr(`Contenu plus haut que la page ${o.page + 1} : réduisez-le, scindez-le ou passez la section en paysage.`, `Content taller than page ${o.page + 1}: scale it, split it or use a landscape section.`) })), ...diags.map((message) => ({ message }))];
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{tr("Contrôle", "Check")}</span>
        <span className="grow" />
        <button type="button" className="btn" onClick={() => void import("./bridge").then((b) => b.runPreflight())}><Icon name="preflight" /> {tr("Vérifier", "Run check")}</button>
      </div>
      <Section title={tr("Mise en page", "Layout")}>
        <p className="hint">{layout ? tr(`${layout.pages.length} page(s) calculées par l’éditeur ; Word peut couper lignes et pages différemment.`, `${layout.pages.length} page(s) computed by the editor; Word may break lines and pages differently.`) : tr("Mode continu.", "Continuous view.")}</p>
        {layoutIssues.length ? <ul className="diag-list">{layoutIssues.map((i, k) => item(i, k))}</ul> : <p className="hint ok">{tr("Aucun problème de mise en page.", "No layout issue.")}</p>}
      </Section>
      {!report && <p className="hint insp-hint">{tr("« Vérifier » contrôle l’export Word avant livraison.", "“Run check” verifies the Word export before delivery.")}</p>}
      {report && (
        <>
          <Section title={report.kind === "preflight" ? tr("Export Word", "Word export") : `${tr("Export", "Export")}${report.target ? ` — ${report.target}` : ""}`}>
            <p className={`hint${report.report.blocked ? "" : " ok"}`}>{report.report.blocked ? tr("L’export strict refuserait ce document.", "Strict export would refuse this document.") : report.kind === "preflight" ? tr("Exportable.", "Exportable.") : tr("Écrit.", "Written.")} {tr("Mode", "Mode")} : {report.report.mode}.</p>
            <ul className="ms-native">{Object.entries(report.report.native).map(([k, n]) => <li key={k}><span>{k}</span><strong>{n}</strong></li>)}</ul>
          </Section>
          {report.report.missing.length > 0 && <Section title={tr("Manquant", "Missing")}><ul className="diag-list">{report.report.missing.map((i, k) => item(i, k, "error"))}</ul></Section>}
          {report.report.unsupported.length > 0 && <Section title={tr("Non pris en charge", "Unsupported")}><ul className="diag-list">{report.report.unsupported.map((i, k) => item(i, k))}</ul></Section>}
          {report.report.fallbacks.length > 0 && <Section title={tr("Solutions de repli", "Fallbacks")}><ul className="diag-list">{report.report.fallbacks.map((i, k) => item(i, k))}</ul></Section>}
          {report.report.fonts.length > 0 && (
            <Section title={tr("Polices", "Fonts")}>
              <ul className="diag-list">{report.report.fonts.map((f) => <li key={f} className={fonts[f] === false ? "warning" : ""}><Icon name={fonts[f] === false ? "warn" : "check"} /><span>{f}{fonts[f] === false ? ` — ${tr("absente ici, remplacée à l’affichage", "not available here, shown with a substitute")}` : ""}</span></li>)}</ul>
            </Section>
          )}
          {report.report.diagnostics.length > 0 && <Section title={tr("Diagnostics", "Diagnostics")}><ul className="diag-list">{report.report.diagnostics.map((i, k) => item(i, k))}</ul></Section>}
          <Section title={tr("Limites de fidélité", "Fidelity limits")}><ul className="diag-list">{report.report.limits.map((l, k) => <li key={k}><Icon name="info" /><span>{l}</span></li>)}</ul></Section>
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
