import { useMemo, useRef, useState, type ReactNode } from 'react';
import { frontToBack, groupParts, inGroup, isDiagramSrc, layerKey, layerTree, moveLayer, parentGroup, resolveSlide, tr, type LayerNode, type Mutation, type SlideElement } from '@corporate-slides/core';
import { currentSlide, useEditor } from './store';
import { Icon, type IconName } from './icons';
import { groupMutations, groupState } from './Format';


/*
 * Layers (Photoshop style): every element of the slide front → back, nested groups as folders.
 * Click selects (Ctrl / Shift add), a group row selects the whole group, the eye hides, the lock
 * locks (a group row does it for all its members), double-click renames, and rows drag to restack
 * or to move in / out of groups. Stacking is written as `z`, membership as the `group` path.
 */

type LNode = LayerNode<SlideElement>;
type Drop = { key: string; where: 'before' | 'after' | 'inside' };

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function typeIcon(el: SlideElement): IconName {
  switch (el.type) {
    case 'text':
      return 'text';
    case 'table':
      return 'table';
    case 'connector':
      return 'connector';
    case 'image':
      return isDiagramSrc(el.src) ? 'diagram' : 'image';
    case 'shape':
      return el.shape === 'line' ? 'line' : el.shape === 'ellipse' ? 'ellipse' : el.shape === 'triangle' ? 'triangle' : 'shape';
  }
}

/** Text shared by the slides (deck header): neither restacked nor changed from a slide. */
const isShared = (e: SlideElement) => e.type === 'text' && !!e.shared;

/** Placeholder text whose value can be shared deck-wide (Markdown decks, outside the layout designer). */
const shareable = (e: SlideElement) => {
  const st = useEditor.getState();
  return e.type === 'text' && !!e.placeholder && (!!e.shared || e.paragraphs.length > 0) && st.sourceKind === 'markdown' && !st.design;
};

const members = (n: LNode): SlideElement[] => (n.kind === 'element' ? [n.el] : n.children.flatMap(members));

/** One line of preview text, so text layers read like their content. */
function preview(el: SlideElement): string {
  const ps = el.type === 'text' || el.type === 'shape' ? el.paragraphs : undefined;
  const t = ps?.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim();
  if (t) return t;
  if (el.type === 'table') return el.rows[0]?.filter(Boolean).join(' · ') ?? '';
  if (el.type === 'image') return el.src.split('/').pop() ?? '';
  return '';
}

export function LayersPanel() {
  const slide = useEditor(currentSlide);
  const master = useEditor((s) => s.master);
  const selected = useEditor((s) => s.selected);
  const scope = useEditor((s) => s.groupScope);
  const readOnly = useEditor((s) => s.readOnly);
  const { mutate, select, set } = useEditor.getState();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [drop, setDrop] = useState<Drop | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => (slide ? layerTree(frontToBack(slide.elements)) : []), [slide]);
  if (!slide || !master) return null;
  const sel = new Set(selected);

  const patchAll = (els: SlideElement[], patch: (el: SlideElement) => Record<string, unknown>) =>
    mutate(els.filter((el) => !isShared(el)).map((el) => ({ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: patch(el) }) as Mutation));

  /** Restack / regroup after a drop: every element's `z` and changed `group` path. */
  const applyMove = (from: string, d: Drop) => {
    const r = moveLayer(tree, from, d.key, d.where);
    if (!r) return;
    const own = new Set(slide.elements.filter((e) => !isShared(e)).map((e) => e.id));
    const back = [...r.order].reverse().filter((id) => own.has(id));
    const ms: Mutation[] = [];
    const before = frontToBack(slide.elements).map((e) => e.id).reverse().filter((id) => own.has(id));
    const restacked = back.some((id, i) => before[i] !== id);
    for (const el of slide.elements) {
      if (isShared(el)) continue;
      const patch: Record<string, unknown> = {};
      if (restacked && el.z !== back.indexOf(el.id)) patch.z = back.indexOf(el.id);
      const g = r.groups.get(el.id);
      if ((g ?? undefined) !== (el.group ?? undefined)) patch.group = g ?? null;
      if (Object.keys(patch).length) ms.push({ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch });
    }
    if (ms.length) mutate(ms);
  };

  const pick = (n: LNode, e: React.MouseEvent) => {
    const ids = members(n).map((x) => x.id);
    // A group row enters its parent, so the group itself (not its outermost ancestor) is picked.
    if (n.kind === 'group') set({ groupScope: parentGroup(n.path) });
    else set({ groupScope: n.el.group ?? null });
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const cur = useEditor.getState().selected;
      const all = ids.every((id) => cur.includes(id));
      useEditor.setState({ selected: all ? cur.filter((id) => !ids.includes(id)) : [...new Set([...cur, ...ids])], editingId: null });
    } else if (n.kind === 'group') useEditor.setState({ selected: ids, editingId: null });
    else select(slide.id, ids);
  };

  const renameGroup = (path: string, last: string) => {
    if (!ID_RE.test(last)) return;
    const next = parentGroup(path) ? `${parentGroup(path)}/${last}` : last;
    if (next === path || slide.elements.some((e) => inGroup(e.group, next))) return;
    patchAll(slide.elements.filter((e) => inGroup(e.group, path)), (e) => ({ group: next + e.group!.slice(path.length) }));
  };

  const onDragOver = (e: React.DragEvent, n: LNode) => {
    if (!dragKey.current || readOnly) return;
    e.preventDefault();
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const f = (e.clientY - b.top) / b.height;
    const where = n.kind === 'group' && f > 0.28 && f < 0.72 ? 'inside' : f < 0.5 ? 'before' : 'after';
    const key = layerKey(n);
    if (drop?.key !== key || drop.where !== where) setDrop({ key, where });
  };

  const row = (n: LNode, depth: number): ReactNode => {
    const key = layerKey(n);
    const els = members(n);
    const isGroup = n.kind === 'group';
    const open = isGroup && !collapsed.has(n.path);
    const active = els.every((x) => sel.has(x.id));
    const hidden = els.every((x) => x.hidden);
    const locked = els.every((x) => x.locked);
    const label = isGroup ? n.path.slice(n.path.lastIndexOf('/') + 1) : (n.el.name ?? n.el.id);
    const shared = !isGroup && isShared(n.el);
    const sub = isGroup ? tr(`${els.length} éléments`, `${els.length} elements`) : shared ? `${tr('Partagé', 'Shared')} · ${preview(n.el)}` : preview(n.el);
    const dropCls = drop?.key === key ? ` drop-${drop.where}` : '';
    const inScope = isGroup && scope !== null && inGroup(scope, n.path);
    return (
      <div key={key} role="treeitem" aria-level={depth + 1} aria-selected={active} aria-expanded={isGroup ? open : undefined}>
        <div
          className={`layer-row${active ? ' is-selected' : ''}${hidden ? ' is-hidden' : ''}${inScope ? ' is-scope' : ''}${dropCls}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          tabIndex={0}
          draggable={!readOnly && !shared && renaming !== key}
          title={shared ? tr('Texte partagé par les diapositives (en-tête de la présentation) : il garde sa place.', 'Text shared by the slides (deck header): it keeps its place.') : undefined}
          data-testid={`layer-${key}`}
          onClick={(e) => pick(n, e)}
          onDoubleClick={() => !readOnly && !shared && setRenaming(key)}
          onKeyDown={(e) => {
            if (e.key === 'F2') setRenaming(key);
            else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick(n, e as unknown as React.MouseEvent);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('.layer-row') ?? [])];
              rows[rows.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
            } else if (isGroup && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) toggle(n.path, e.key === 'ArrowRight');
          }}
          onDragStart={(e) => {
            dragKey.current = key;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', label);
          }}
          onDragEnd={() => ((dragKey.current = null), setDrop(null))}
          onDragOver={(e) => onDragOver(e, n)}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && drop?.key === key && setDrop(null)}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragKey.current;
            dragKey.current = null;
            setDrop(null);
            if (from && drop) applyMove(from, drop);
          }}
        >
          {isGroup ? (
            <button type="button" className="layer-twisty" aria-label={open ? tr('Replier', 'Collapse') : tr('Déplier', 'Expand')} onClick={(e) => (e.stopPropagation(), toggle(n.path, !open))}>
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
            </button>
          ) : (
            <span className="layer-twisty" aria-hidden />
          )}
          <span className="layer-icon">
            <Icon name={isGroup ? (open ? 'folderOpen' : 'folder') : typeIcon(n.el)} size={15} />
          </span>
          {renaming === key ? (
            <input
              className="input layer-rename"
              defaultValue={label}
              autoFocus
              spellCheck={false}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                setRenaming(null);
                const v = e.target.value.trim();
                if (isGroup) renameGroup(n.path, v.replace(/\s+/g, '-'));
                else if (v !== label) patchAll([n.el], () => ({ name: v && v !== n.el.id ? v : null }));
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span className="layer-label">
              <span className="layer-name">{label}</span>
              {sub && <span className="layer-sub">{sub}</span>}
            </span>
          )}
          <span className="layer-tools">
            {!isGroup && shareable(n.el) && (
              <button type="button" className={`layer-tool${shared ? ' is-on is-shared' : ''}`} disabled={readOnly} aria-pressed={shared} data-testid={`share-${n.el.id}`}
                aria-label={shared ? tr('Valeur propre à cette diapositive', 'Value specific to this slide') : tr('Partager sur toutes les diapositives', 'Share on every slide')}
                title={shared ? tr(`Valeur partagée par les diapositives ayant l’espace réservé « ${n.el.placeholder} » — cliquer pour une valeur propre à cette diapositive`, `Value shared by the slides with placeholder “${n.el.placeholder}” — click for a value specific to this slide`) : tr(`Partager cette valeur sur toutes les diapositives ayant l’espace réservé « ${n.el.placeholder} »`, `Share this value on all slides with placeholder “${n.el.placeholder}”`)}
                onClick={(e) => (e.stopPropagation(), mutate([{ kind: 'shareText', slideId: slide.id, elementId: n.el.id, shared: !shared }]))}>
                <Icon name="link" size={14} />
              </button>
            )}
            <button type="button" className={`layer-tool${locked ? ' is-on' : ''}`} disabled={readOnly || shared} aria-pressed={locked} aria-label={locked ? tr('Déverrouiller', 'Unlock') : tr('Verrouiller', 'Lock')} title={locked ? tr('Déverrouiller', 'Unlock') : tr('Verrouiller', 'Lock')} onClick={(e) => (e.stopPropagation(), patchAll(els, () => ({ locked: !locked })))}>
              <Icon name={locked ? 'lock' : 'unlock'} size={14} />
            </button>
            <button type="button" className={`layer-tool${hidden ? ' is-on' : ''}`} disabled={readOnly || shared} aria-pressed={hidden} aria-label={hidden ? tr('Afficher', 'Show') : tr('Masquer', 'Hide')} title={hidden ? tr('Afficher', 'Show') : tr('Masquer', 'Hide')} onClick={(e) => (e.stopPropagation(), patchAll(els, () => ({ hidden: !hidden })))}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={14} />
            </button>
          </span>
        </div>
        {open && <div role="group">{n.children.map((c) => row(c, depth + 1))}</div>}
      </div>
    );
  };

  const toggle = (path: string, open: boolean) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });

  const rs = resolveSlide(slide, master).elements.filter((r) => sel.has(r.element.id));
  const g = groupState(rs, scope);
  const ids = rs.map((r) => r.element.id);
  return (
    <div className="layers" data-testid="layers-panel">
      <div className="layers-bar">
        <span className="layers-count">{tr(`${slide.elements.length} calques`, `${slide.elements.length} layers`)}</span>
        {scope && (
          <button type="button" className="layers-scope" title={tr('Sortir du groupe (Échap)', 'Leave the group (Esc)')} onClick={() => set({ groupScope: parentGroup(scope) })}>
            <Icon name="folderOpen" size={13} /> {groupParts(scope).join(' › ')}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="ibtn" disabled={readOnly || !g.canGroup} aria-label={tr('Grouper (Ctrl+G)', 'Group (Ctrl+G)')} title={tr('Grouper (Ctrl+G)', 'Group (Ctrl+G)')} onClick={() => mutate(groupMutations(slide, ids, true, scope))} data-testid="layers-group">
          <Icon name="group" />
        </button>
        <button type="button" className="ibtn" disabled={readOnly || !g.canUngroup} aria-label={tr('Dissocier (Ctrl+Maj+G)', 'Ungroup (Ctrl+Shift+G)')} title={tr('Dissocier (Ctrl+Maj+G)', 'Ungroup (Ctrl+Shift+G)')} onClick={() => mutate(groupMutations(slide, ids, false, scope))} data-testid="layers-ungroup">
          <Icon name="ungroup" />
        </button>
      </div>
      {tree.length ? (
        <div ref={listRef} className="layers-list" role="tree" aria-label={tr('Calques', 'Layers')} aria-multiselectable>
          {tree.map((n) => row(n, 0))}
        </div>
      ) : (
        <p className="hint insp-hint">{tr('Diapositive vide : les éléments ajoutés apparaissent ici, du premier plan à l’arrière-plan.', 'Empty slide: added elements show up here, front to back.')}</p>
      )}
      <p className="hint layers-help">{tr('Glisser pour réordonner ou ranger dans un groupe · double-clic pour renommer', 'Drag to restack or move into a group · double-click to rename')}</p>
    </div>
  );
}
