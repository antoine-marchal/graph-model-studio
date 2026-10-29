/**
 * Document masters browser (Slides Studio's master browser for pages): masters grouped by family,
 * each card a real miniature of its page design — background drawings, pictures, placeholders,
 * header / footer and style samples — or the reference rendering made by Word at import; a
 * detail pane with page setup, theme, placeholders, import notes and the master actions.
 */
import React, { useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { masterChain, resolveStyleSheet, type StyleSheet } from "../../document/styles";
import { chainBackground } from "../../document/masters";
import { resolvePage, type MasterDef, type ObjectDescriptor, type ResolvedPage } from "../../document/schema";
import { ptToPx } from "../../document/units";
import { shapeSvg } from "./ObjectView";
import { masterAction } from "./bridge";
import { currentSectionBreak, enterMasterEdit, setDocumentMaster, setSectionProps } from "./actions";
import { studio, useStudio, type MasterEntry } from "./store";
import { IconButton, Section, tr } from "./ui";

const lookupIn = (masters: MasterDef[]) => (id: string) => masters.find((m) => m.id === id);

/** Plain text of a story / text box (Markdown and fields reduced). */
const plain = (md?: string) =>
  (md ?? "")
    .replace(/\{\{page\}\}/g, "1").replace(/\{\{pages\}\}/g, "3").replace(/\{\{title\}\}/g, tr("Titre", "Title")).replace(/\{\{field:([\w-]+)\}\}/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]+>/g, "").replace(/[*_`#>~\\]/g, "").replace(/\s+/g, " ").trim();

function boxOf(d: ObjectDescriptor, page: ResolvedPage) {
  const dx = d.relativeTo === "margin" || d.placement !== "page" ? page.margins.left : 0;
  const dy = d.relativeTo === "margin" || d.placement !== "page" ? page.margins.top : 0;
  return { x: d.box.x + dx, y: d.box.y + dy, w: d.box.width, h: d.box.height };
}

/** Miniature page of a master, drawn at `width` px. */
export function MasterPreview({ master, width = 200, sample = true }: { master: MasterDef; width?: number; sample?: boolean }) {
  const masters = useStudio((s) => s.masters);
  const assetBases = useStudio((s) => s.assetBases);
  const { chain, page, sheet } = useMemo(() => {
    const chain = masterChain(master, lookupIn(masters)).chain;
    return { chain, page: resolvePage(...chain.map((m) => m.page)), sheet: resolveStyleSheet(chain, undefined) };
  }, [master, masters]);
  const k = width / ptToPx(page.width);
  const height = ptToPx(page.height) * k;
  const px = (pt: number) => ptToPx(pt) * k;
  // Drawings of the whole family, base first (as on the page).
  const drawings: [string, ObjectDescriptor, string | undefined][] = [];
  const own = chainBackground(chain);
  for (const m of chain) for (const [id, d] of Object.entries(m.background ?? {})) if (own[id] === d && !d.hidden) drawings.push([id, d, assetBases[m.id]]);
  const stories = chain.find((m) => m.headers?.default || m.footers?.default);
  const header = plain(stories?.headers?.default?.markdown);
  const footer = plain(stories?.footers?.default?.markdown);
  const behind = drawings.filter(([, d]) => d.plane === "behind").sort((a, b) => (a[1].z ?? 0) - (b[1].z ?? 0));
  const front = drawings.filter(([, d]) => d.plane !== "behind").sort((a, b) => (a[1].z ?? 0) - (b[1].z ?? 0));
  const draw = ([id, d, base]: [string, ObjectDescriptor, string | undefined]) => {
    const b = boxOf(d, page);
    const style: React.CSSProperties = { position: "absolute", left: px(b.x), top: px(b.y), width: Math.max(1, px(Math.abs(b.w))), height: Math.max(1, px(Math.abs(b.h))), transform: d.rotation ? `rotate(${d.rotation}deg)` : undefined };
    if (d.type === "image" && d.src) return <img key={id} src={base ? `${base}/${d.src}` : d.src} alt="" style={{ ...style, objectFit: "fill" }} draggable={false} />;
    const text = d.placeholder ? plain(d.text) || `‹${d.placeholder.replace(/^field:/, "")}›` : plain(d.text);
    return (
      <div key={id} style={style} className={d.placeholder ? "ms-mp-placeholder" : undefined}>
        {(d.type === "shape" || d.style?.fill || d.style?.line) && <span className="ms-mp-shape" ref={(el) => el?.replaceChildren(shapeSvg(d, px(Math.abs(b.w)), px(Math.abs(b.h)), sheet.theme))} />}
        {text && <span className="ms-mp-text" style={{ fontSize: Math.max(3, px(d.style?.fontSize ?? 10)), color: d.style?.color ? `#${d.style.color}` : undefined, textAlign: d.style?.align }}>{text}</span>}
      </div>
    );
  };
  return (
    <div className="ms-master-preview" style={{ width, height }} aria-hidden="true">
      {behind.map(draw)}
      {sample && <Sample sheet={sheet} page={page} px={px} />}
      {header && <span className="ms-mp-story" style={{ top: px(page.margins.header), left: px(page.margins.left), right: px(page.margins.right), fontSize: Math.max(3, px(9)) }}>{header}</span>}
      {footer && <span className="ms-mp-story" style={{ bottom: px(page.margins.footer), left: px(page.margins.left), right: px(page.margins.right), fontSize: Math.max(3, px(9)) }}>{footer}</span>}
      {front.map(draw)}
    </div>
  );
}

/** Style samples in the text area: title, heading, body lines (fonts, sizes, colors of the master). */
function Sample({ sheet, page, px }: { sheet: StyleSheet; page: ResolvedPage; px: (pt: number) => number }) {
  const css = (id: string): React.CSSProperties => {
    const s = sheet.styles.get(id)?.run ?? {};
    const color = s.color?.startsWith("theme.") ? sheet.theme.colors[s.color.slice(6) as keyof typeof sheet.theme.colors] : s.color;
    const font = s.font === "theme.heading" ? sheet.theme.fonts.heading : s.font === "theme.body" ? sheet.theme.fonts.body : s.font;
    return { fontFamily: font, fontSize: Math.max(2.5, px(s.size ?? 11)), color: color ? `#${color}` : undefined, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? "italic" : undefined, textTransform: s.caps ? "uppercase" : undefined };
  };
  return (
    <div className="ms-mp-sample" style={{ top: px(page.margins.top), left: px(page.margins.left), right: px(page.margins.right), bottom: px(page.margins.bottom) }}>
      <div style={css("Title")}>{tr("Titre du document", "Document title")}</div>
      <div style={css("Heading1")}>{tr("Titre 1", "Heading 1")}</div>
      {[0, 1, 2].map((i) => <div key={i} className="ms-mp-line" style={{ height: Math.max(1, px(3)), marginTop: px(5), width: `${92 - i * 11}%`, background: (css("Normal").color as string) ?? "#9aa0a8" }} />)}
    </div>
  );
}

function sourceLabel(e: MasterEntry, m?: MasterDef) {
  return e.source === "starter" ? tr("Intégré", "Built-in") : e.source === "docx" ? m?.provenance?.file ?? "Word" : tr("Bibliothèque", "Library");
}

export function MasterBrowser({ editor }: { editor: Editor }) {
  const entries = useStudio((s) => s.entries);
  const masters = useStudio((s) => s.masters);
  const assetBases = useStudio((s) => s.assetBases);
  const meta = useStudio((s) => s.meta);
  const sections = useStudio((s) => s.sections);
  const section = currentSectionBreak(editor);
  const active = section ? section.props.master ?? meta?.master : meta?.master;
  const [selected, setSelected] = useState<string | null>(active ?? entries[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"internal" | "reference">("internal");
  const hasRef = masters.some((m) => m.thumbnail);
  const shown = entries.filter((e) => !query || `${e.name} ${e.id} ${e.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  // Families: a master and the masters based on it; built-ins last.
  const families = new Map<string, MasterEntry[]>();
  for (const e of shown) {
    const root = e.source === "starter" ? "__starters" : e.basedOn && entries.some((x) => x.id === e.basedOn) ? e.basedOn : e.id;
    families.set(root, [...(families.get(root) ?? []), e]);
  }
  const groups = [...families.entries()].sort(([a], [b]) => Number(a === "__starters") - Number(b === "__starters"));
  const current = masters.find((m) => m.id === selected);
  const entry = entries.find((e) => e.id === selected);
  const close = () => studio.set({ mastersOpen: false });
  const apply = (id: string, where: "document" | "section") => {
    if (where === "section" && section) setSectionProps(section.pos, { ...section.props, master: id, headers: "master" });
    else setDocumentMaster(id);
  };
  const used = new Set([meta?.master, ...sections.map((s) => s.props.master)].filter(Boolean));
  return (
    <div className="masters ms-masters" data-testid="master-browser">
      <header className="toolbar">
        <div className="toolbar-group">
          <strong className="file-name">{tr("Masques du document", "Document masters")}</strong>
          <span className="hint">{entries.length} {tr("masques", "masters")} · {groups.filter(([k]) => k !== "__starters").length} {tr("familles", "families")}</span>
        </div>
        <div className="toolbar-group">
          <input className="search" placeholder={tr("Filtrer les masques…", "Filter masters…")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr("Filtrer les masques", "Filter masters")} />
          <div className="seg" role="group" aria-label={tr("Aperçu", "Preview")}>
            <button type="button" className={`ibtn has-label${view === "internal" ? " is-active" : ""}`} onClick={() => setView("internal")}>{tr("Rendu éditeur", "Editor rendering")}</button>
            <button type="button" className={`ibtn has-label${view === "reference" ? " is-active" : ""}`} disabled={!hasRef} title={hasRef ? "" : tr("Aucune vignette Word (Word indisponible lors de l’import)", "No Word thumbnails (Word unavailable during import)")} onClick={() => setView("reference")}>{tr("Référence Word", "Word reference")}</button>
          </div>
          <IconButton icon="download" label={tr("Importer un modèle Word", "Import Word template")} onClick={() => void masterAction("import")}>{tr("Modèle Word", "Word template")}</IconButton>
          <IconButton icon="folderOpen" label={tr("Importer un document Word en .paper", "Import Word document as .paper")} onClick={() => void masterAction("importDocument")}>{tr("Document Word", "Word document")}</IconButton>
          <IconButton icon="plus" label={tr("Nouveau masque", "New master")} onClick={() => void masterAction("createPrompt")} />
          <IconButton icon="close" label={tr("Fermer", "Close")} testId="close-master-browser" onClick={close} />
        </div>
      </header>
      <div className="masters-body">
        <div className="masters-grid">
          {groups.map(([root, list]) => (
            <section key={root}>
              <h2>{root === "__starters" ? tr("Masques intégrés", "Built-in masters") : entries.find((e) => e.id === root)?.name ?? root} <span className="hint">{root === "__starters" ? tr("lecture seule — dupliquer pour modifier", "read-only — duplicate to change") : sourceLabel(list[0], masters.find((m) => m.id === root))}</span></h2>
              <div className="layout-grid big">
                {list.map((e) => {
                  const m = masters.find((x) => x.id === e.id);
                  const ref = view === "reference" && m?.thumbnail && assetBases[e.id] ? `${assetBases[e.id]}/${m.thumbnail}` : null;
                  return (
                    <button key={e.id} type="button" className={`layout-card${e.id === selected ? " is-selected" : ""}`} disabled={!!e.errors} title={e.errors?.join("; ") ?? e.description ?? e.name} data-testid={`master-card-${e.id}`}
                      onClick={() => setSelected(e.id)} onDoubleClick={() => (apply(e.id, section ? "section" : "document"), close())}>
                      <div className="thumb ms-master-card-thumb">
                        {ref ? <img src={ref} alt={tr(`Rendu Word de ${e.name}`, `Word rendering of ${e.name}`)} /> : m ? <MasterPreview master={m} width={200} /> : null}
                      </div>
                      <span className="layout-name">{e.name}{used.has(e.id) ? <span className="chip ms-chip-used">{tr("utilisé", "in use")}</span> : null}</span>
                      <span className="layout-alias">{e.id}{m?.page ? ` · ${m.page.orientation === "landscape" ? tr("paysage", "landscape") : tr("portrait", "portrait")}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {!groups.length && <p className="hint">{tr("Aucun masque ne correspond.", "No master matches.")}</p>}
        </div>
        <aside className="inspector ms-master-detail">
          {current && entry ? <Detail master={current} entry={entry} section={!!section} onApply={(w) => apply(current.id, w)} onEdit={() => (close(), enterMasterEdit(current.id))} /> : <p className="hint">{tr("Sélectionnez un masque.", "Select a master.")}</p>}
        </aside>
      </div>
    </div>
  );
}

function Detail({ master, entry, section, onApply, onEdit }: { master: MasterDef; entry: MasterEntry; section: boolean; onApply: (where: "document" | "section") => void; onEdit: () => void }) {
  const masters = useStudio((s) => s.masters);
  const assetBases = useStudio((s) => s.assetBases);
  const chain = masterChain(master, lookupIn(masters)).chain;
  const page = resolvePage(...chain.map((m) => m.page));
  const sheet = resolveStyleSheet(chain, undefined);
  const objects = Object.values(master.background ?? {});
  const placeholders = objects.filter((o) => o.placeholder);
  const notes = (master.provenance?.report ?? []).filter((r) => r.status !== "supported");
  const cm = (pt: number) => `${(Math.round((pt * 2.54 * 10) / 72) / 10).toLocaleString()} cm`;
  const ro = entry.readonly;
  return (
    <>
      <div className="ms-master-detail-head">
        {master.thumbnail && assetBases[master.id] ? <img className="ms-master-ref" src={`${assetBases[master.id]}/${master.thumbnail}`} alt="" /> : <MasterPreview master={master} width={120} />}
        <div>
          <h2>{master.name}</h2>
          <p className="hint">{master.description ?? sourceLabel(entry, master)}</p>
        </div>
      </div>
      <div className="ms-master-actions">
        <IconButton icon="check" label={tr("Appliquer au document", "Apply to the document")} primary testId="master-apply" onClick={() => onApply("document")}>{tr("Appliquer au document", "Apply to document")}</IconButton>
        {section && <IconButton icon="layout" label={tr("Appliquer à la section", "Apply to the section")} onClick={() => onApply("section")}>{tr("À la section", "To section")}</IconButton>}
        <IconButton icon="masterEdit" label={tr("Modifier sur la page", "Edit on the page")} onClick={onEdit}>{tr("Modifier", "Edit")}</IconButton>
        <IconButton icon="duplicate" label={tr("Dupliquer", "Duplicate")} onClick={() => void masterAction("duplicatePrompt", { id: master.id, name: master.name })} />
        {!ro && <IconButton icon="edit" label={tr("Renommer", "Rename")} onClick={() => void masterAction("renamePrompt", { id: master.id, name: master.name })} />}
        {master.provenance?.source === "docx" && !ro && <IconButton icon="refresh" label={tr("Réimporter le modèle Word", "Reimport the Word template")} onClick={() => void masterAction("reimport", { id: master.id })} />}
        {!ro && <IconButton icon="code" label={tr("Ouvrir master.json", "Open master.json")} onClick={() => void masterAction("openSource", { id: master.id })} />}
        {!ro && <IconButton icon="trash" label={tr("Supprimer", "Delete")} onClick={() => void masterAction("deleteConfirm", { id: master.id, name: master.name })} />}
      </div>
      <Section title={tr("Page", "Page")}>
        <dl className="ms-master-facts">
          <dt>{tr("Format", "Size")}</dt><dd>{cm(page.width)} × {cm(page.height)} · {page.orientation === "landscape" ? tr("paysage", "landscape") : tr("portrait", "portrait")}</dd>
          <dt>{tr("Marges", "Margins")}</dt><dd>{[page.margins.top, page.margins.right, page.margins.bottom, page.margins.left].map(cm).join(" · ")}</dd>
          {page.columns.count > 1 && <><dt>{tr("Colonnes", "Columns")}</dt><dd>{page.columns.count}</dd></>}
          {master.basedOn && <><dt>{tr("Basé sur", "Based on")}</dt><dd>{masters.find((m) => m.id === master.basedOn)?.name ?? master.basedOn}</dd></>}
          <dt>{tr("Dessins", "Drawings")}</dt><dd>{objects.length}</dd>
        </dl>
      </Section>
      <Section title={tr("Thème", "Theme")}>
        <div className="ms-master-swatches">
          {Object.entries(sheet.theme.colors).map(([slot, hex]) => <span key={slot} className="ms-swatch" title={`${slot} #${hex}`} style={{ background: `#${hex}` }} />)}
        </div>
        <p className="hint">{sheet.theme.fonts.heading} / {sheet.theme.fonts.body} · {[...sheet.styles.values()].filter((s) => s.type === "paragraph").length} {tr("styles de paragraphe", "paragraph styles")}</p>
      </Section>
      {placeholders.length > 0 && (
        <Section title={tr("Espaces réservés", "Placeholders")}>
          <ul className="ms-master-list">{placeholders.map((o, i) => <li key={i}><code>{o.placeholder}</code> {plain(o.text)}</li>)}</ul>
        </Section>
      )}
      {notes.length > 0 && (
        <Section title={tr(`Notes d’import (${notes.length})`, `Import notes (${notes.length})`)}>
          <ul className="ms-master-list">{notes.map((n, i) => <li key={i} className={`is-${n.status}`}><strong>{n.feature}</strong> — {n.detail}</li>)}</ul>
        </Section>
      )}
    </>
  );
}
