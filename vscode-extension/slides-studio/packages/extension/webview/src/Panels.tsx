import { LayersPanel } from './LayersPanel';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutInspector, PlaceholderSection } from './LayoutDesigner';
import {
  findLayout,
  RULES,
  resolveSlide,
  round4,
  uniqueId,
  type ElementPatch,
  type ElementStyle,
  type Mutation,
  type ResolvedElement,
  type ShapeKind,
  type SlideNode,
  imageFit,
  isDiagramSrc,
  type SlideElement,
  tr,
} from '@corporate-slides/core';
import { SlideView } from '@corporate-slides/renderer';
import { Icon } from './icons';
import { post } from './host';
import { currentSlide, useEditor } from './store';
import { useAssets } from './assets';
import { EditableId, IconButton, Menu, NumField, Section, Thumb } from './ui';
import { CommentsPane, useAnchors, useDiff } from './Review';
import { MasterInspector } from './MasterEdit';
import { deleteMutations, ShapeSections, stepFontSize } from './Format';

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */


export function AddSlideMenu({ trigger }: { trigger: (open: () => void) => ReactNode }) {
  const master = useEditor((s) => s.master);
  const doc = useEditor((s) => s.doc);
  const slide = useEditor(currentSlide);
  const assets = useAssets();
  const { mutate, select } = useEditor.getState();
  const [query, setQuery] = useState('');
  if (!master || !doc) return null;
  const layouts = master.layouts
    .filter((l) => !query || `${l.name} ${l.id} ${l.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.aliases.length ? 1 : 0) - (a.aliases.length ? 1 : 0));
  // Primary master first, like Design › All layouts.
  const masters = [...master.masters].sort((a, b) => Number(b.primary) - Number(a.primary));
  return (
    <Menu
      testId="layout-menu"
      trigger={trigger}
    >
      {(close) => (
        <div className="layout-picker">
          <input className="search" placeholder={tr("Rechercher une disposition…", "Search layouts…")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label={tr("Rechercher une disposition", "Search layouts")} />
          {masters.map((m) => {
            const group = layouts.filter((l) => l.masterId === m.id);
            return group.length ? (
          <section key={m.id}>
          <h4 className="layout-group">{m.name}{m.primary ? ` · ${tr('principal', 'primary')}` : ''} <span className="hint">({group.length})</span></h4>
          <div className="layout-grid">
            {group.map((l) => (
              <button
                key={l.id}
                className="layout-card"
                data-testid={`layout-${l.id}`}
                title={`${l.name} (${l.id})`}
                onClick={() => {
                  close();
                  const id = uniqueId('slide', doc.slides.map((s) => s.id));
                  const hasTitle = l.placeholders.some((p) => p.type === 'title');
                  mutate([{ kind: 'addSlide', slideId: id, layout: l.aliases[0] ?? l.id, afterSlideId: slide?.id, ...(hasTitle ? { title: tr('Titre', 'Title') } : {}) }]);
                  select(id, []);
                }}
              >
                <Thumb width={132}>
                  <SlideView slide={{ id: 'p', layout: l.id, elements: [] }} master={master} assets={assets} showPlaceholders />
                </Thumb>
                <span className="layout-name">{l.name}</span>
                {l.aliases.length > 0 && <span className="layout-alias">{l.aliases.join(' · ')}</span>}
              </button>
            ))}
          </div>
          </section>
            ) : null;
          })}
        </div>
      )}
    </Menu>
  );
}


/* ------------------------------------------------------------------ */
/* Navigator                                                           */
/* ------------------------------------------------------------------ */

export function Navigator() {
  const doc = useEditor((s) => s.doc);
  const master = useEditor((s) => s.master);
  const slideId = useEditor((s) => s.slideId);
  const ghostSlideId = useEditor((s) => s.ghostSlideId);
  const diagnostics = useEditor((s) => s.diagnostics);
  const showWarnings = useEditor((s) => s.showWarnings);
  const readOnly = useEditor((s) => s.readOnly);
  const showDiff = useEditor((s) => s.showDiff);
  const assets = useAssets();
  const diff = useDiff();
  const anchors = useAnchors();
  const { select, mutate, set } = useEditor.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const design = useEditor((s) => s.design);
  // Per-slide warning badges and open threads, indexed once instead of filtered for every slide.
  const issuesBySlide = useMemo(() => groupBy(diagnostics, (d) => d.slideId), [diagnostics]);
  const threadsBySlide = useMemo(() => groupBy(anchors.filter((a) => !a.thread.resolved), (a) => a.slideId), [anchors]);
  if (!doc || !master) return <nav className="navigator" />;
  if (design) return <LayoutNavigator />;
  const ghostsAfter = (after: string | null) => (showDiff ? (diff?.removedSlides ?? []).filter((r) => r.after === after) : []);

  const ghost = (g: { slide: SlideNode }) => (
    <li key={`ghost-${g.slide.id}`} className={`slide-item is-ghost${ghostSlideId === g.slide.id ? ' is-current' : ''}`} data-testid={`slide-ghost-${g.slide.id}`}>
      <button className="slide-button" onClick={() => set({ ghostSlideId: g.slide.id, showBase: false })} aria-label={tr(`Diapositive supprimée ${g.slide.id}`, `Deleted slide ${g.slide.id}`)}>
        <span className="slide-num"><Icon name="trash" size={12} /></span>
        <Thumb width={150}>
          <SlideView slide={g.slide} master={master} assets={assets} metadata={doc.metadata} />
        </Thumb>
      </button>
      <div className="slide-meta">
        <span className="diff-chip diff-del">{tr('Supprimée', 'Deleted')}</span>
        <span className="slide-layout">{g.slide.id}</span>
      </div>
    </li>
  );

  return (
    <nav className="navigator" aria-label={tr("Diapositives", "Slides")}>
      <ol className="slide-list" onDragLeave={() => setDropIndex(null)}>
        {ghostsAfter(null).map(ghost)}
        {doc.slides.map((s, i) => {
          const layout = findLayout(master, s.layout);
          const issues = issuesBySlide.get(s.id) ?? [];
          const errors = issues.filter((d) => d.severity === 'error').length;
          const change = showDiff ? diff?.slides.get(s.id) : undefined;
          const threads = threadsBySlide.get(s.id)?.length ?? 0;
          return [
            <li
              key={s.id}
              className={`slide-item${s.id === slideId && !ghostSlideId ? ' is-current' : ''}${dropIndex === i ? ' drop-before' : ''}${dropIndex === i + 1 && i === doc.slides.length - 1 ? ' drop-after' : ''}`}
              draggable={!readOnly}
              data-testid={`slide-thumb-${s.id}`}
              onDragStart={(e) => {
                setDragId(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropIndex(e.clientY > rect.top + rect.height / 2 ? i + 1 : i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dropIndex !== null) {
                  const from = doc.slides.findIndex((x) => x.id === dragId);
                  const to = dropIndex > from ? dropIndex - 1 : dropIndex;
                  if (to !== from) mutate([{ kind: 'moveSlide', slideId: dragId, toIndex: to }]);
                }
                setDragId(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropIndex(null);
              }}
            >
              <button
                className="slide-button"
                onClick={() => select(s.id, [])}
                onContextMenu={(e) => {
                  e.preventDefault();
                  select(s.id, []);
                  useEditor.getState().set({ contextMenu: { x: e.clientX, y: e.clientY, target: 'slide' } });
                }}
                aria-current={s.id === slideId}
                aria-label={`${tr('Diapositive', 'Slide')} ${i + 1}`}
              >
                <span className="slide-num">{i + 1}</span>
                <Thumb width={150}>
                  <SlideView slide={s} master={master} assets={assets} metadata={doc.metadata} slideNumber={i + 1} />
                </Thumb>
                {threads > 0 && <span className="comment-chip" title={`${threads} discussion(s) ouverte(s)`}><Icon name="comment" size={12} />{threads}</span>}
              </button>
              <div className="slide-meta">
                {change && <span className={`diff-chip diff-${change === 'added' ? 'add' : 'mod'}`} data-testid={`diff-chip-${s.id}`}>{change === 'added' ? tr('Ajoutée', 'Added') : tr('Modifiée', 'Changed')}</span>}
                <span className="slide-layout" title={layout?.name ?? s.layout}>{layout?.name ?? `⚠ ${s.layout}`}</span>
                {(showWarnings ? issues.length : errors) > 0 && (
                  <span className={`badge ${errors ? 'badge-error' : 'badge-warn'}`} title={issues.filter((d) => showWarnings || d.severity === 'error').map((d) => d.message).join('\n')}>
                    {showWarnings ? issues.length : errors}
                  </span>
                )}
              </div>
              {!readOnly && (
                <div className="slide-actions">
                  <IconButton icon="copy" label={tr("Dupliquer la diapositive", "Duplicate slide")} onClick={() => mutate([{ kind: 'duplicateSlide', slideId: s.id, newSlideId: uniqueId(s.id.replace(/-\d+$/, '') || 'slide', doc.slides.map((x) => x.id)) }])} />
                  <IconButton icon="trash" label={tr("Supprimer la diapositive", "Delete slide")} disabled={doc.slides.length <= 1} onClick={() => mutate([{ kind: 'deleteSlide', slideId: s.id }])} />
                </div>
              )}
            </li>,
            ...ghostsAfter(s.id).map(ghost),
          ];
        })}
      </ol>
    </nav>
  );
}

function groupBy<T, K>(items: T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of items) {
    const k = key(x);
    const list = out.get(k);
    if (list) list.push(x);
    else out.set(k, [x]);
  }
  return out;
}

/**
 * Layout designer: the layouts of the designed layout's master, in template order. The designed one
 * shows its live edit; clicking another one designs it (each edit is already saved).
 */
function LayoutNavigator() {
  const design = useEditor((s) => s.design)!;
  const doc = useEditor((s) => s.doc);
  const master = useEditor((s) => s.master);
  const assets = useAssets();
  const real = design.real.master;
  const layouts = real.layouts.filter((l) => l.masterId === design.base.masterId);
  const readOnly = useEditor((s) => s.readOnly);
  const remove = (id: string) => {
    // The designer moves to a neighbour first: the deleted layout must not stay on the canvas.
    if (id === design.layoutId) {
      const i = layouts.findIndex((l) => l.id === id);
      const next = layouts[i + 1] ?? layouts[i - 1];
      if (next) useEditor.getState().enterDesign(next.id);
      else useEditor.getState().exitDesign();
    }
    post({ type: 'deleteLayout', layoutId: id });
  };
  return (
    <nav className="navigator" aria-label={tr('Dispositions du masque', 'Layouts of the master')}>
      <ol className="slide-list">
        {layouts.map((l, i) => {
          const current = l.id === design.layoutId;
          const slide = current && doc ? doc.slides[0]! : { id: `layout-${l.id}`, layout: l.id, elements: [] };
          return (
            <li key={l.id} className={`slide-item${current ? ' is-current' : ''}`} data-testid={`layout-thumb-${l.id}`}>
              <button className="slide-button" onClick={() => !current && useEditor.getState().enterDesign(l.id)} aria-current={current} aria-label={`${tr('Disposition', 'Layout')} ${l.name}`}>
                <span className="slide-num">{i + 1}</span>
                <Thumb width={150}>
                  <SlideView slide={slide} master={current && master ? master : real} assets={assets} showPlaceholders={!current} designPlaceholders={current} />
                </Thumb>
              </button>
              <div className="slide-meta">
                <span className="slide-layout" title={l.id}>{l.name}</span>
              </div>
              {!readOnly && (
                <div className="slide-actions">
                  <IconButton icon="copy" label={tr('Dupliquer la disposition', 'Duplicate layout')} testId={`layout-duplicate-${l.id}`} onClick={() => post({ type: 'duplicateLayout', layoutId: l.id })} />
                  <IconButton icon="trash" label={tr('Supprimer la disposition', 'Delete layout')} testId={`layout-remove-${l.id}`} disabled={layouts.length <= 1} onClick={() => remove(l.id)} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Speaker notes under the canvas, as in PowerPoint's Normal view. */
export function NotesPane() {
  const slide = useEditor(currentSlide);
  const readOnly = useEditor((s) => s.readOnly);
  const ghost = useEditor((s) => s.ghostSlideId);
  const { mutate } = useEditor.getState();
  const [notes, setNotes] = useState(slide?.notes ?? '');
  useEffect(() => setNotes(slide?.notes ?? ''), [slide?.id, slide?.notes]);
  if (!slide || ghost) return null;
  return (
    <div className="notes-pane">
      <textarea
        className="notes-input"
        value={notes}
        readOnly={readOnly}
        aria-label={tr("Notes de l'orateur", "Speaker notes")}
        data-testid="notes"
        placeholder={tr("Cliquez pour ajouter des notes", "Click to add notes")}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={() => notes !== (slide.notes ?? '') && mutate([{ kind: 'setNotes', slideId: slide.id, notes }])}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

function ElementInspector({ r }: { r: ResolvedElement }) {
  const slide = useEditor(currentSlide)!;
  const master = useEditor((s) => s.master)!;
  const { mutate } = useEditor.getState();
  const el = r.element;
  const layout = findLayout(master, slide.layout);
  const upd = (patch: ElementPatch) => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch }]);
  const rename = (newId: string) => {
    if (slide.elements.some((e) => e.id === newId)) return useEditor.getState().notify('error', tr(`Identifiant « ${newId} » déjà utilisé`, `Identifier “${newId}” already used`));
    // Connectors attached to the element follow it.
    const refs: Mutation[] = slide.elements.flatMap((e) =>
      e.type === 'connector' && (e.from === el.id || e.to === el.id)
        ? [{ kind: 'updateElement' as const, slideId: slide.id, elementId: e.id, patch: { ...(e.from === el.id ? { from: newId } : {}), ...(e.to === el.id ? { to: newId } : {}) } }]
        : [],
    );
    // Layout designer: a placeholder named after its key keeps the two in step.
    if (useEditor.getState().design && el.placeholder === el.id) refs.push({ kind: 'updateElement', slideId: slide.id, elementId: newId, patch: { placeholder: newId } });
    mutate([{ kind: 'renameElement', slideId: slide.id, elementId: el.id, newId }, ...refs]);
    useEditor.getState().select(slide.id, [newId]);
  };
  const geom = (k: 'x' | 'y' | 'w' | 'h', v: number) => upd({ x: r.box.x, y: r.box.y, w: r.box.w, h: r.box.h, [k]: v });
  const TYPE_LABEL: Record<string, string> = { text: tr('Texte', 'Text'), shape: tr('Forme', 'Shape'), image: el.type === 'image' && isDiagramSrc(el.src) ? tr('Diagramme GMC', 'GMC diagram') : 'Image', table: tr('Tableau', 'Table'), connector: tr('Connecteur', 'Connector') };
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{TYPE_LABEL[el.type]}</span>
        <EditableId value={el.id} title={tr('Identifiant stable', 'Stable identifier')} testId="element-id" onRename={rename} />
        <span className="grow" />
        <IconButton icon={el.locked ? 'lock' : 'unlock'} label={el.locked ? tr('Déverrouiller', 'Unlock') : tr('Verrouiller', 'Lock')} active={el.locked} onClick={() => upd({ locked: !el.locked })} />
        <IconButton icon={el.hidden ? 'eyeOff' : 'eye'} label={el.hidden ? tr('Afficher', 'Show') : tr('Masquer', 'Hide')} active={el.hidden} onClick={() => upd({ hidden: !el.hidden })} />
      </div>
      <PlaceholderSection el={el} />

      {el.type === 'image' && isDiagramSrc(el.src) && (
        <Section title="Graph Model Studio">
          <p className="hint"><code>{el.src}</code> → <code>{el.src.replace(/\.gmc$/i, '.png')}</code> · {tr('onglet Diagramme pour le modifier', 'Diagram tab to edit it')}</p>
        </Section>
      )}

      {el.type !== 'connector' && <Section title={tr("Position et taille", "Position and size")} aside={r.inheritedGeometry ? <span className="hint">{tr('hérité de la disposition', 'inherited from the layout')}</span> : undefined}>
        <div className="grid2">
          <NumField label="X" unit="in" value={r.box.x} onCommit={(v) => geom('x', v)} testId="field-x" disabled={el.locked} />
          <NumField label="Y" unit="in" value={r.box.y} onCommit={(v) => geom('y', v)} testId="field-y" disabled={el.locked} />
          <NumField label={tr('L', 'W')} unit="in" value={r.box.w} onCommit={(v) => geom('w', Math.max(0, v))} testId="field-w" disabled={el.locked} />
          <NumField label="H" unit="in" value={r.box.h} onCommit={(v) => geom('h', Math.max(0, v))} testId="field-h" disabled={el.locked} />
          <NumField label="Rot." unit="°" step={1} value={el.rotation ?? 0} onCommit={(v) => upd({ rotation: v })} disabled={el.locked} />
        </div>
        {el.type === 'image' && <ImageFitControls r={r} upd={upd} />}
      </Section>}

      <ShapeSections r={r} upd={upd} />

      {(el.type === 'text' || el.type === 'image' || el.type === 'table') && layout && !useEditor.getState().design && (
        <Section title={tr("Espace réservé", "Placeholder")}>
          <select
            className="select"
            aria-label={tr("Espace réservé lié", "Bound placeholder")}
            value={el.placeholder ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) upd({ placeholder: null, x: r.box.x, y: r.box.y, w: r.box.w, h: r.box.h });
              else {
                const ph = layout.placeholders.find((p) => p.key === v)!;
                upd({ placeholder: v, x: ph.x, y: ph.y, w: ph.w, h: ph.h });
              }
            }}
          >
            <option value="">{tr('Libre (non lié)', 'Free (unbound)')}</option>
            {layout.placeholders.filter((p) => (el.type === 'table') === (p.type === 'tbl')).map((p) => (
              <option key={p.key} value={p.key}>{p.key} — {p.type}</option>
            ))}
            {el.placeholder && !layout.placeholders.some((p) => p.key === el.placeholder) && <option value={el.placeholder}>{el.placeholder} (alias)</option>}
          </select>
          <p className="hint">{tr('Lier un texte à un espace réservé conserve l\'héritage de la disposition dans PowerPoint.', 'Binding a text to a placeholder keeps the layout inheritance in PowerPoint.')}</p>
        </Section>
      )}
    </>
  );
}

/** Intrinsic ratio (width / height) of a picture, read from its rendering on the canvas. */
function naturalRatio(id: string): number | null {
  const img = document.querySelector<HTMLImageElement>(`[data-testid="slide-canvas"] [data-element-id="${CSS.escape(id)}"] img`);
  return img?.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
}

/** Picture fit in its box (stretch / fit inside / fill and crop) and back to the original ratio. */
function ImageFitControls({ r, upd }: { r: ResolvedElement; upd: (p: ElementPatch) => void }) {
  const el = r.element;
  if (el.type !== 'image') return null;
  const fit = imageFit(el);
  const modes = [
    { id: 'contain', label: tr('Ajuster', 'Fit'), title: tr('Image entière dans la zone, proportions d’origine', 'Whole picture inside the box, original ratio') },
    { id: 'cover', label: tr('Remplir', 'Fill'), title: tr('Remplit la zone, proportions d’origine, bords rognés', 'Fills the box, original ratio, edges cropped') },
    { id: 'stretch', label: tr('Étirer', 'Stretch'), title: tr('Étirée aux dimensions de la zone (peut déformer)', 'Stretched to the box (may distort)') },
  ] as const;
  const restore = () => {
    const ar = naturalRatio(el.id);
    if (!ar) return;
    // Same width and center, height from the picture's own ratio; the picture then fills its box exactly.
    const h = round4(r.box.w / ar);
    upd({ x: r.box.x, y: round4(r.box.y + (r.box.h - h) / 2), w: r.box.w, h, fit: 'stretch' });
  };
  const ar = naturalRatio(el.id);
  const distorted = !!ar && fit === 'stretch' && Math.abs(r.box.w / r.box.h / ar - 1) > 0.01;
  return (
    <div className="stack fit-controls">
      <div className="seg" role="radiogroup" aria-label={tr('Ajustement de l’image', 'Picture fit')}>
        {modes.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={fit === m.id} className={`ibtn has-label${fit === m.id ? ' is-active' : ''}`} title={m.title} onClick={() => upd({ fit: m.id })} data-testid={`image-fit-${m.id}`} disabled={el.locked}>
            {m.label}
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={restore} disabled={el.locked || !ar} data-testid="image-restore-ratio" title={tr('Hauteur recalculée depuis la largeur et les proportions de l’image', 'Height recomputed from the width and the picture ratio')}>
        <Icon name="fit" /> {tr('Proportions d’origine', 'Original ratio')}{distorted ? ` · ${tr('déformée', 'distorted')} ${Math.round(Math.abs(r.box.w / r.box.h / ar! - 1) * 100)} %` : ''}
      </button>
    </div>
  );
}

function SlideInspector() {
  const slide = useEditor(currentSlide);
  const master = useEditor((s) => s.master);
  const diagnostics = useEditor((s) => s.diagnostics);
  const { mutate } = useEditor.getState();
  if (!slide || !master) return null;
  const layout = findLayout(master, slide.layout);
  const showWarnings = useEditor((s) => s.showWarnings);
  const issues = diagnostics.filter((d) => d.slideId === slide.id && (showWarnings || d.severity === 'error'));
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{tr('Diapositive', 'Slide')}</span>
        <code className="insp-id">{slide.id}</code>
      </div>
      <Section title={tr("Disposition corporate", "Corporate layout")}>
        <select className="select" aria-label={tr("Disposition", "Layout")} data-testid="slide-layout" value={layout?.id ?? slide.layout} onChange={(e) => {
          const l = master.layouts.find((x) => x.id === e.target.value)!;
          mutate([{ kind: 'setSlideLayout', slideId: slide.id, layout: l.aliases[0] ?? l.id }]);
        }}>
          {!layout && <option value={slide.layout}>⚠ {slide.layout} (inconnue)</option>}
          {master.masters.map((m) => (
            <optgroup key={m.id} label={`${m.name}${m.primary ? ' (principal)' : ''}`}>
              {master.layouts.filter((l) => l.masterId === m.id).map((l) => (
                <option key={l.id} value={l.id}>{l.name}{l.aliases.length ? ` — ${l.aliases.join(', ')}` : ''}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {layout && (
          <ul className="ph-list">
            {layout.placeholders.map((p) => (
              <li key={p.key}><code>{p.key}</code> <span className="hint">{p.type} · {p.w.toFixed(2)} × {p.h.toFixed(2)} in</span></li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={tr("Conformité", "Compliance")}>
        {issues.length === 0 ? <p className="hint ok">{tr('Aucun problème détecté sur cette diapositive.', 'No issue found on this slide.')}</p> : (
          <ul className="diag-list">
            {issues.map((d, i) => (
              <li key={i} className={d.severity}>
                <Icon name="warn" />
                <span><strong>{RULES[d.rule]?.label ?? d.rule}</strong> — {d.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

export function Inspector() {
  const slide = useEditor(currentSlide);
  const master = useEditor((s) => s.master);
  const selected = useEditor((s) => s.selected);
  const pane = useEditor((s) => s.pane);
  const masterEdit = useEditor((s) => s.masterEdit);
  const design = useEditor((s) => !!s.design);
  if (pane === 'comments') return <CommentsPane />;
  if (!slide || !master) return <aside className="inspector" />;
  if (masterEdit && !design) return <aside className="inspector" aria-label={tr('Masque', 'Master')}><MasterInspector /></aside>;
  const rs = resolveSlide(slide, master);
  const sel = rs.elements.filter((r) => selected.includes(r.element.id));
  const tabs = (
    <div className="insp-tabs" role="tablist" aria-label={tr('Panneau', 'Panel')}>
      {(['format', 'layers'] as const).map((t) => (
        <button key={t} type="button" role="tab" aria-selected={pane === t} className={`insp-tab${pane === t ? ' is-active' : ''}`} onClick={() => useEditor.getState().set({ pane: t })} data-testid={`pane-${t}`}>
          <Icon name={t === 'format' ? 'brush' : 'layers'} size={14} /> {t === 'format' ? tr('Format', 'Format') : tr('Calques', 'Layers')}
        </button>
      ))}
    </div>
  );
  if (pane === 'layers')
    return (
      <aside className="inspector" aria-label={tr('Calques', 'Layers')}>
        {tabs}
        <LayersPanel />
      </aside>
    );
  return (
    <aside className="inspector" aria-label="Format">
      {tabs}
      {sel.length === 1 ? <ElementInspector r={sel[0]!} /> : sel.length > 1 ? <MultiInspector rs={sel} /> : design ? <LayoutInspector /> : <SlideInspector />}
    </aside>
  );
}

function MultiInspector({ rs }: { rs: ResolvedElement[] }) {
  const slide = useEditor(currentSlide)!;
  const { mutate } = useEditor.getState();
  return (
    <>
      <div className="insp-head"><span className="insp-kind">{rs.length} {tr('éléments', 'elements')}</span></div>
      <p className="hint insp-hint">{tr('Aligner, répartir et ordonner : Accueil › Organiser, ou clic droit sur la sélection.', 'Align, distribute and order: Home › Arrange, or right-click the selection.')}</p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Status bar                                                          */
/* ------------------------------------------------------------------ */

export function StatusBar() {
  const diagnostics = useEditor((s) => s.diagnostics);
  const parseErrors = useEditor((s) => s.parseErrors);
  const sourceKind = useEditor((s) => s.sourceKind);
  const pending = useEditor((s) => s.pending.size);
  const doc = useEditor((s) => s.doc);
  const slideId = useEditor((s) => s.slideId);
  const notesOpen = useEditor((s) => s.notesOpen);
  const pane = useEditor((s) => s.pane);
  const showWarnings = useEditor((s) => s.showWarnings);
  const zoom = useEditor((s) => s.zoom);
  const fitZoom = useEditor((s) => s.fitZoom);
  const { set, setZoom } = useEditor.getState();
  const anchors = useAnchors();
  const errors = diagnostics.filter((d) => d.severity === 'error').length + parseErrors.length;
  const warnings = diagnostics.length - diagnostics.filter((d) => d.severity === 'error').length;
  const index = doc?.slides.findIndex((s) => s.id === slideId) ?? -1;
  const z = zoom === 'fit' ? fitZoom : zoom;
  const open = anchors.filter((a) => !a.thread.resolved).length;
  return (
    <footer className="statusbar">
      <span className="status-item">{doc ? tr(`Diapositive ${index + 1} sur ${doc.slides.length}`, `Slide ${index + 1} of ${doc.slides.length}`) : ''}</span>
      <span className="status-item">{sourceKind === 'markdown' ? 'Markdown + YAML' : 'DSL YAML'}</span>
      <span className={`status-item sync${pending ? ' is-pending' : ''}`}>
        <span className="sync-dot" aria-hidden />
        <span data-testid="sync-state">{pending ? tr('Synchronisation…', 'Syncing…') : tr('Synchronisé avec la source', 'Synced with the source')}</span>
      </span>
      <button
        type="button"
        className={`status-btn diag-count${errors ? ' has-errors' : warnings ? ' has-warnings' : ' is-clean'}`}
        data-testid="diag-count"
        title={errors || warnings ? [...parseErrors, ...diagnostics.map((d) => d.message)].join('\n') : tr('Charte respectée — cliquer pour revalider', 'Brand rules met — click to validate again')}
        onClick={() => post({ type: 'validate' })}
      >
        <Icon name={errors || warnings ? 'warn' : 'check'} size={13} />
        {errors || warnings ? (
          <>
            {errors} {errors > 1 ? tr('erreurs', 'errors') : tr('erreur', 'error')} · {warnings} {warnings > 1 ? tr('avertissements', 'warnings') : tr('avertissement', 'warning')}
          </>
        ) : (
          tr('Charte respectée', 'Brand rules met')
        )}
      </button>
      <button type="button" className={`status-btn${showWarnings ? '' : ' is-active'}`} aria-pressed={!showWarnings} data-testid="toggle-warnings" title={showWarnings ? tr('Masquer les avertissements (badges, débordements, conformité)', 'Hide warnings (badges, overflows, compliance)') : tr('Afficher les avertissements', 'Show warnings')} onClick={() => set({ showWarnings: !showWarnings })}>
        <Icon name={showWarnings ? 'eye' : 'eyeOff'} size={14} /> {showWarnings ? tr('Avertissements', 'Warnings') : tr('Avertissements masqués', 'Warnings hidden')}
      </button>
      <span className="grow" />
      <button type="button" className={`status-btn${notesOpen ? ' is-active' : ''}`} aria-pressed={notesOpen} onClick={() => set({ notesOpen: !notesOpen })}><Icon name="notes" size={14} /> Notes</button>
      <button type="button" className={`status-btn${pane === 'comments' ? ' is-active' : ''}`} aria-pressed={pane === 'comments'} onClick={() => set({ pane: pane === 'comments' ? 'format' : 'comments' })}><Icon name="comment" size={14} /> {tr('Commentaires', 'Comments')}{open ? ` (${open})` : ''}</button>
      <span className="sep" />
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" className="status-btn" aria-label={tr("Zoom arrière", "Zoom out")} onClick={() => setZoom(Math.max(0.1, round4(z / 1.2)))}><Icon name="zoomOut" size={14} /></button>
        <input type="range" min={10} max={400} step={1} value={Math.round(z * 100)} aria-label={tr("Niveau de zoom", "Zoom level")} onChange={(e) => setZoom(Number(e.target.value) / 100)} />
        <button type="button" className="status-btn" aria-label={tr("Zoom avant", "Zoom in")} onClick={() => setZoom(Math.min(4, round4(z * 1.2)))}><Icon name="zoomIn" size={14} /></button>
        <span className="zoom-value" data-testid="zoom-value">{Math.round(z * 100)} %</span>
        <button type="button" className={`status-btn${zoom === 'fit' ? ' is-active' : ''}`} aria-label={tr("Ajuster la diapositive à la fenêtre", "Fit slide to window")} title={tr("Ajuster la diapositive à la fenêtre", "Fit slide to window")} onClick={() => setZoom('fit')}><Icon name="fit" size={14} /></button>
      </div>
    </footer>
  );
}
