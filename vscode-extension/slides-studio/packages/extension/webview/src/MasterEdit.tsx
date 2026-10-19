import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findLayout, layoutForSlide, patchMasterObjects, resolveColor, round4, staticObjectBox, tr, type Box, type CorporateMaster, type MasterOverride, type StaticObject } from '@corporate-slides/core';
import { PPI } from '@corporate-slides/renderer';
import { currentSlide, useEditor, type EditorState } from './store';
import { post } from './host';
import { Icon } from './icons';
import { ColorPicker, EditableId, IconButton, NumField, Section } from './Panels';

/*
 * Master editing mode (Design › Edit master): the static objects of the slide's layout (logos,
 * bands, footer texts…) become selectable. "This slide" stores a per-slide override in the deck;
 * "All slides" changes the corporate master itself, in every layout holding the same object.
 */

/** Patch keys set to `null` clear that part of a slide override. */
export type MasterPatch = { [K in keyof MasterOverride]?: MasterOverride[K] | null };

const ROLE_LABEL: Record<StaticObject['role'], string> = { logo: tr('Logo', 'Logo'), footer: tr('Pied de page', 'Footer'), date: tr('Date', 'Date'), label: tr('Étiquette', 'Label'), decoration: tr('Décoration', 'Decoration'), text: tr('Texte', 'Text') };

export function masterContext(s: Pick<EditorState, 'doc' | 'slideId' | 'master'>) {
  const slide = currentSlide(s as EditorState);
  const base = slide && s.master ? findLayout(s.master, slide.layout) : undefined;
  const layout = slide && base ? layoutForSlide(base, slide) : undefined;
  return { slide, base, layout };
}

/** Same as `masterContext`, for components (stable store slices, derived values computed here). */
function useMasterContext() {
  const doc = useEditor((s) => s.doc);
  const slideId = useEditor((s) => s.slideId);
  const master = useEditor((s) => s.master);
  return useMemo(() => masterContext({ doc, slideId, master }), [doc, slideId, master]);
}

const kindOf = (o: StaticObject) => Object.keys(o.object)[0] ?? '';

/** Literal RRGGBB (or `none`) for a palette choice; static objects carry literal colors. */
const literal = (v: string | null, master: CorporateMaster): string | null => (v === null || v === 'none' ? v : resolveColor(v, master));

/** Master as it was before an "all slides" drag preview (restored on cancel). */
let previewBase: CorporateMaster | null = null;

/** Apply (or with `preview`, only show) a change of master object `index`. */
export function applyMaster(index: number, patch: MasterPatch, preview = false) {
  const st = useEditor.getState();
  const { slide, base } = masterContext(st);
  if (!slide || !base || !st.master) return;
  if (st.masterEdit === 'all') {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)) as MasterOverride;
    const from = previewBase ?? st.master;
    if (preview) {
      previewBase = from;
      useEditor.setState({ master: patchMasterObjects(from, base.id, index, clean) });
      return;
    }
    previewBase = null;
    useEditor.setState({ master: patchMasterObjects(from, base.id, index, clean) });
    post({ type: 'editMaster', layoutId: base.id, index, patch: clean });
    return;
  }
  const next: Record<string, unknown> = { ...(slide.masterOverrides?.[String(index)] ?? {}) };
  for (const [k, v] of Object.entries(patch)) if (v === null) delete next[k]; else next[k] = v;
  const m = { kind: 'setMasterOverride' as const, slideId: slide.id, index, override: Object.keys(next).length ? (next as MasterOverride) : null };
  if (preview) st.preview([m]);
  else st.mutate([m]);
}

export function cancelMasterPreview() {
  if (previewBase) useEditor.setState({ master: previewBase });
  previewBase = null;
  useEditor.getState().cancelPreview();
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Drag (move, or resize with a handle) the selected master object; `frame` converts pointer pixels to inches. */
export function startMasterDrag(e: React.PointerEvent, index: number, box: Box, inPerPx: number, handle?: Handle) {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.clientX, sy = e.clientY;
  let last: MasterPatch | null = null;
  const move = (ev: PointerEvent) => {
    const dx = (ev.clientX - sx) * inPerPx, dy = (ev.clientY - sy) * inPerPx;
    if (!last && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    let { x, y, w, h } = box;
    if (!handle) (x += dx), (y += dy);
    else {
      if (handle.includes('w')) (x += dx), (w -= dx);
      if (handle.includes('e')) w += dx;
      if (handle.includes('n')) (y += dy), (h -= dy);
      if (handle.includes('s')) h += dy;
      w = Math.max(0.05, w);
      h = Math.max(0, h);
    }
    last = { x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
    applyMaster(index, last, true);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (last) applyMaster(index, last);
    else cancelMasterPreview();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/** Selection frame and resize handles of the selected master object (slide coordinates). */
export function MasterSelection({ zoom }: { zoom: number }) {
  const sel = useEditor((s) => s.masterSel);
  const { layout } = useMasterContext();
  const o = sel !== null ? layout?.objects[sel] : undefined;
  const b = o ? staticObjectBox(o.object) : null;
  if (sel === null || !o || !b) return null;
  const hs = 8 / zoom, stroke = 1.5 / zoom;
  return (
    <div className="master-selection" data-testid="master-selection" style={{ position: 'absolute', left: b.x * PPI, top: b.y * PPI, width: Math.max(b.w * PPI, 1), height: Math.max(b.h * PPI, 1), outline: `${stroke}px dashed var(--accent)`, pointerEvents: 'none' }}>
      {HANDLES.map((h) => (
        <div
          key={h}
          data-handle={h}
          onPointerDown={(e) => startMasterDrag(e, sel, b, 1 / (PPI * zoom), h)}
          style={{ position: 'absolute', left: `${h.includes('w') ? 0 : h.includes('e') ? 100 : 50}%`, top: `${h.includes('n') ? 0 : h.includes('s') ? 100 : 50}%`, width: hs, height: hs, marginLeft: -hs / 2, marginTop: -hs / 2, background: '#fff', border: `${stroke}px solid var(--accent)`, borderRadius: 2 / zoom, pointerEvents: 'auto', cursor: `${h}-resize` }}
        />
      ))}
      <span className="tag" style={{ fontSize: 11 / zoom, top: -18 / zoom }}>{ROLE_LABEL[o.role]} · {tr('masque', 'master')}</span>
    </div>
  );
}

/** Master text object `index` editable in place (plain text; footer / date come from the deck header). */
export function masterTextEditable(index: number): boolean {
  const o = masterContext(useEditor.getState()).layout?.objects[index];
  const raw = o?.object.text as { text?: unknown } | undefined;
  return !!raw && o!.role !== 'footer' && o!.role !== 'date' && (raw.text === undefined || typeof raw.text === 'string');
}

/** In-place editor of a master text object, over the canvas (committed on blur or unmount). */
export function MasterTextEditor({ index, onDone }: { index: number; onDone: () => void }) {
  const { layout } = useMasterContext();
  const o = layout?.objects[index];
  const raw = (o?.object.text ?? {}) as { text?: string; options?: Record<string, unknown> };
  const text = raw.text ?? '';
  const opts = raw.options ?? {};
  const b = o ? staticObjectBox(o.object) : null;
  const ref = useRef<HTMLDivElement | null>(null);
  const value = useRef(text);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (value.current !== text) applyMaster(index, { text: value.current });
    onDone();
  };
  useLayoutEffect(() => {
    const el = ref.current!;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    return commit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!b) return null;
  const m = (Array.isArray(opts.margin) ? opts.margin : [0.05, 0.1, 0.05, 0.1]) as number[];
  const px = (v: number) => v * PPI;
  return (
    <>
      <style>{`[data-master-object="${index}"]:not([data-master-ghost]) { visibility: hidden; }`}</style>
      <div
        ref={ref}
        className="inline-editor master-text-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-testid="master-text-editor"
        style={{
          position: 'absolute',
          left: px(b.x),
          top: px(b.y),
          width: Math.max(px(b.w), 20),
          minHeight: Math.max(px(b.h), 12),
          boxSizing: 'border-box',
          padding: `${px(m[0] ?? 0)}px ${px(m[1] ?? 0)}px ${px(m[2] ?? 0)}px ${px(m[3] ?? 0)}px`,
          fontFamily: `"${(opts.fontFace as string) ?? 'Arial'}", Arial, sans-serif`,
          fontSize: (((opts.fontSize as number) ?? 18) / 72) * PPI,
          color: `#${(opts.color as string) ?? '000000'}`,
          fontWeight: opts.bold ? 700 : 400,
          textAlign: (opts.align as React.CSSProperties['textAlign']) ?? 'left',
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          outline: '1.5px solid var(--accent)',
          cursor: 'text',
          pointerEvents: 'auto',
        }}
        onInput={(e) => (value.current = e.currentTarget.innerText.replace(/\n$/, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            ref.current?.blur();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {text}
      </div>
    </>
  );
}

/** Inspector of the selected master object. */
export function MasterInspector() {
  const sel = useEditor((s) => s.masterSel);
  const mode = useEditor((s) => s.masterEdit);
  const master = useEditor((s) => s.master);
  const { slide, layout, base } = useMasterContext();
  const o = sel !== null ? layout?.objects[sel] : undefined;
  if (!master || !slide || !base || sel === null || !o) {
    return (
      <>
        <div className="insp-head">
          <span className="insp-kind">{tr('Masque', 'Master')}</span>
          {base && <EditableId value={base.id} title={base.name} testId="layout-id" onRename={(newId) => post({ type: 'renameLayout', layoutId: base.id, newId })} />}
          <span className="grow" />
          {base && <IconButton icon="trash" label={tr('Supprimer la disposition', 'Delete layout')} testId="layout-delete" onClick={() => post({ type: 'deleteLayout', layoutId: base.id })} />}
        </div>
        <p className="hint insp-hint">
          {mode === 'all'
            ? tr('Cliquez un objet du masque (logo, bandeau, texte de pied…) : les modifications s’appliquent à toutes les diapositives utilisant ce masque.', 'Click a master object (logo, band, footer text…): changes apply to every slide using this master.')
            : tr('Cliquez un objet du masque (logo, bandeau, texte de pied…) : les modifications ne concernent que cette diapositive.', 'Click a master object (logo, band, footer text…): changes only affect this slide.')}
        </p>
      </>
    );
  }
  const kind = kindOf(o);
  const raw = Object.values(o.object)[0] as Record<string, unknown>;
  const opts = (kind === 'text' ? (raw.options as Record<string, unknown>) : raw) ?? {};
  const b = staticObjectBox(o.object)!;
  const ov = mode === 'slide' ? slide.masterOverrides?.[String(sel)] : undefined;
  const set = (p: MasterPatch) => applyMaster(sel, p);
  const hexOf = (v: unknown) => (typeof v === 'object' && v && 'color' in v ? String((v as { color?: string }).color ?? '') || undefined : undefined);
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{ROLE_LABEL[o.role]}</span>
        <code className="insp-id">{mode === 'all' ? tr('toutes les diapositives', 'all slides') : tr('cette diapositive', 'this slide')}</code>
        <span className="grow" />
        <IconButton icon={o.hidden ? 'eyeOff' : 'eye'} label={o.hidden ? tr('Afficher', 'Show') : tr('Masquer', 'Hide')} active={o.hidden} testId="master-hide" onClick={() => set({ hidden: !o.hidden })} />
        {mode === 'slide' && ov && <IconButton icon="refresh" label={tr('Rétablir le masque', 'Reset to master')} testId="master-reset" onClick={() => useEditor.getState().mutate([{ kind: 'setMasterOverride', slideId: slide.id, index: sel, override: null }])} />}
      </div>
      <Section title={tr('Position et taille', 'Position and size')}>
        <div className="grid2">
          <NumField label="X" unit="in" value={b.x} onCommit={(v) => set({ x: v })} />
          <NumField label="Y" unit="in" value={b.y} onCommit={(v) => set({ y: v })} />
          <NumField label={tr('L', 'W')} unit="in" value={b.w} onCommit={(v) => set({ w: Math.max(0, v) })} />
          <NumField label="H" unit="in" value={b.h} onCommit={(v) => set({ h: Math.max(0, v) })} />
        </div>
      </Section>
      {(kind === 'rect' || kind === 'text' || kind === 'line') && (
        <Section title={tr('Couleurs', 'Colors')}>
          <div className="stack">
            {kind !== 'line' && <ColorPicker label={tr('Remplissage', 'Fill')} value={hexOf(opts.fill)} allowNone onChange={(v) => set({ fill: literal(v, master) })} />}
            <ColorPicker label={tr('Contour', 'Outline')} value={hexOf(opts.line)} allowNone onChange={(v) => set({ line: literal(v, master) })} />
            {kind === 'text' && <ColorPicker label={tr('Texte', 'Text')} value={typeof opts.color === 'string' ? opts.color : undefined} onChange={(v) => set({ color: v === 'none' ? null : literal(v, master) })} />}
          </div>
        </Section>
      )}
      {kind === 'text' && <MasterText index={sel} text={typeof raw.text === 'string' ? raw.text : ''} fontSize={typeof opts.fontSize === 'number' ? opts.fontSize : undefined} role={o.role} />}
    </>
  );
}

function MasterText({ index, text, fontSize, role }: { index: number; text: string; fontSize?: number; role: StaticObject['role'] }) {
  const [value, setValue] = useState(text);
  return (
    <Section title={tr('Texte', 'Text')}>
      <NumField label={tr('Taille', 'Size')} unit="pt" step={1} value={fontSize} onCommit={(v) => applyMaster(index, { fontSize: Math.max(4, v) })} />
      {role === 'footer' || role === 'date' ? (
        <p className="hint">{tr('Texte fourni par l’en-tête de la présentation (footer / date).', 'Text comes from the presentation header (footer / date).')}</p>
      ) : (
        <textarea className="textarea" rows={3} value={value} key={text} aria-label={tr('Texte de l’objet du masque', 'Master object text')} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setValue(e.target.value)} onBlur={() => value !== text && applyMaster(index, { text: value })} />
      )}
    </Section>
  );
}

/** Ribbon controls: master editing mode and new layouts. */
export function MasterEditToggle({ disabled }: { disabled?: boolean }) {
  const mode = useEditor((s) => s.masterEdit);
  const { set } = useEditor.getState();
  return (
    <div className="seg seg-compact" role="radiogroup" aria-label={tr('Portée des modifications du masque', 'Scope of master changes')}>
      {(['slide', 'all'] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={disabled} className={`ibtn${mode === m ? ' is-active' : ''}`} data-testid={`master-scope-${m}`} onClick={() => {
          // "All slides" is the layout designer; "This slide" edits the layout objects on this slide only.
          const st = useEditor.getState();
          if (m === mode) return;
          if (m === 'all') return void (set({ masterEdit: null, masterSel: null }), st.enterDesign());
          st.exitDesign();
          set({ masterEdit: 'slide', masterSel: null });
        }}>
          {m === 'slide' ? tr('Cette diapositive', 'This slide') : tr('Toutes les diapositives', 'All slides')}
        </button>
      ))}
    </div>
  );
}

export const NEW_LAYOUT_SOURCES = [
  { id: 'blank', label: tr('Vierge', 'Blank'), hint: tr('Disposition vide, sur le même masque', 'Empty layout, on the same master') },
  { id: 'duplicate', label: tr('Copie de la disposition', 'Copy of the layout'), hint: tr('La disposition de la diapositive, avec ses modifications', 'The slide’s layout, with its changes') },
  { id: 'slide', label: tr('Depuis le rendu actuel', 'From the current rendering'), hint: tr('Textes libres, rectangles, traits et images de la diapositive deviennent la disposition', 'The slide’s free texts, rectangles, lines and pictures become the layout') },
] as const;

export function NewLayoutForm({ close }: { close: () => void }) {
  const slide = useEditor(currentSlide);
  const [name, setName] = useState(tr('Disposition personnalisée', 'Custom layout'));
  const create = (from: (typeof NEW_LAYOUT_SOURCES)[number]['id']) => {
    if (!slide || !name.trim()) return;
    post({ type: 'createLayout', slideId: slide.id, from, name: name.trim() });
    close();
  };
  return (
    <div className="new-layout" onKeyDown={(e) => e.stopPropagation()}>
      <label className="field">
        <span>{tr('Nom de la disposition', 'Layout name')}</span>
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} data-testid="new-layout-name" />
      </label>
      {NEW_LAYOUT_SOURCES.map((s) => (
        <button key={s.id} type="button" role="menuitem" className="menu-item menu-item-2l" disabled={!name.trim()} data-testid={`new-layout-${s.id}`} onClick={() => create(s.id)}>
          <Icon name={s.id === 'blank' ? 'shape' : s.id === 'duplicate' ? 'duplicate' : 'render'} />
          <span><strong>{s.label}</strong><span className="hint">{s.hint}</span></span>
        </button>
      ))}
    </div>
  );
}
