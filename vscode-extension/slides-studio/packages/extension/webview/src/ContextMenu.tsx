import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { explicitStyle, isDiagramSrc, paletteTokens, resolveSlide, tr, uniqueId, type ElementStyle, type Mutation, type ResolvedElement, type SlideNode } from '@corporate-slides/core';
import { Icon, type IconName } from './icons';
import { post } from './host';
import { currentSlide, useEditor } from './store';
import { alignMutations, deleteMutations, groupMutations, duplicateMutations, FONT_SIZES, inlineEditor, stepFontSize, type AlignMode, type RunFormat } from './Format';
import { copyFormat, copyFromRibbon, hasCopiedFormat, pasteFormat, pasteFromRibbon } from './clipboard';

/*
 * Right-click menu of the canvas, as in PowerPoint: a clipboard quick bar, then the commands that
 * apply to what was clicked (the selection, or the slide itself). Keyboard: arrows move, → / ←
 * open and close submenus, Enter runs, Escape closes. Every command reuses the ribbon's mutations.
 */

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
  /** Color chip shown in place of the icon. */
  swatch?: string;
}
type Entry = Cmd | 'sep';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const key = (k: string) => (MAC ? k.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : tr(k.replace(/Shift/g, 'Maj').replace(/Delete/g, 'Suppr').replace(/Enter/g, 'Entrée'), k));

/** Commands for the current target, built from the editor state at open time. */
function useCommands(target: 'element' | 'slide' | 'text' | 'text'): { quick: Cmd[]; entries: Entry[] } {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  const doc = st.doc;
  const master = st.master;
  if (!slide || !doc || !master) return { quick: [], entries: [] };
  const ro = st.readOnly;
  const rs = resolveSlide(slide, master).elements.filter((r) => st.selected.includes(r.element.id));
  const one = rs.length === 1 ? rs[0]! : null;
  const el = one?.element;
  const { mutate, select, set } = st;
  const frame = { w: master.dimensions.width, h: master.dimensions.height };
  const all = (fn: (r: ResolvedElement) => Mutation) => () => mutate(rs.map(fn));
  if (target === 'text') return textCommands(master);
  const paste: Cmd = { id: 'paste', label: tr('Coller', 'Paste'), icon: 'paste', kbd: key('Ctrl+V'), disabled: ro, run: () => void pasteFromRibbon() };

  if (target === 'slide' || !rs.length) {
    const index = doc.slides.findIndex((s) => s.id === slide.id);
    const newId = () => uniqueId(slide.id.replace(/-\d+$/, '') || 'slide', doc.slides.map((x) => x.id));
    return {
      quick: [],
      entries: [
        paste,
        { id: 'select-all', label: tr('Tout sélectionner', 'Select all'), icon: 'selectAll', kbd: key('Ctrl+A'), disabled: !slide.elements.length, run: () => select(slide.id, slide.elements.filter((x) => !x.hidden).map((x) => x.id)) },
        'sep',
        {
          id: 'new-slide', label: tr('Nouvelle diapositive', 'New slide'), icon: 'plus', disabled: ro, run: () => {
            const id = newId();
            mutate([{ kind: 'addSlide', slideId: id, layout: slide.layout, afterSlideId: slide.id }]);
            select(id, []);
          },
        },
        { id: 'duplicate-slide', label: tr('Dupliquer la diapositive', 'Duplicate slide'), icon: 'duplicate', disabled: ro, run: () => mutate([{ kind: 'duplicateSlide', slideId: slide.id, newSlideId: newId() }]) },
        {
          id: 'layout', label: tr('Disposition', 'Layout'), icon: 'layout', disabled: ro,
          items: master.layouts.map((l) => ({ id: `layout-${l.id}`, label: l.name, checked: l.id === slide.layout || l.aliases.includes(slide.layout), run: () => mutate([{ kind: 'setSlideLayout', slideId: slide.id, layout: l.aliases[0] ?? l.id }]) })),
        },
        'sep',
        { id: 'grid', label: tr('Grille', 'Grid'), icon: 'grid', checked: st.showGrid, run: st.toggleGrid },
        { id: 'snap', label: tr('Magnétisme', 'Snap to guides'), icon: 'magnet', checked: st.snap, run: st.toggleSnap },
        { id: 'reveal-slide', label: tr('Voir dans la source', 'Show in source'), icon: 'code', run: () => post({ type: 'reveal', slideId: slide.id }) },
        'sep',
        { id: 'delete-slide', label: tr('Supprimer la diapositive', 'Delete slide'), icon: 'trash', danger: true, disabled: ro || doc.slides.length <= 1, run: () => (mutate([{ kind: 'deleteSlide', slideId: slide.id }]), select(doc.slides[Math.max(0, index - 1)]?.id ?? null, [])) },
      ],
    };
  }

  const editable = el && (el.type === 'text' || el.type === 'table' || (el.type === 'shape' && el.shape !== 'line'));
  const diagram = el?.type === 'image' && isDiagramSrc(el.src) ? el.src : null;
  const locked = rs.every((r) => r.element.locked);
  const align = (mode: AlignMode) => () => mutate(alignMutations(slide.id, rs, mode, frame));
  const order = (direction: 'front' | 'forward' | 'backward' | 'back') => all((r) => ({ kind: 'reorderElement', slideId: slide.id, elementId: r.element.id, direction }));
  const solo = rs.length === 1;
  const entries: Entry[] = [
    ...(editable ? [{ id: 'edit', label: el!.type === 'table' ? tr('Modifier le tableau', 'Edit table') : tr('Modifier le texte', 'Edit text'), icon: 'edit' as const, kbd: key('Enter'), disabled: ro || locked, run: () => st.setEditing(el!.id) }] : []),
    ...(diagram ? [{ id: 'edit-gmc', label: tr('Modifier le diagramme', 'Edit diagram'), icon: 'diagram' as const, disabled: ro, run: () => set({ gmcEdit: diagram }) }] : []),
    { id: 'copy-format', label: tr('Copier la mise en forme', 'Copy formatting'), icon: 'brush', kbd: key('Ctrl+Shift+C'), disabled: !solo, run: () => void copyFormat() },
    { id: 'paste-format', label: tr('Coller la mise en forme', 'Paste formatting'), icon: 'brush', kbd: key('Ctrl+Shift+V'), disabled: ro || !hasCopiedFormat(), run: pasteFormat },
    'sep',
    {
      id: 'order', label: tr('Ordre', 'Order'), icon: 'layers', disabled: ro,
      items: [
        { id: 'front', label: tr('Mettre au premier plan', 'Bring to front'), icon: 'front', run: order('front') },
        { id: 'forward', label: tr('Avancer', 'Bring forward'), icon: 'forward', run: order('forward') },
        { id: 'backward', label: tr('Reculer', 'Send backward'), icon: 'backward', run: order('backward') },
        { id: 'back', label: tr('Mettre à l’arrière-plan', 'Send to back'), icon: 'back', run: order('back') },
      ],
    },
    {
      id: 'align', label: solo ? tr('Aligner sur la diapositive', 'Align to slide') : tr('Aligner', 'Align'), icon: 'alignLeft', disabled: ro || locked || el?.type === 'connector',
      items: [
        { id: 'a-left', label: tr('À gauche', 'Left'), icon: 'alignLeft', run: align('left') },
        { id: 'a-hcenter', label: tr('Au centre', 'Center'), icon: 'alignCenter', run: align('hcenter') },
        { id: 'a-right', label: tr('À droite', 'Right'), icon: 'alignRight', run: align('right') },
        'sep',
        { id: 'a-top', label: tr('En haut', 'Top'), icon: 'vTop', run: align('top') },
        { id: 'a-vcenter', label: tr('Au milieu', 'Middle'), icon: 'vMiddle', run: align('vcenter') },
        { id: 'a-bottom', label: tr('En bas', 'Bottom'), icon: 'vBottom', run: align('bottom') },
        ...(rs.length >= 3
          ? (['sep', { id: 'a-hdist', label: tr('Répartir horizontalement', 'Distribute horizontally'), run: align('hdistribute') }, { id: 'a-vdist', label: tr('Répartir verticalement', 'Distribute vertically'), run: align('vdistribute') }] as Entry[])
          : []),
      ],
    },
    ...(rs.length > 1 || rs.some((r) => r.element.group)
      ? [
          rs.length > 1 && !rs.every((r) => r.element.group && r.element.group === rs[0]!.element.group)
            ? { id: 'group', label: tr('Grouper', 'Group'), icon: 'group' as const, kbd: key('Ctrl+G'), disabled: ro, run: () => mutate(groupMutations(slide, rs.map((r) => r.element.id), true)) }
            : { id: 'ungroup', label: tr('Dissocier', 'Ungroup'), icon: 'ungroup' as const, kbd: key('Ctrl+Shift+G'), disabled: ro, run: () => mutate(groupMutations(slide, rs.map((r) => r.element.id), false)) },
        ]
      : []),
    ...(el?.type === 'connector'
      ? [
          {
            id: 'route', label: tr('Tracé', 'Route'), icon: 'connector' as const, disabled: ro,
            items: (['straight', 'elbow', 'curved'] as const).map((k) => ({ id: `route-${k}`, label: { straight: tr('Droit', 'Straight'), elbow: tr('Coudé', 'Elbow'), curved: tr('Courbe', 'Curved') }[k], checked: (el.route ?? 'straight') === k, run: () => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: { route: k } }]) })),
          },
          { id: 'reverse', label: tr('Inverser le sens', 'Reverse direction'), icon: 'refresh' as const, disabled: ro, run: () => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: { from: el.to, to: el.from, fromSide: el.toSide ?? 'auto', toSide: el.fromSide ?? 'auto', fromPoint: el.toPoint ?? null, toPoint: el.fromPoint ?? null } }]) },
        ]
      : [{ id: 'connect', label: tr('Relier à un autre élément', 'Connect to another element'), icon: 'connector' as const, disabled: ro || !solo, run: () => set({ connectFrom: el!.id }) }]),
    ...(st.design && one ? placeholderConversion(slide, one, ro) : []),
    'sep',
    { id: 'lock', label: locked ? tr('Déverrouiller', 'Unlock') : tr('Verrouiller', 'Lock'), icon: locked ? 'unlock' : 'lock', disabled: ro, run: all((r) => ({ kind: 'updateElement', slideId: slide.id, elementId: r.element.id, patch: { locked: !locked } })) },
    { id: 'hide', label: tr('Masquer', 'Hide'), icon: 'eyeOff', disabled: ro, run: () => (mutate(rs.map((r) => ({ kind: 'updateElement', slideId: slide.id, elementId: r.element.id, patch: { hidden: true } }))), select(slide.id, [])) },
    ...(solo ? [{ id: 'reveal', label: tr('Voir dans la source', 'Show in source'), icon: 'code' as const, run: () => post({ type: 'reveal', slideId: slide.id, elementId: el!.id }) }] : []),
    'sep',
    { id: 'delete', label: rs.length > 1 ? tr(`Supprimer les ${rs.length} éléments`, `Delete ${rs.length} elements`) : tr('Supprimer', 'Delete'), icon: 'trash', kbd: key('Delete'), danger: true, disabled: ro, run: () => (mutate(deleteMutations(slide, rs.map((r) => r.element.id))), select(slide.id, [])) },
  ];
  return {
    quick: [
      { id: 'cut', label: tr('Couper', 'Cut'), icon: 'cut', kbd: key('Ctrl+X'), disabled: ro, run: () => copyFromRibbon(true) },
      { id: 'copy', label: tr('Copier', 'Copy'), icon: 'copy', kbd: key('Ctrl+C'), run: () => copyFromRibbon(false) },
      paste,
      {
        id: 'duplicate', label: tr('Dupliquer', 'Duplicate'), icon: 'duplicate', kbd: key('Ctrl+D'), disabled: ro || rs.every((r) => r.element.type === 'connector'), run: () => {
          const { ms, ids } = duplicateMutations(slide, rs);
          mutate(ms);
          select(slide.id, ids);
        },
      },
    ],
    entries,
  };
}

/**
 * Layout designer: a text box (or rectangle) becomes a placeholder and a placeholder a plain
 * element, keeping exactly the look it had (inherited style made explicit).
 */
function placeholderConversion(slide: SlideNode, r: ResolvedElement, ro: boolean): Cmd[] {
  const el = r.element;
  const { mutate, select } = useEditor.getState();
  const style = explicitStyle(r) as Record<string, unknown>;
  if (el.type === 'text' && el.placeholder) {
    return [{ id: 'to-element', label: tr('Convertir en élément', 'Convert to element'), icon: 'text', disabled: ro, run: () => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: { placeholder: null, style } }]) }];
  }
  const shape = el.type === 'shape' && (el.shape === 'rect' || el.shape === 'roundRect');
  if (el.type !== 'text' && !shape) return [];
  const taken = slide.elements.map((e) => e.placeholder ?? '');
  const key = taken.includes('body') ? uniqueId('body', taken) : 'body';
  const run = () => {
    if (el.type === 'text') return mutate([{ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: { placeholder: key, style } }]);
    // Placeholders are text frames: the rectangle's fill, outline and corners carry over as box style.
    const id = uniqueId(key, slide.elements.map((e) => e.id));
    const { x, y, w, h } = r.box;
    const paragraphs = el.type === 'shape' ? (el.paragraphs ?? []) : [];
    mutate([{ kind: 'deleteElement', slideId: slide.id, elementId: el.id }, { kind: 'addElement', slideId: slide.id, element: { id, type: 'text', placeholder: key, x, y, w, h, paragraphs, style: style as ElementStyle } }]);
    select(slide.id, [id]);
  };
  return [{ id: 'to-placeholder', label: tr('Convertir en espace réservé', 'Convert to placeholder'), icon: 'layout', disabled: ro, run }];
}

/** Selected text inside the inline editor: clipboard, character marks, size and color of the selection. */
function textCommands(master: NonNullable<ReturnType<typeof useEditor.getState>['master']>): { quick: Cmd[]; entries: Entry[] } {
  const ed = inlineEditor.current;
  const fmt = (f: RunFormat) => () => void ed?.format(f);
  const exec = (cmd: 'cut' | 'copy') => () => (ed?.restoreRange(), document.execCommand(cmd));
  const state = (cmd: string) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };
  const size = ed?.selectionSize() ?? null;
  const base = paletteTokens(master).filter((t) => t.token.split('.').length === 2);
  return {
    quick: [
      { id: 'cut', label: tr('Couper', 'Cut'), icon: 'cut', kbd: key('Ctrl+X'), run: exec('cut') },
      { id: 'copy', label: tr('Copier', 'Copy'), icon: 'copy', kbd: key('Ctrl+C'), run: exec('copy') },
      {
        id: 'paste', label: tr('Coller', 'Paste'), icon: 'paste', kbd: key('Ctrl+V'), run: () => {
          ed?.restoreRange();
          void navigator.clipboard?.readText().then((t) => document.execCommand('insertText', false, t), () => undefined);
        },
      },
      { id: 'clear-format', label: tr('Effacer', 'Clear'), icon: 'clearFormat', run: fmt('clear') },
    ],
    entries: [
      { id: 'bold', label: tr('Gras', 'Bold'), icon: 'bold', kbd: key('Ctrl+B'), checked: state('bold') || undefined, run: fmt({ bold: true }) },
      { id: 'italic', label: tr('Italique', 'Italic'), icon: 'italic', kbd: key('Ctrl+I'), checked: state('italic') || undefined, run: fmt({ italic: true }) },
      { id: 'underline', label: tr('Souligné', 'Underline'), icon: 'underline', kbd: key('Ctrl+U'), checked: state('underline') || undefined, run: fmt({ underline: true }) },
      { id: 'small-caps', label: tr('Petites majuscules', 'Small caps'), icon: 'smallCaps', run: fmt({ caps: 'small' }) },
      { id: 'all-caps', label: tr('Tout en majuscules', 'All caps'), icon: 'allCaps', run: fmt({ caps: 'all' }) },
      'sep',
      {
        id: 'size', label: size ? `${tr('Taille', 'Size')} · ${size} pt` : tr('Taille', 'Size'), icon: 'heading',
        items: [{ id: 'size-auto', label: tr('Taille de la zone', 'Box size'), run: fmt({ size: null }) }, 'sep', ...FONT_SIZES.map((s) => ({ id: `size-${s}`, label: `${s} pt`, checked: s === size || undefined, run: fmt({ size: s }) }))],
      },
      { id: 'grow', label: tr('Agrandir le texte', 'Increase text size'), icon: 'fontGrow', kbd: key('Ctrl+Shift+>'), run: fmt({ size: stepFontSize(size ?? 18, 1) }) },
      { id: 'shrink', label: tr('Réduire le texte', 'Decrease text size'), icon: 'fontShrink', kbd: key('Ctrl+Shift+<'), run: fmt({ size: stepFontSize(size ?? 18, -1) }) },
      {
        id: 'color', label: tr('Couleur du texte', 'Text color'), icon: 'fillColor',
        items: [{ id: 'color-auto', label: tr('Automatique', 'Automatic'), run: fmt({ color: null }) }, 'sep', ...base.map((t) => ({ id: `color-${t.token}`, label: t.token.replace('theme.', ''), swatch: `#${t.hex}`, run: fmt({ color: t.token }) }))],
      },
    ],
  };
}

/** Focusable items of one menu panel (not of its submenus). */
const itemsOf = (panel: HTMLElement | null) => (panel ? [...panel.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"], :scope > [role="menuitemcheckbox"], :scope > [role="menuitemradio"], :scope > .ctx-quick > [role="menuitem"], :scope > .ctx-row > [role="menuitem"]')].filter((b) => !b.disabled) : []);

function moveFocus(panel: HTMLElement | null, dir: 1 | -1 | 'first' | 'last') {
  const list = itemsOf(panel);
  if (!list.length) return;
  const i = list.indexOf(document.activeElement as HTMLButtonElement);
  const next = dir === 'first' ? 0 : dir === 'last' ? list.length - 1 : (i + dir + list.length) % list.length;
  list[next]!.focus();
}

function Panel({ entries, quick, onRun, origin, parentRef, sub, autoFocus }: { entries: Entry[]; quick?: Cmd[]; onRun: (c: Cmd) => void; origin?: { x: number; y: number }; parentRef?: React.RefObject<HTMLElement | null>; sub?: { close: () => void }; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  /** Open submenu; `key` when opened from the keyboard (its first item takes focus). */
  const [open, setOpenState] = useState<{ id: string; key: boolean } | null>(null);
  const setOpen = (id: string | null, viaKey = false) => setOpenState(id ? { id, key: viaKey } : null);
  const timer = useRef<number>(0);

  // Place in the viewport: at the cursor (flipped near edges) or beside the parent item.
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const { innerWidth: W, innerHeight: H } = window;
    const w = m.offsetWidth, h = m.offsetHeight;
    let x: number, y: number, ox = 'left', oy = 'top';
    if (origin) {
      x = origin.x + w > W - 8 ? Math.max(8, origin.x - w) : origin.x;
      y = origin.y + h > H - 8 ? Math.max(8, origin.y - h) : origin.y;
      if (x < origin.x) ox = 'right';
      if (y < origin.y) oy = 'bottom';
    } else {
      const a = parentRef!.current!.getBoundingClientRect();
      x = a.right + w > W - 8 ? Math.max(8, a.left - w + 4) : a.right - 4;
      y = Math.max(8, Math.min(a.top - 6, H - h - 8));
    }
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.style.transformOrigin = `${oy} ${ox}`;
    m.style.maxHeight = `${H - 16}px`;
    if (autoFocus) moveFocus(m, 'first');
  }, [origin, parentRef, autoFocus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.ctx-menu') !== ref.current) return; // a submenu handles its own keys
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
      e.preventDefault();
      moveFocus(ref.current, k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : k === 'Home' ? 'first' : 'last');
    } else if (k === 'ArrowRight' && document.activeElement?.getAttribute('aria-haspopup')) {
      e.preventDefault();
      setOpen((document.activeElement as HTMLElement).dataset.cmd ?? null, true);
    } else if (k === 'ArrowLeft' && sub) {
      e.preventDefault();
      e.stopPropagation();
      sub.close();
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && document.activeElement?.closest('.ctx-quick')) {
      e.preventDefault();
      const q = [...ref.current!.querySelectorAll<HTMLButtonElement>('.ctx-quick > button:not(:disabled)')];
      const i = q.indexOf(document.activeElement as HTMLButtonElement);
      q[(i + (k === 'ArrowRight' ? 1 : -1) + q.length) % q.length]?.focus();
    }
  };

  const hover = (id: string | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(id), id ? 90 : 220);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div ref={ref} className={`ctx-menu${sub ? ' is-sub' : ''}`} role="menu" onKeyDown={onKeyDown} data-testid={sub ? 'context-submenu' : 'context-menu'} onContextMenu={(e) => e.preventDefault()}>
      {quick && quick.length > 0 && (
        <>
          <div className="ctx-quick" role="group" aria-label={tr('Presse-papiers', 'Clipboard')}>
            {quick.map((c) => (
              <button key={c.id} type="button" role="menuitem" className="ctx-quick-btn" disabled={c.disabled} title={`${c.label} (${c.kbd})`} aria-label={c.label} aria-keyshortcuts={c.kbd} data-cmd={c.id} data-testid={`ctx-${c.id}`} onClick={() => onRun(c)} onPointerEnter={(e) => (e.currentTarget.focus({ preventScroll: true }), hover(null))}>
                <Icon name={c.icon!} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <div className="ctx-sep" role="separator" />
        </>
      )}
      {entries.map((e, i) => {
        if (e === 'sep') return entries[i - 1] && entries[i - 1] !== 'sep' && i < entries.length - 1 ? <div key={`s${i}`} className="ctx-sep" role="separator" /> : null;
        return <Row key={e.id} c={e} open={open?.id === e.id} openedByKey={!!open?.key} onHover={hover} onKeyOpen={(id) => setOpen(id, true)} onRun={onRun} onClose={() => setOpen(null)} />;
      })}
    </div>
  );
}

function Row({ c, open, openedByKey, onHover, onKeyOpen, onRun, onClose }: { c: Cmd; open: boolean; openedByKey: boolean; onHover: (id: string | null) => void; onKeyOpen: (id: string) => void; onRun: (c: Cmd) => void; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const role = c.checked !== undefined ? 'menuitemcheckbox' : 'menuitem';
  const icon: ReactNode = c.swatch ? <span className={`ctx-swatch${c.checked ? ' is-checked' : ''}`} style={{ background: c.swatch }} /> : c.checked ? <Icon name="check" className="ctx-check" /> : c.icon ? <Icon name={c.icon} /> : <span className="ctx-icon-pad" />;
  const subApi = useRef({ close: () => (onClose(), ref.current?.focus()) });
  subApi.current.close = () => (onClose(), ref.current?.focus());
  return (
    <>
      <button
        ref={ref}
        type="button"
        role={role}
        aria-checked={c.checked}
        aria-haspopup={c.items ? 'menu' : undefined}
        aria-expanded={c.items ? open : undefined}
        aria-keyshortcuts={c.kbd}
        className={`ctx-item${c.danger ? ' is-danger' : ''}${open ? ' is-open' : ''}`}
        disabled={c.disabled || (c.items && !c.items.some((x) => x !== 'sep'))}
        data-cmd={c.id}
        data-testid={`ctx-${c.id}`}
        onPointerEnter={() => (ref.current?.focus({ preventScroll: true }), onHover(c.items ? c.id : null))}
        onClick={(e) => (c.items ? (e.detail === 0 ? onKeyOpen(c.id) : onHover(c.id)) : onRun(c))}
      >
        <span className="ctx-icon">{icon}</span>
        <span className="ctx-label">{c.label}</span>
        {c.kbd && <kbd>{c.kbd}</kbd>}
        {c.items && <Icon name="next" size={12} className="ctx-more" />}
      </button>
      {open && c.items && <Panel entries={c.items} onRun={onRun} parentRef={ref} sub={subApi.current} autoFocus={openedByKey} />}
    </>
  );
}

/** The canvas context menu, mounted once; opened through `contextMenu` in the store. */
export function ContextMenu() {
  const menu = useEditor((s) => s.contextMenu);
  if (!menu) return null;
  return <OpenMenu key={`${menu.x}:${menu.y}:${menu.target}`} {...menu} />;
}

function OpenMenu({ x, y, target }: { x: number; y: number; target: 'element' | 'slide' | 'text' }) {
  const { quick, entries } = useCommands(target);
  const [origin] = useState({ x, y });
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef(document.activeElement as HTMLElement | null);
  const close = () => {
    useEditor.getState().set({ contextMenu: null });
    if (target === 'text') inlineEditor.current?.restoreRange();
    else restore.current?.focus?.();
  };
  useEffect(() => {
    const outside = (e: Event) => !root.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), close());
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('wheel', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('wheel', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  });
  const run = (c: Cmd) => {
    if (c.disabled || !c.run) return;
    useEditor.getState().set({ contextMenu: null });
    c.run();
  };
  return createPortal(
    <div ref={root} className="ctx-root">
      <Panel entries={entries} quick={quick} onRun={run} origin={origin} autoFocus />
    </div>,
    document.body,
  );
}
