import type { ReactNode } from 'react';
import {
  round4,
  uniqueId,
  type ArrowHead,
  type CellStyle,
  type ConnectorSide,
  type ElementPatch,
  type Mutation,
  type Numbering,
  type Paragraph,
  type ResolvedElement,
  type ShapeKind,
  type SlideElement,
  type SlideNode,
  tr,
} from '@corporate-slides/core';
import { shapePath } from '@corporate-slides/renderer';
import { Icon } from './icons';
import { ColorPicker, Menu, NumField, Section } from './Panels';
import { currentSlide, useEditor } from './store';

/* ------------------------------------------------------------------ */
/* Shape catalog (all exported natively as OOXML preset geometries)    */
/* ------------------------------------------------------------------ */

export const SHAPE_GROUPS: { label: string; shapes: { shape: ShapeKind; label: string }[] }[] = [
  {
    label: tr('Formes de base', 'Basic shapes'),
    shapes: [
      { shape: 'rect', label: tr('Rectangle', 'Rectangle') },
      { shape: 'roundRect', label: tr('Rectangle arrondi', 'Rounded rectangle') },
      { shape: 'snip1Rect', label: tr('Rectangle à coin coupé', 'Snipped rectangle') },
      { shape: 'ellipse', label: tr('Ellipse', 'Ellipse') },
      { shape: 'triangle', label: 'Triangle' },
      { shape: 'rtTriangle', label: tr('Triangle rectangle', 'Right triangle') },
      { shape: 'diamond', label: tr('Losange', 'Diamond') },
      { shape: 'parallelogram', label: tr('Parallélogramme', 'Parallelogram') },
      { shape: 'trapezoid', label: tr('Trapèze', 'Trapezoid') },
      { shape: 'pentagon', label: tr('Pentagone', 'Pentagon') },
      { shape: 'hexagon', label: tr('Hexagone', 'Hexagon') },
      { shape: 'octagon', label: tr('Octogone', 'Octagon') },
      { shape: 'star5', label: tr('Étoile', 'Star') },
      { shape: 'plus', label: tr('Croix', 'Cross') },
      { shape: 'donut', label: tr('Anneau', 'Donut') },
      { shape: 'can', label: tr('Cylindre (base de données)', 'Cylinder (database)') },
      { shape: 'cube', label: 'Cube' },
    ],
  },
  {
    label: tr('Flèches et processus', 'Arrows and process'),
    shapes: [
      { shape: 'rightArrow', label: tr('Flèche droite', 'Right arrow') },
      { shape: 'leftArrow', label: tr('Flèche gauche', 'Left arrow') },
      { shape: 'upArrow', label: tr('Flèche haut', 'Up arrow') },
      { shape: 'downArrow', label: tr('Flèche bas', 'Down arrow') },
      { shape: 'leftRightArrow', label: tr('Double flèche', 'Double arrow') },
      { shape: 'circularArrow', label: tr('Flèche circulaire (boucle)', 'Circular arrow (loop)') },
      { shape: 'chevron', label: tr('Chevron (étape)', 'Chevron (step)') },
      { shape: 'homePlate', label: tr('Pentagone flèche (jalon)', 'Pentagon arrow (milestone)') },
    ],
  },
  {
    label: tr('Organigramme et annotations', 'Flowchart and callouts'),
    shapes: [
      { shape: 'flowChartTerminator', label: tr('Début / fin', 'Start / end') },
      { shape: 'flowChartDocument', label: 'Document' },
      { shape: 'wedgeRectCallout', label: tr('Bulle de légende', 'Callout') },
      { shape: 'line', label: tr('Ligne', 'Line') },
    ],
  },
];

export const SHAPE_LABEL = Object.fromEntries(SHAPE_GROUPS.flatMap((g) => g.shapes.map((s) => [s.shape, s.label]))) as Record<ShapeKind, string>;

/** Small preview of a preset geometry, drawn with the renderer's own paths. */
export function ShapeIcon({ shape, size = 22 }: { shape: ShapeKind; size?: number }) {
  const w = size, h = shape === 'line' ? size : Math.round(size * 0.72);
  const pad = 1.5;
  const iw = w - pad * 2, ih = h - pad * 2;
  const common = { fill: 'color-mix(in srgb, currentColor 14%, transparent)', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' as const };
  let body: ReactNode;
  if (shape === 'line') body = <path d={`M 0 ${ih} L ${iw} 0`} {...common} fill="none" />;
  else if (shape === 'rect') body = <rect width={iw} height={ih} {...common} />;
  else if (shape === 'roundRect') body = <rect width={iw} height={ih} rx={ih * 0.25} {...common} />;
  else if (shape === 'flowChartTerminator') body = <rect width={iw} height={ih} rx={ih / 2} {...common} />;
  else if (shape === 'ellipse') body = <ellipse cx={iw / 2} cy={ih / 2} rx={iw / 2} ry={ih / 2} {...common} />;
  else body = <path d={shapePath(shape, iw, ih, ih * 0.3)} fillRule="evenodd" {...common} />;
  return (
    <svg width={w} height={h} viewBox={`${-pad} ${-pad} ${w} ${h}`} aria-hidden style={{ overflow: 'visible' }}>
      {body}
    </svg>
  );
}

/** Gallery of every shape, grouped as in PowerPoint's "Shapes" menu. */
export function ShapeGallery({ trigger, onPick, testId = 'shape-menu' }: { trigger: (open: () => void) => ReactNode; onPick: (s: ShapeKind) => void; testId?: string }) {
  return (
    <Menu testId={testId} trigger={trigger}>
      {(close) => (
        <div className="shape-gallery">
          {SHAPE_GROUPS.map((g) => (
            <section key={g.label}>
              <h4>{g.label}</h4>
              <div className="shape-grid">
                {g.shapes.map((s) => (
                  <button key={s.shape} type="button" role="menuitem" className="shape-cell" title={s.label} aria-label={s.label} data-shape={s.shape} onClick={() => (close(), onPick(s.shape))}>
                    <ShapeIcon shape={s.shape} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Menu>
  );
}

/* ------------------------------------------------------------------ */
/* Element helpers                                                     */
/* ------------------------------------------------------------------ */

/** Delete elements and every connector attached to them. */
export function deleteMutations(slide: SlideNode, ids: string[]): Mutation[] {
  const gone = new Set(ids);
  for (const e of slide.elements) if (e.type === 'connector' && (gone.has(e.from) || gone.has(e.to))) gone.add(e.id);
  return [...gone].map((elementId) => ({ kind: 'deleteElement', slideId: slide.id, elementId }));
}

/** New connector between two elements (straight, arrow at the end). */
export function connectMutation(slide: SlideNode, from: string, to: string, route: 'straight' | 'elbow' | 'curved' = 'elbow'): { m: Mutation; id: string } {
  const id = uniqueId('connector', slide.elements.map((e) => e.id));
  return { id, m: { kind: 'addElement', slideId: slide.id, element: { id, type: 'connector', from, to, route } as SlideElement } };
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdistribute' | 'vdistribute';

/**
 * Align (or distribute) elements: against the selection bounds when several are given, against the
 * slide (`frame`) for a single one. Locked elements and connectors stay put.
 */
export function alignMutations(slideId: string, rs: ResolvedElement[], mode: AlignMode, frame: { w: number; h: number }): Mutation[] {
  const movable = rs.filter((r) => !r.element.locked && r.element.type !== 'connector');
  if (!movable.length) return [];
  const one = rs.length === 1;
  const x0 = one ? 0 : Math.min(...rs.map((r) => r.box.x)), x1 = one ? frame.w : Math.max(...rs.map((r) => r.box.x + r.box.w));
  const y0 = one ? 0 : Math.min(...rs.map((r) => r.box.y)), y1 = one ? frame.h : Math.max(...rs.map((r) => r.box.y + r.box.h));
  const boxes = new Map(movable.map((r) => [r.element.id, { ...r.box }]));
  if (mode === 'hdistribute' || mode === 'vdistribute') {
    const h = mode === 'hdistribute';
    const sorted = [...movable].sort((a, b) => (h ? a.box.x - b.box.x : a.box.y - b.box.y));
    const total = sorted.reduce((s, r) => s + (h ? r.box.w : r.box.h), 0);
    const gap = ((h ? x1 - x0 : y1 - y0) - total) / Math.max(1, sorted.length - 1);
    let at = h ? x0 : y0;
    for (const r of sorted) {
      const b = boxes.get(r.element.id)!;
      if (h) b.x = at;
      else b.y = at;
      at += (h ? b.w : b.h) + gap;
    }
  } else {
    for (const b of boxes.values()) {
      if (mode === 'left') b.x = x0;
      if (mode === 'right') b.x = x1 - b.w;
      if (mode === 'hcenter') b.x = (x0 + x1) / 2 - b.w / 2;
      if (mode === 'top') b.y = y0;
      if (mode === 'bottom') b.y = y1 - b.h;
      if (mode === 'vcenter') b.y = (y0 + y1) / 2 - b.h / 2;
    }
  }
  return [...boxes].map(([elementId, b]) => ({ kind: 'updateElement', slideId, elementId, patch: { x: round4(b.x), y: round4(b.y), w: b.w, h: b.h } }));
}

/** Copies of elements offset down-right, with fresh ids (connectors are skipped). */
export function duplicateMutations(slide: SlideNode, rs: ResolvedElement[]): { ms: Mutation[]; ids: string[] } {
  const taken = slide.elements.map((x) => x.id);
  const ids: string[] = [];
  const ms: Mutation[] = [];
  for (const r of rs) {
    if (r.element.type === 'connector') continue;
    const id = uniqueId(r.element.type, [...taken, ...ids]);
    ids.push(id);
    const { source: _s, z: _z, ...rest } = r.element as SlideElement & { source?: unknown };
    ms.push({ kind: 'addElement', slideId: slide.id, element: { ...rest, id, x: round4(r.box.x + 0.2), y: round4(r.box.y + 0.2), w: r.box.w, h: r.box.h } as SlideElement });
  }
  return { ms, ids };
}

const hasParagraphs = (e: SlideElement): e is Extract<SlideElement, { paragraphs?: Paragraph[] }> => (e.type === 'text' || (e.type === 'shape' && e.shape !== 'line'));

/* ------------------------------------------------------------------ */
/* Inline editor bridge                                                */
/* ------------------------------------------------------------------ */

/** Set by the inline text editor while it is mounted, so the ribbon can format the text being typed. */
export const inlineEditor: {
  current: {
    /** Current paragraphs and the indexes of the paragraphs touched by the caret/selection. */
    read(): { paragraphs: Paragraph[]; from: number; to: number };
    replace(paragraphs: Paragraph[]): void;
    /** Apply run marks to the selected text (restoring the selection kept by `saveRange`). */
    format(f: RunFormat): boolean;
    saveRange(): void;
    restoreRange(): void;
    hasSelection(): boolean;
    /** Font size (pt) at the caret / selection start. */
    selectionSize(): number | null;
    /** Table editing: apply a cell look to the selected cells (no characters selected). */
    formatCells?(patch: Partial<Record<keyof CellStyle, unknown>> | 'clear'): void;
    /** Table editing: look of the active cell, for the ribbon states. */
    cellStyle?(): CellStyle | null;
  } | null;
} = { current: null };

/** Text-run marks the ribbon and the text context menu apply to the selection of the inline editor. */
export type RunFormat = { bold?: boolean; italic?: boolean; underline?: boolean; color?: string | null; size?: number | null } | 'clear';

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];

/** Next / previous size on the Office font-size scale. */
export const stepFontSize = (pt: number, dir: 1 | -1): number =>
  dir > 0 ? (FONT_SIZES.find((s) => s > pt) ?? pt + 8) : ([...FONT_SIZES].reverse().find((s) => s < pt) ?? Math.max(4, pt - 1));

/** Keeps the inline editor focused when a ribbon button is pressed. */
export const keepFocus = (e: React.MouseEvent) => e.preventDefault();

type ParaOp = (p: Paragraph) => Paragraph;

/** Apply a paragraph transformation to the edited paragraphs, or to every paragraph of the selected elements. */
function useParagraphOps() {
  const slide = useEditor(currentSlide);
  const selected = useEditor((s) => s.selected);
  const editingId = useEditor((s) => s.editingId);
  const { mutate } = useEditor.getState();
  const targets = slide?.elements.filter((e) => selected.includes(e.id) && hasParagraphs(e)) ?? [];
  const apply = (op: ParaOp, style?: Record<string, unknown>) => {
    if (!slide) return;
    const ed = inlineEditor.current;
    if (editingId && ed) {
      const { paragraphs, from, to } = ed.read();
      ed.replace(paragraphs.map((p, i) => (i >= from && i <= to ? op(p) : p)));
      if (style) mutate([{ kind: 'updateElement', slideId: slide.id, elementId: editingId, patch: { style } }]);
      return;
    }
    mutate(
      targets.map((e) => {
        const paras = (hasParagraphs(e) ? e.paragraphs : undefined) ?? [];
        const patch: ElementPatch = { paragraphs: paras.map(op) };
        if (style) patch.style = style;
        return { kind: 'updateElement', slideId: slide.id, elementId: e.id, patch };
      }),
    );
  };
  /** Paragraph that decides the toggle states (first edited/selected one). */
  const sample = (): Paragraph | undefined => {
    const ed = editingId ? inlineEditor.current : null;
    if (ed) {
      const r = ed.read();
      return r.paragraphs[r.from];
    }
    const e = targets[0];
    return e && hasParagraphs(e) ? e.paragraphs?.[0] : undefined;
  };
  return { apply, sample, enabled: !!slide && (targets.length > 0 || !!editingId), targets };
}

const without = <K extends keyof Paragraph>(p: Paragraph, ...keys: K[]): Paragraph => {
  const q = { ...p };
  for (const k of keys) delete q[k];
  return q;
};

export const BULLETS: { char: string; label: string }[] = [
  { char: '•', label: tr('Puce ronde', 'Round bullet') },
  { char: '–', label: tr('Tiret', 'Dash') },
  { char: '■', label: tr('Carré plein', 'Filled square') },
  { char: '□', label: tr('Carré vide', 'Hollow square') },
  { char: '○', label: tr('Cercle vide', 'Hollow circle') },
  { char: '►', label: tr('Flèche pleine', 'Filled arrow') },
  { char: '➢', label: tr('Flèche', 'Arrow') },
  { char: '✓', label: tr('Coche', 'Check mark') },
];

export const NUMBERINGS: { id: Numbering; label: string; sample: string }[] = [
  { id: 'arabicPeriod', label: '1. 2. 3.', sample: '1.' },
  { id: 'arabicParenR', label: '1) 2) 3)', sample: '1)' },
  { id: 'alphaUcPeriod', label: 'A. B. C.', sample: 'A.' },
  { id: 'alphaLcPeriod', label: 'a. b. c.', sample: 'a.' },
  { id: 'alphaLcParenR', label: 'a) b) c)', sample: 'a)' },
  { id: 'romanUcPeriod', label: 'I. II. III.', sample: 'I.' },
  { id: 'romanLcPeriod', label: 'i. ii. iii.', sample: 'i.' },
];

/** Inline split button: main action + dropdown caret. */
function Split({ icon, label, active, disabled, onClick, testId, children }: { icon: Parameters<typeof Icon>[0]['name']; label: string; active?: boolean; disabled?: boolean; onClick: () => void; testId?: string; children: (close: () => void) => ReactNode }) {
  return (
    <span className="split">
      <button type="button" className={`rb-small icon-only${active ? ' is-active' : ''}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={keepFocus} onClick={onClick} data-testid={testId}>
        <Icon name={icon} />
      </button>
      <Menu testId={testId ? `${testId}-menu` : undefined} trigger={(open) => (
        <button type="button" className="rb-small split-caret" aria-label={`${label} : options`} disabled={disabled} onMouseDown={keepFocus} onClick={open}>
          <Icon name="chevronDown" size={10} />
        </button>
      )}>
        {children}
      </Menu>
    </span>
  );
}

/** Ribbon "Paragraphe" tools: bullets, numbering, indentation, headings. */
export function ParagraphTools({ disabled: off }: { disabled?: boolean }) {
  const { apply, sample, enabled } = useParagraphOps();
  const disabled = off || !enabled;
  const p = sample();
  const bullet = (char?: string) => apply((q) => ({ ...without(q, 'heading'), list: 'bullet' }), char ? { bullet: char } : undefined);
  const number = (scheme?: Numbering) => apply((q) => ({ ...without(q, 'heading'), list: 'number' }), scheme ? { numbering: scheme } : undefined);
  const toggleList = (kind: 'bullet' | 'number') => (p?.list === kind ? apply((q) => without(q, 'list', 'level')) : kind === 'bullet' ? bullet() : number());
  const indent = (d: 1 | -1) => apply((q) => {
    const level = Math.max(0, Math.min(4, (q.level ?? 0) + d));
    return level ? { ...q, list: q.list ?? 'bullet', level } : without(q, 'level');
  });
  const heading = (h: number | null) => apply((q) => (h ? { ...without(q, 'list', 'level'), heading: h } : without(q, 'heading')));
  return (
    <div className="rb-col">
      <div className="rb-row">
        <Split icon="bulletList" label={tr("Liste à puces", "Bulleted list")} testId="list-bullet" active={p?.list === 'bullet'} disabled={disabled} onClick={() => toggleList('bullet')}>
          {(close) => (
            <div className="bullet-grid">
              {BULLETS.map((b) => (
                <button key={b.char} type="button" role="menuitem" className="bullet-cell" title={b.label} aria-label={b.label} onMouseDown={keepFocus} onClick={() => (close(), bullet(b.char))}>{b.char}</button>
              ))}
            </div>
          )}
        </Split>
        <Split icon="numberList" label={tr("Liste numérotée", "Numbered list")} testId="list-number" active={p?.list === 'number'} disabled={disabled} onClick={() => toggleList('number')}>
          {(close) =>
            NUMBERINGS.map((n) => (
              <button key={n.id} type="button" role="menuitem" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), number(n.id))}>
                <span className="num-sample">{n.sample}</span> {n.label}
              </button>
            ))
          }
        </Split>
        <button type="button" className="rb-small icon-only" title={tr("Diminuer le retrait (Maj+Tab)", "Decrease indent (Shift+Tab)")} aria-label={tr("Diminuer le retrait", "Decrease indent")} disabled={disabled} onMouseDown={keepFocus} onClick={() => indent(-1)}><Icon name="outdent" /></button>
        <button type="button" className="rb-small icon-only" title={tr("Augmenter le retrait (Tab)", "Increase indent (Tab)")} aria-label={tr("Augmenter le retrait", "Increase indent")} disabled={disabled} onMouseDown={keepFocus} onClick={() => indent(1)}><Icon name="indent" /></button>
      </div>
      <div className="rb-row">
        <Menu testId="heading-menu" trigger={(open) => (
          <button type="button" className="rb-small" disabled={disabled} onMouseDown={keepFocus} onClick={open} data-testid="heading" title={tr("Niveau de titre du paragraphe", "Paragraph heading level")}>
            <Icon name="heading" /> <span>{p?.heading ? tr(`Titre ${p.heading - 1}`, `Heading ${p.heading - 1}`) : 'Normal'}</span> <Icon name="chevronDown" size={10} />
          </button>
        )}>
          {(close) =>
            [null, 2, 3, 4].map((h) => (
              <button key={h ?? 0} type="button" role="menuitem" className={`menu-item heading-item h${h ?? 0}`} onMouseDown={keepFocus} onClick={() => (close(), heading(h))}>
                {h ? tr(`Titre ${h - 1}`, `Heading ${h - 1}`) : tr('Texte normal', 'Normal text')}
                <kbd>{h ? '#'.repeat(h) : '¶'}</kbd>
              </button>
            ))
          }
        </Menu>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector sections                                                  */
/* ------------------------------------------------------------------ */

const ARROWS: { id: ArrowHead; label: string }[] = [
  { id: 'none', label: tr('Aucune', 'None') },
  { id: 'triangle', label: 'Triangle' },
  { id: 'arrow', label: tr('Ouverte', 'Open') },
  { id: 'stealth', label: tr('Furtive', 'Stealth') },
  { id: 'diamond', label: tr('Losange', 'Diamond') },
  { id: 'oval', label: tr('Rond', 'Round') },
];
const SIDES: { id: ConnectorSide; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'top', label: tr('Haut', 'Top') },
  { id: 'right', label: tr('Droite', 'Right') },
  { id: 'bottom', label: tr('Bas', 'Bottom') },
  { id: 'left', label: tr('Gauche', 'Left') },
];

/** Range input that previews while dragging and commits once on release. */
function Slider({ value, min, max, step, label, testId, onPreview, onCommit }: { value: number; min: number; max: number; step: number; label: string; testId?: string; onPreview: (v: number) => void; onCommit: (v: number) => void }) {
  const commit = (e: React.SyntheticEvent<HTMLInputElement>) => onCommit(Number(e.currentTarget.value));
  return (
    <input type="range" className="grow" min={min} max={max} step={step} value={value} aria-label={label} data-testid={testId} onChange={(e) => onPreview(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} />
  );
}

/** Shape kind, corners, outline and arrowheads; connector routing and ends. */
export function ShapeSections({ r, upd }: { r: ResolvedElement; upd: (p: ElementPatch) => void }) {
  const el = r.element;
  const slide = useEditor(currentSlide)!;
  const style = (k: string, v: unknown) => upd({ style: { [k]: v } });
  const preview = (s: Record<string, unknown>) => useEditor.getState().preview([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: { style: s } }]);
  const isLine = (el.type === 'shape' && el.shape === 'line') || el.type === 'connector';
  const others = slide.elements.filter((e) => e.id !== el.id && e.type !== 'connector');
  return (
    <>
      {el.type === 'shape' && (
        <Section title={tr("Forme", "Shape")}>
          <ShapeGallery
            testId="change-shape-menu"
            onPick={(shape) => upd({ shape })}
            trigger={(open) => (
              <button type="button" className="btn shape-pick" onClick={open} data-testid="change-shape">
                <ShapeIcon shape={el.shape} /> <span className="grow">{SHAPE_LABEL[el.shape] ?? el.shape}</span> <Icon name="chevronDown" size={10} />
              </button>
            )}
          />
          {(el.shape === 'roundRect' || el.shape === 'snip1Rect') && (
            <div className="row radius-row">
              <Icon name="radius" />
              <Slider
                value={r.style.radius ?? Math.min(r.box.w, r.box.h) * 0.15}
                min={0}
                max={Math.round((Math.min(r.box.w, r.box.h) / 2) * 100) / 100}
                step={0.01}
                label={tr("Rayon des coins", "Corner radius")}
                testId="field-radius"
                onPreview={(v) => preview({ radius: v })}
                onCommit={(v) => style('radius', Math.round(v * 1000) / 1000)}
              />
              <NumField label="R" unit="in" value={r.style.radius ?? undefined} onCommit={(v) => style('radius', Math.max(0, v))} />
            </div>
          )}
        </Section>
      )}

      {el.type === 'connector' && (
        <Section title={tr("Connecteur", "Connector")}>
          <div className="seg" role="radiogroup" aria-label={tr("Tracé", "Route")}>
            {(['straight', 'elbow', 'curved'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={(el.route ?? 'straight') === k} className={`ibtn has-label${(el.route ?? 'straight') === k ? ' is-active' : ''}`} onClick={() => upd({ route: k })} data-testid={`route-${k}`}>
                {{ straight: tr('Droit', 'Straight'), elbow: tr('Coudé', 'Elbow'), curved: tr('Courbe', 'Curved') }[k]}
              </button>
            ))}
          </div>
          <div className="grid2">
            <label className="field">
              <span>{tr('De', 'From')}</span>
              <select className="select" value={el.from} onChange={(e) => upd({ from: e.target.value })}>
                {others.map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{tr('Vers', 'To')}</span>
              <select className="select" value={el.to} onChange={(e) => upd({ to: e.target.value })}>
                {others.map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{tr('Côté départ', 'Start side')}</span>
              <select className="select" value={el.fromPoint ? 'free' : (el.fromSide ?? 'auto')} onChange={(e) => upd({ fromSide: e.target.value as ConnectorSide, fromPoint: null })}>
                {el.fromPoint && <option value="free" disabled>{tr('Libre', 'Free')} ({Math.round(el.fromPoint[0] * 100)} %, {Math.round(el.fromPoint[1] * 100)} %)</option>}
                {SIDES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{tr('Côté arrivée', 'End side')}</span>
              <select className="select" value={el.toPoint ? 'free' : (el.toSide ?? 'auto')} onChange={(e) => upd({ toSide: e.target.value as ConnectorSide, toPoint: null })}>
                {el.toPoint && <option value="free" disabled>{tr('Libre', 'Free')} ({Math.round(el.toPoint[0] * 100)} %, {Math.round(el.toPoint[1] * 100)} %)</option>}
                {SIDES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="btn" onClick={() => upd({ from: el.to, to: el.from, fromSide: el.toSide ?? 'auto', toSide: el.fromSide ?? 'auto', fromPoint: el.toPoint ?? null, toPoint: el.fromPoint ?? null })}>{tr('⇄ Inverser le sens', '⇄ Reverse direction')}</button>
        </Section>
      )}

      {(el.type === 'text' || (el.type === 'shape' && !isLine)) && (
        <Section title={tr('Remplissage', 'Fill')}>
          <ColorPicker label={el.type === 'text' ? tr('Fond', 'Background') : tr('Couleur', 'Color')} value={el.style?.fill} onChange={(v) => style('fill', v)} allowNone testId="color-fill" />
          {el.type === 'shape' && (
            <label className="field">
              <span>{tr('Transparence', 'Transparency')} · {r.style.transparency} %</span>
              <Slider value={r.style.transparency} min={0} max={100} step={5} label={tr("Transparence", "Transparency")} onPreview={(v) => preview({ transparency: v })} onCommit={(v) => style('transparency', v || null)} />
            </label>
          )}
        </Section>
      )}

      {(
        <Section title={isLine ? tr('Trait', 'Line') : tr('Contour', 'Outline')}>
          <ColorPicker label={tr('Couleur', 'Color')} value={el.style?.line} onChange={(v) => style('line', v)} allowNone={!isLine} testId="color-line" />
          <div className="row">
            <NumField label={tr('Ép.', 'W.')} unit="pt" step={0.25} value={el.type === 'table' ? (el.style?.lineWidth ?? 0.5) : r.style.lineWidth} onCommit={(v) => style('lineWidth', Math.max(0, v))} testId="field-line-width" />
            <div className="seg" role="radiogroup" aria-label={tr('Type de trait', 'Dash type')}>
              {(['solid', 'dash', 'dot'] as const).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={r.style.dash === d} className={`ibtn dash-btn${r.style.dash === d ? ' is-active' : ''}`} title={{ solid: tr('Continu', 'Solid'), dash: tr('Tirets', 'Dashed'), dot: tr('Pointillés', 'Dotted') }[d]} aria-label={{ solid: tr('Continu', 'Solid'), dash: tr('Tirets', 'Dashed'), dot: tr('Pointillés', 'Dotted') }[d]} onClick={() => style('dash', d === 'solid' ? null : d)} data-testid={`dash-${d}`}>
                  <span className="border-sample" style={{ borderTopStyle: d === 'dash' ? 'dashed' : d === 'dot' ? 'dotted' : 'solid', borderTopWidth: 2 }} />
                </button>
              ))}
            </div>
          </div>
          {isLine && (
            <div className="grid2">
              <label className="field">
                <span>{tr('Début', 'Start')}</span>
                <select className="select" value={r.style.startArrow} data-testid="start-arrow" onChange={(e) => style('startArrow', e.target.value)}>
                  {ARROWS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{tr('Fin', 'End')}</span>
                <select className="select" value={r.style.endArrow} data-testid="end-arrow" onChange={(e) => style('endArrow', e.target.value)}>
                  {ARROWS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
            </div>
          )}
        </Section>
      )}
    </>
  );
}
