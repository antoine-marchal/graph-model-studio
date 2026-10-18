import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  findLayout,
  paletteTokens,
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
  isDiagramSrc,
  type SlideElement,
} from '@corporate-slides/core';
import { PPI, SlideView } from '@corporate-slides/renderer';
import { Icon, type IconName } from './icons';
import { post } from './host';
import { currentSlide, useEditor } from './store';
import { useAssets } from './Canvas';
import { CommentsPane, useAnchors, useDiff } from './Review';
import { deleteMutations, ShapeSections, stepFontSize } from './Format';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export function IconButton({ icon, label, onClick, active, disabled, primary, children, testId }: { icon: IconName; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; primary?: boolean; children?: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      className={`ibtn${active ? ' is-active' : ''}${primary ? ' is-primary' : ''}${children ? ' has-label' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

/**
 * Popup menu rendered in a body portal with fixed positioning, so scrolling/clipping containers
 * (the ribbon scrolls horizontally) never cut it. Flips to right-aligned when it would overflow.
 */
export function Menu({ trigger, children, testId }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => ref.current?.contains(t as Node) || menu.current?.contains(t as Node);
    const h = (e: PointerEvent) => !inside(e.target) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const s = (e: Event) => !inside(e.target) && setOpen(false);
    const r = () => setOpen(false);
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    window.addEventListener('scroll', s, true);
    window.addEventListener('resize', r);
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', k);
      window.removeEventListener('scroll', s, true);
      window.removeEventListener('resize', r);
    };
  }, [open]);
  useLayoutEffect(() => {
    const a = ref.current?.getBoundingClientRect(), m = menu.current;
    if (!open || !a || !m) return;
    const top = a.bottom + 6;
    m.style.top = `${top}px`;
    m.style.maxHeight = `${window.innerHeight - top - 8}px`;
    m.style.left = `${Math.max(8, a.left + m.offsetWidth > window.innerWidth - 8 ? a.right - m.offsetWidth : a.left)}px`;
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open &&
        createPortal(
          <div className="menu" role="menu" data-testid={testId} ref={menu}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Numeric field that commits on Enter/blur and accepts arrow-key stepping. */
export function NumField({ label, value, onCommit, step = 0.05, unit, testId, disabled }: { label: string; value: number | undefined; onCommit: (v: number) => void; step?: number; unit?: string; testId?: string; disabled?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(round4(value)));
  useEffect(() => setText(value === undefined ? '' : String(round4(value))), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setText(value === undefined ? '' : String(round4(value)));
  };
  return (
    <label className="numfield">
      <span className="numfield-label">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = (Number(text) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
            onCommit(round4(v));
          }
        }}
      />
      {unit && <span className="numfield-unit">{unit}</span>}
    </label>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="insp-section">
      <header>
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

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
  const primary = master.masters.find((m) => m.primary)?.id;
  const layouts = master.layouts
    .filter((l) => !query || `${l.name} ${l.id} ${l.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.aliases.length ? 1 : 0) - (a.aliases.length ? 1 : 0) || (a.masterId === primary ? -1 : 1) - (b.masterId === primary ? -1 : 1));
  return (
    <Menu
      testId="layout-menu"
      trigger={trigger}
    >
      {(close) => (
        <div className="layout-picker">
          <input className="search" placeholder="Rechercher une disposition…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Rechercher une disposition" />
          <div className="layout-grid">
            {layouts.map((l) => (
              <button
                key={l.id}
                className="layout-card"
                data-testid={`layout-${l.id}`}
                title={`${l.name} (${l.id})`}
                onClick={() => {
                  close();
                  const id = uniqueId('slide', doc.slides.map((s) => s.id));
                  const hasTitle = l.placeholders.some((p) => p.type === 'title');
                  mutate([{ kind: 'addSlide', slideId: id, layout: l.aliases[0] ?? l.id, afterSlideId: slide?.id, ...(hasTitle ? { title: 'Titre' } : {}) }]);
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
        </div>
      )}
    </Menu>
  );
}

/** Scales a full-size slide render into a fixed-width thumbnail. */
export function Thumb({ width, children }: { width: number; children: ReactNode }) {
  const master = useEditor((s) => s.master);
  const W = (master?.dimensions.width ?? 13.33) * PPI;
  const H = (master?.dimensions.height ?? 7.5) * PPI;
  const k = width / W;
  return (
    <div className="thumb" style={{ width, height: H * k }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: '0 0', width: W, height: H, pointerEvents: 'none' }}>{children}</div>
    </div>
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
  const readOnly = useEditor((s) => s.readOnly);
  const showDiff = useEditor((s) => s.showDiff);
  const assets = useAssets();
  const diff = useDiff();
  const anchors = useAnchors();
  const { select, mutate, set } = useEditor.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  if (!doc || !master) return <nav className="navigator" />;
  const ghostsAfter = (after: string | null) => (showDiff ? (diff?.removedSlides ?? []).filter((r) => r.after === after) : []);

  const ghost = (g: { slide: SlideNode }) => (
    <li key={`ghost-${g.slide.id}`} className={`slide-item is-ghost${ghostSlideId === g.slide.id ? ' is-current' : ''}`} data-testid={`slide-ghost-${g.slide.id}`}>
      <button className="slide-button" onClick={() => set({ ghostSlideId: g.slide.id, showBase: false })} aria-label={`Diapositive supprimée ${g.slide.id}`}>
        <span className="slide-num"><Icon name="trash" size={12} /></span>
        <Thumb width={150}>
          <SlideView slide={g.slide} master={master} assets={assets} metadata={doc.metadata} />
        </Thumb>
      </button>
      <div className="slide-meta">
        <span className="diff-chip diff-del">Supprimée</span>
        <span className="slide-layout">{g.slide.id}</span>
      </div>
    </li>
  );

  return (
    <nav className="navigator" aria-label="Diapositives">
      <ol className="slide-list" onDragLeave={() => setDropIndex(null)}>
        {ghostsAfter(null).map(ghost)}
        {doc.slides.map((s, i) => {
          const layout = findLayout(master, s.layout);
          const issues = diagnostics.filter((d) => d.slideId === s.id);
          const errors = issues.filter((d) => d.severity === 'error').length;
          const change = showDiff ? diff?.slides.get(s.id) : undefined;
          const threads = anchors.filter((a) => a.slideId === s.id && !a.thread.resolved).length;
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
              <button className="slide-button" onClick={() => select(s.id, [])} aria-current={s.id === slideId} aria-label={`Diapositive ${i + 1}`}>
                <span className="slide-num">{i + 1}</span>
                <Thumb width={150}>
                  <SlideView slide={s} master={master} assets={assets} metadata={doc.metadata} slideNumber={i + 1} />
                </Thumb>
                {threads > 0 && <span className="comment-chip" title={`${threads} discussion(s) ouverte(s)`}><Icon name="comment" size={12} />{threads}</span>}
              </button>
              <div className="slide-meta">
                {change && <span className={`diff-chip diff-${change === 'added' ? 'add' : 'mod'}`} data-testid={`diff-chip-${s.id}`}>{change === 'added' ? 'Ajoutée' : 'Modifiée'}</span>}
                <span className="slide-layout" title={layout?.name ?? s.layout}>{layout?.name ?? `⚠ ${s.layout}`}</span>
                {issues.length > 0 && (
                  <span className={`badge ${errors ? 'badge-error' : 'badge-warn'}`} title={issues.map((d) => d.message).join('\n')}>
                    {issues.length}
                  </span>
                )}
              </div>
              {!readOnly && (
                <div className="slide-actions">
                  <IconButton icon="copy" label="Dupliquer la diapositive" onClick={() => mutate([{ kind: 'duplicateSlide', slideId: s.id, newSlideId: uniqueId(s.id.replace(/-\d+$/, '') || 'slide', doc.slides.map((x) => x.id)) }])} />
                  <IconButton icon="trash" label="Supprimer la diapositive" disabled={doc.slides.length <= 1} onClick={() => mutate([{ kind: 'deleteSlide', slideId: s.id }])} />
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
        aria-label="Notes de l'orateur"
        data-testid="notes"
        placeholder="Cliquez pour ajouter des notes"
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

function ColorPicker({ label, value, onChange, allowNone, testId }: { label: string; value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  const master = useEditor((s) => s.master)!;
  const tokens = paletteTokens(master);
  const base = tokens.filter((t) => t.token.split('.').length === 2);
  const current = value ? tokens.find((t) => t.token === value) : undefined;
  const hexValue = current?.hex ?? (value && !value.startsWith('theme.') && value !== 'none' ? value.replace('#', '') : undefined);
  return (
    <Menu
      testId={testId ? `${testId}-menu` : undefined}
      trigger={(open) => (
        <button type="button" className="color-field" onClick={open} data-testid={testId} aria-label={`${label} : ${value ?? 'par défaut'}`}>
          <span className="swatch" style={{ background: value === 'none' ? 'transparent' : hexValue ? `#${hexValue}` : 'transparent' }} data-none={value === 'none' || !hexValue} />
          <span className="color-label">{label}</span>
          <span className="color-token">{value ?? 'défaut'}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="palette">
          <div className="palette-rows">
            {base.map((b) => {
              const slot = b.token.split('.')[1]!;
              const variants = tokens.filter((t) => t.token.startsWith(`theme.${slot}.`));
              return (
                <div key={b.token} className="palette-col">
                  {[b, ...variants].map((t) => (
                    <button
                      key={t.token}
                      className={`palette-chip${t.token === value ? ' is-selected' : ''}`}
                      style={{ background: `#${t.hex}` }}
                      title={`${t.token} (#${t.hex})`}
                      aria-label={t.token}
                      data-token={t.token}
                      onClick={() => {
                        onChange(t.token);
                        close();
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="palette-actions">
            <button className="menu-item" onClick={() => (onChange(null), close())}>Valeur par défaut</button>
            {allowNone && <button className="menu-item" onClick={() => (onChange('none'), close())}>Aucune</button>}
          </div>
        </div>
      )}
    </Menu>
  );
}

function ElementInspector({ r }: { r: ResolvedElement }) {
  const slide = useEditor(currentSlide)!;
  const master = useEditor((s) => s.master)!;
  const { mutate, select } = useEditor.getState();
  const el = r.element;
  const layout = findLayout(master, slide.layout);
  const upd = (patch: ElementPatch) => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch }]);
  const style = (k: keyof ElementStyle, v: unknown) => upd({ style: { [k]: v } });
  const hasText = el.type === 'text' || (el.type === 'shape' && el.shape !== 'line') || el.type === 'table';
  const geom = (k: 'x' | 'y' | 'w' | 'h', v: number) => upd({ x: r.box.x, y: r.box.y, w: r.box.w, h: r.box.h, [k]: v });
  const TYPE_LABEL: Record<string, string> = { text: 'Texte', shape: 'Forme', image: el.type === 'image' && isDiagramSrc(el.src) ? 'Diagramme GMC' : 'Image', table: 'Tableau', connector: 'Connecteur' };
  const fonts = [...new Set([master.theme.fonts.heading, master.theme.fonts.body, ...master.constraints.allowedFonts])];

  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{TYPE_LABEL[el.type]}</span>
        <code className="insp-id" title="Identifiant stable">{el.id}</code>
        <span className="grow" />
        <IconButton icon={el.locked ? 'lock' : 'unlock'} label={el.locked ? 'Déverrouiller' : 'Verrouiller'} active={el.locked} onClick={() => upd({ locked: !el.locked })} />
        <IconButton icon={el.hidden ? 'eyeOff' : 'eye'} label={el.hidden ? 'Afficher' : 'Masquer'} active={el.hidden} onClick={() => upd({ hidden: !el.hidden })} />
        <IconButton
          icon="trash"
          label="Supprimer l'élément"
          onClick={() => {
            mutate(deleteMutations(slide, [el.id]));
            select(slide.id, []);
          }}
        />
      </div>

      {el.type === 'image' && isDiagramSrc(el.src) && (
        <Section title="Graph Model Studio">
          <p className="hint"><code>{el.src}</code> → rendu <code>{el.src.replace(/\.gmc$/i, '.png')}</code></p>
          <div className="row">
            <button className="btn grow" data-testid="inspector-edit-gmc" onClick={() => useEditor.getState().set({ gmcEdit: el.src })}><Icon name="diagram" /> Modifier</button>
            <button className="btn grow" onClick={() => post({ type: 'refreshGmc', src: el.src })}><Icon name="refresh" /> Actualiser</button>
          </div>
        </Section>
      )}

      <ShapeSections r={r} upd={upd} />

      {el.type !== 'connector' && <Section title="Position et taille" aside={r.inheritedGeometry ? <span className="hint">hérité de la disposition</span> : undefined}>
        <div className="grid2">
          <NumField label="X" unit="in" value={r.box.x} onCommit={(v) => geom('x', v)} testId="field-x" disabled={el.locked} />
          <NumField label="Y" unit="in" value={r.box.y} onCommit={(v) => geom('y', v)} testId="field-y" disabled={el.locked} />
          <NumField label="L" unit="in" value={r.box.w} onCommit={(v) => geom('w', Math.max(0, v))} testId="field-w" disabled={el.locked} />
          <NumField label="H" unit="in" value={r.box.h} onCommit={(v) => geom('h', Math.max(0, v))} testId="field-h" disabled={el.locked} />
          <NumField label="Rot." unit="°" step={1} value={el.rotation ?? 0} onCommit={(v) => upd({ rotation: v })} disabled={el.locked} />
        </div>
      </Section>}

      {hasText && (
        <Section title="Typographie">
          <div className="row">
            <select
              className="select grow"
              aria-label="Police"
              value={el.style?.fontFace ?? ''}
              onChange={(e) => style('fontFace', e.target.value || null)}
            >
              <option value="">Disposition ({r.style.fontFace})</option>
              <option value="theme.heading">Titres — {master.theme.fonts.heading}</option>
              <option value="theme.body">Corps — {master.theme.fonts.body}</option>
              {fonts.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <NumField label="pt" value={el.style?.fontSize ?? r.style.fontSize} step={1} onCommit={(v) => style('fontSize', Math.max(4, v))} testId="field-size" />
            <div className="seg" role="group" aria-label="Taille de police">
              <IconButton icon="fontGrow" label="Augmenter la taille de police" onClick={() => style('fontSize', stepFontSize(r.style.fontSize, 1))} />
              <IconButton icon="fontShrink" label="Réduire la taille de police" onClick={() => style('fontSize', stepFontSize(r.style.fontSize, -1))} />
            </div>
          </div>
          <div className="row">
            <div className="seg" role="group" aria-label="Style">
              <IconButton icon="bold" label="Gras" active={!!el.style?.bold} onClick={() => style('bold', el.style?.bold ? null : true)} />
              <IconButton icon="italic" label="Italique" active={!!el.style?.italic} onClick={() => style('italic', el.style?.italic ? null : true)} />
              <IconButton icon="underline" label="Souligné" active={!!el.style?.underline} onClick={() => style('underline', el.style?.underline ? null : true)} />
            </div>
            <div className="seg" role="group" aria-label="Alignement horizontal">
              {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                <IconButton key={a} icon={a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : a === 'right' ? 'alignRight' : 'alignJustify'} label={{ left: 'Aligner à gauche', center: 'Centrer', right: 'Aligner à droite', justify: 'Justifier' }[a]} active={r.style.align === a} onClick={() => style('align', a)} />
              ))}
            </div>
          </div>
          <div className="row">
            <div className="seg" role="group" aria-label="Alignement vertical">
              {(['top', 'middle', 'bottom'] as const).map((a) => (
                <IconButton key={a} icon={a === 'top' ? 'vTop' : a === 'middle' ? 'vMiddle' : 'vBottom'} label={{ top: 'Haut', middle: 'Milieu', bottom: 'Bas' }[a]} active={r.style.valign === a} onClick={() => style('valign', a)} />
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section title="Couleurs de la charte">
        <div className="stack">
          {el.type !== 'image' && el.type !== 'connector' && <ColorPicker label="Texte" value={el.style?.color} onChange={(v) => style('color', v)} testId="color-text" />}
          {el.type === 'text' && <ColorPicker label="Fond" value={el.style?.fill} onChange={(v) => style('fill', v)} allowNone testId="color-fill" />}
          {el.type === 'shape' && el.shape !== 'line' && <ColorPicker label="Remplissage" value={el.style?.fill} onChange={(v) => style('fill', v)} allowNone testId="color-fill" />}
          {(el.type === 'shape' || el.type === 'connector') && <ColorPicker label={el.type === 'connector' || (el.type === 'shape' && el.shape === 'line') ? 'Trait' : 'Contour'} value={el.style?.line} onChange={(v) => style('line', v)} allowNone={el.type === 'shape'} testId="color-line" />}
        </div>
      </Section>

      <Section title="Calque">
        <div className="seg" role="group" aria-label="Ordre des calques">
          {(['front', 'forward', 'backward', 'back'] as const).map((d) => (
            <IconButton key={d} icon={d} label={{ front: 'Premier plan', forward: 'Avancer', backward: 'Reculer', back: 'Arrière-plan' }[d]} onClick={() => mutate([{ kind: 'reorderElement', slideId: slide.id, elementId: el.id, direction: d }])} />
          ))}
        </div>
      </Section>

      {(el.type === 'text' || el.type === 'image') && layout && (
        <Section title="Espace réservé">
          <select
            className="select"
            aria-label="Espace réservé lié"
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
            <option value="">Libre (non lié)</option>
            {layout.placeholders.map((p) => (
              <option key={p.key} value={p.key}>{p.key} — {p.type}</option>
            ))}
            {el.placeholder && !layout.placeholders.some((p) => p.key === el.placeholder) && <option value={el.placeholder}>{el.placeholder} (alias)</option>}
          </select>
          <p className="hint">Lier un texte à un espace réservé conserve l'héritage de la disposition dans PowerPoint.</p>
        </Section>
      )}
    </>
  );
}

function SlideInspector() {
  const slide = useEditor(currentSlide);
  const master = useEditor((s) => s.master);
  const diagnostics = useEditor((s) => s.diagnostics);
  const { mutate } = useEditor.getState();
  if (!slide || !master) return null;
  const layout = findLayout(master, slide.layout);
  const issues = diagnostics.filter((d) => d.slideId === slide.id);
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">Diapositive</span>
        <code className="insp-id">{slide.id}</code>
      </div>
      <Section title="Disposition corporate">
        <select className="select" aria-label="Disposition" data-testid="slide-layout" value={layout?.id ?? slide.layout} onChange={(e) => {
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
      <Section title="Conformité">
        {issues.length === 0 ? <p className="hint ok">Aucun problème détecté sur cette diapositive.</p> : (
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
  if (pane === 'comments') return <CommentsPane />;
  if (!slide || !master) return <aside className="inspector" />;
  const rs = resolveSlide(slide, master);
  const sel = rs.elements.filter((r) => selected.includes(r.element.id));
  return (
    <aside className="inspector" aria-label="Format">
      {sel.length === 1 ? <ElementInspector r={sel[0]!} /> : sel.length > 1 ? <MultiInspector rs={sel} /> : <SlideInspector />}
    </aside>
  );
}

function MultiInspector({ rs }: { rs: ResolvedElement[] }) {
  const slide = useEditor(currentSlide)!;
  const { mutate } = useEditor.getState();
  const align = (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    const x0 = Math.min(...rs.map((r) => r.box.x)), x1 = Math.max(...rs.map((r) => r.box.x + r.box.w));
    const y0 = Math.min(...rs.map((r) => r.box.y)), y1 = Math.max(...rs.map((r) => r.box.y + r.box.h));
    mutate(rs.filter((r) => !r.element.locked).map((r) => {
      const b = { ...r.box };
      if (mode === 'left') b.x = x0;
      if (mode === 'right') b.x = x1 - b.w;
      if (mode === 'hcenter') b.x = (x0 + x1) / 2 - b.w / 2;
      if (mode === 'top') b.y = y0;
      if (mode === 'bottom') b.y = y1 - b.h;
      if (mode === 'vcenter') b.y = (y0 + y1) / 2 - b.h / 2;
      return { kind: 'updateElement', slideId: slide.id, elementId: r.element.id, patch: { x: round4(b.x), y: round4(b.y), w: b.w, h: b.h } } as Mutation;
    }));
  };
  return (
    <>
      <div className="insp-head"><span className="insp-kind">{rs.length} éléments</span></div>
      <Section title="Aligner">
        <div className="seg" role="group" aria-label="Aligner la sélection">
          <IconButton icon="alignLeft" label="Aligner à gauche" onClick={() => align('left')} />
          <IconButton icon="alignCenter" label="Centrer horizontalement" onClick={() => align('hcenter')} />
          <IconButton icon="alignRight" label="Aligner à droite" onClick={() => align('right')} />
          <IconButton icon="vTop" label="Aligner en haut" onClick={() => align('top')} />
          <IconButton icon="vMiddle" label="Centrer verticalement" onClick={() => align('vcenter')} />
          <IconButton icon="vBottom" label="Aligner en bas" onClick={() => align('bottom')} />
        </div>
      </Section>
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
      <span className="status-item">{doc ? `Diapositive ${index + 1} sur ${doc.slides.length}` : ''}</span>
      <span className="status-item">{sourceKind === 'markdown' ? 'Markdown + YAML' : 'DSL YAML'}</span>
      <span className={pending ? 'status-item sync is-pending' : 'status-item sync'} data-testid="sync-state">{pending ? 'Synchronisation…' : 'Synchronisé avec la source'}</span>
      <button type="button" className={`status-btn diag-count${errors ? ' has-errors' : warnings ? ' has-warnings' : ''}`} data-testid="diag-count" title={[...parseErrors, ...diagnostics.map((d) => d.message)].join('\n')} onClick={() => post({ type: 'validate' })}>
        {errors} erreur{errors > 1 ? 's' : ''} · {warnings} avertissement{warnings > 1 ? 's' : ''}
      </button>
      <span className="grow" />
      <button type="button" className={`status-btn${notesOpen ? ' is-active' : ''}`} aria-pressed={notesOpen} onClick={() => set({ notesOpen: !notesOpen })}><Icon name="notes" size={14} /> Notes</button>
      <button type="button" className={`status-btn${pane === 'comments' ? ' is-active' : ''}`} aria-pressed={pane === 'comments'} onClick={() => set({ pane: pane === 'comments' ? 'format' : 'comments' })}><Icon name="comment" size={14} /> Commentaires{open ? ` (${open})` : ''}</button>
      <span className="sep" />
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" className="status-btn" aria-label="Zoom arrière" onClick={() => setZoom(Math.max(0.1, round4(z / 1.2)))}><Icon name="zoomOut" size={14} /></button>
        <input type="range" min={10} max={400} step={1} value={Math.round(z * 100)} aria-label="Niveau de zoom" onChange={(e) => setZoom(Number(e.target.value) / 100)} />
        <button type="button" className="status-btn" aria-label="Zoom avant" onClick={() => setZoom(Math.min(4, round4(z * 1.2)))}><Icon name="zoomIn" size={14} /></button>
        <span className="zoom-value" data-testid="zoom-value">{Math.round(z * 100)} %</span>
        <button type="button" className={`status-btn${zoom === 'fit' ? ' is-active' : ''}`} aria-label="Ajuster la diapositive à la fenêtre" title="Ajuster la diapositive à la fenêtre" onClick={() => setZoom('fit')}><Icon name="fit" size={14} /></button>
      </div>
    </footer>
  );
}
