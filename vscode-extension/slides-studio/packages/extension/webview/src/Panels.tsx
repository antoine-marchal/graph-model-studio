import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LayoutInspector, PlaceholderSection } from './LayoutDesigner';
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
  imageFit,
  isDiagramSrc,
  type SlideElement,
  tr,
} from '@corporate-slides/core';
import { PPI, SlideView } from '@corporate-slides/renderer';
import { Icon, type IconName } from './icons';
import { post } from './host';
import { currentSlide, useEditor } from './store';
import { useAssets } from './Canvas';
import { CommentsPane, useAnchors, useDiff } from './Review';
import { MasterInspector } from './MasterEdit';
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

/** Numeric field that commits on Enter/blur, with −/+ buttons and arrow-key stepping. */
export function NumField({ label, value, onCommit, step = 0.05, unit, testId, disabled, className }: { label: string; value: number | undefined; onCommit: (v: number) => void; step?: number; unit?: string; testId?: string; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(round4(value)));
  useEffect(() => setText(value === undefined ? '' : String(round4(value))), [value]);
  const parsed = Number(text.replace(',', '.'));
  const commit = () => {
    if (text.trim() && Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    else setText(value === undefined ? '' : String(round4(value)));
  };
  const bump = (dir: 1 | -1, big = false) => {
    const v = round4((Number.isFinite(parsed) ? parsed : (value ?? 0)) + dir * (big ? step * 10 : step));
    setText(String(v));
    onCommit(v);
  };
  return (
    <label className={`numfield${className ? ` ${className}` : ''}`}>
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
            bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
      {unit && <span className="numfield-unit">{unit}</span>}
      {!disabled && (
        <span className="numfield-steps">
          {([-1, 1] as const).map((d) => (
            <button key={d} type="button" tabIndex={-1} aria-label={d < 0 ? tr('Diminuer', 'Decrease') : tr('Augmenter', 'Increase')} data-testid={testId && `${testId}-${d < 0 ? 'dec' : 'inc'}`} onMouseDown={(e) => e.preventDefault()} onClick={(e) => (e.preventDefault(), bump(d, e.shiftKey))}>
              {d < 0 ? '−' : '+'}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Identifier shown in an inspector head; double-click to rename (Enter / blur commits, Escape cancels). */
export function EditableId({ value, onRename, title, testId }: { value: string; onRename?: (id: string) => void; title?: string; testId?: string }) {
  const [text, setText] = useState<string | null>(null);
  if (text === null || !onRename)
    return (
      <code className="insp-id" title={onRename ? `${title ?? ''}${title ? ' · ' : ''}${tr('double-clic pour renommer', 'double-click to rename')}` : title} data-testid={testId} onDoubleClick={() => onRename && setText(value)}>
        {value}
      </code>
    );
  const ok = ID_RE.test(text);
  const commit = () => {
    setText(null);
    if (ok && text !== value) onRename(text);
  };
  return (
    <input
      className={`input insp-id-input${ok ? '' : ' is-invalid'}`}
      value={text}
      autoFocus
      spellCheck={false}
      data-testid={testId && `${testId}-input`}
      title={ok ? undefined : tr('Lettres, chiffres, _ et - (64 max)', 'Letters, digits, _ and - (64 max)')}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value.replace(/\s/g, '-'))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setText(null);
      }}
    />
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
                {issues.length > 0 && (
                  <span className={`badge ${errors ? 'badge-error' : 'badge-warn'}`} title={issues.map((d) => d.message).join('\n')}>
                    {issues.length}
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

/** Corporate palette popup (theme tokens with tints/shades) plus a free color; shared by inspector and table toolbar. */
export function PaletteMenu({ trigger, value, onChange, allowNone, testId }: { trigger: (open: () => void) => ReactNode; value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  return (
    <Menu testId={testId} trigger={trigger}>
      {(close) => <PaletteGrid value={value} onChange={onChange} allowNone={allowNone} testId={testId} close={close} />}
    </Menu>
  );
}

/** The palette itself (chips, free color, default / none), embeddable in any popup. */
export function PaletteGrid({ value, onChange, allowNone, testId, close }: { value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string; close: () => void }) {
  const master = useEditor((s) => s.master)!;
  const tokens = paletteTokens(master);
  const base = tokens.filter((t) => t.token.split('.').length === 2);
  const custom = value && !value.startsWith('theme.') && value !== 'none' ? `#${value.replace('#', '')}` : '#000000';
  return (
        <div className="palette" onMouseDown={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
          <div className="palette-rows">
            {base.map((b) => {
              const slot = b.token.split('.')[1]!;
              const variants = tokens.filter((t) => t.token.startsWith(`theme.${slot}.`));
              return (
                <div key={b.token} className="palette-col">
                  {[b, ...variants].map((t) => (
                    <button
                      key={t.token}
                      type="button"
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
            <label className="menu-item palette-custom" title={tr('Couleur hors charte : signalée par la validation', 'Off-brand color: flagged by validation')}>
              {/* Native `change` (picker closed), not React's per-drag `input`: one mutation per choice. */}
              <input type="color" defaultValue={custom} ref={(n) => void (n && (n.onchange = () => (onChange(n.value.toUpperCase()), close())))} data-testid={testId ? `${testId}-custom` : undefined} />
              {tr('Autre couleur…', 'More colors…')}
            </label>
            <button type="button" className="menu-item" onClick={() => (onChange(null), close())}>{tr('Valeur par défaut', 'Default')}</button>
            {allowNone && <button type="button" className="menu-item" onClick={() => (onChange('none'), close())}>{tr('Aucune', 'None')}</button>}
          </div>
        </div>
  );
}

export function ColorPicker({ label, value, onChange, allowNone, testId }: { label: string; value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  const master = useEditor((s) => s.master)!;
  const current = value ? paletteTokens(master).find((t) => t.token === value) : undefined;
  const hexValue = current?.hex ?? (value && !value.startsWith('theme.') && value !== 'none' ? value.replace('#', '') : undefined);
  return (
    <PaletteMenu
      testId={testId ? `${testId}-menu` : undefined}
      value={value}
      onChange={onChange}
      allowNone={allowNone}
      trigger={(open) => (
        <button type="button" className="color-field" onClick={open} data-testid={testId} aria-label={`${label} : ${value ?? tr('par défaut', 'default')}`}>
          <span className="swatch" style={{ background: value === 'none' ? 'transparent' : hexValue ? `#${hexValue}` : 'transparent' }} data-none={value === 'none' || !hexValue} />
          <span className="color-label">{label}</span>
          <span className="color-token">{value ?? tr('défaut', 'default')}</span>
        </button>
      )}
    />
  );
}

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

      {(el.type === 'text' || el.type === 'image') && layout && !useEditor.getState().design && (
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
            {layout.placeholders.map((p) => (
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
  const issues = diagnostics.filter((d) => d.slideId === slide.id);
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
  return (
    <aside className="inspector" aria-label="Format">
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
      <span className={pending ? 'status-item sync is-pending' : 'status-item sync'} data-testid="sync-state">{pending ? tr('Synchronisation…', 'Syncing…') : tr('Synchronisé avec la source', 'Synced with the source')}</span>
      <button type="button" className={`status-btn diag-count${errors ? ' has-errors' : warnings ? ' has-warnings' : ''}`} data-testid="diag-count" title={[...parseErrors, ...diagnostics.map((d) => d.message)].join('\n')} onClick={() => post({ type: 'validate' })}>
        {errors} {errors > 1 ? tr('erreurs', 'errors') : tr('erreur', 'error')} · {warnings} {warnings > 1 ? tr('avertissements', 'warnings') : tr('avertissement', 'warning')}
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
