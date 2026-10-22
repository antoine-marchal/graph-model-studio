/*
 * Nested groups: an element's `group` is a path of group ids, outermost first (`cards/card-1`).
 * As in PowerPoint, a click picks the outermost group; once inside a group (its "scope"), a click
 * picks the next level down.
 */

export const groupParts = (g: string | undefined | null): string[] => (g ? g.split('/') : []);

/** The element's group path is `path` or lies inside it. */
export const inGroup = (g: string | undefined, path: string): boolean => !!g && (g === path || g.startsWith(`${path}/`));

/**
 * What a click on an element selects inside the entered group `scope`: the group path one level
 * below the scope, or null for the element alone. Outside the scope, the outermost group.
 */
export function groupUnit(g: string | undefined, scope: string | null): string | null {
  const parts = groupParts(g);
  const depth = scope && inGroup(g, scope) ? groupParts(scope).length : 0;
  return parts.length > depth ? parts.slice(0, depth + 1).join('/') : null;
}

/** Group path one level up (null at the top). */
export const parentGroup = (path: string): string | null => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null);

/* ------------------------------------------------------------------ */
/* Layers (front → back, groups as folders)                            */
/* ------------------------------------------------------------------ */

export type LayerNode<E extends { id: string; group?: string }> = { kind: 'element'; el: E } | { kind: 'group'; path: string; children: LayerNode<E>[] };

/** Elements front → back (explicit `z`, else document order; later = in front). */
export function frontToBack<E extends { id: string; z?: number }>(els: E[]): E[] {
  return els
    .map((el, i) => ({ el, z: el.z ?? i, i }))
    .sort((a, b) => b.z - a.z || b.i - a.i)
    .map((x) => x.el);
}

/** Layer tree of elements given front → back: a group sits where its front-most member is. */
export function layerTree<E extends { id: string; group?: string }>(els: E[], depth = 0): LayerNode<E>[] {
  const out: (LayerNode<E> | { kind: 'pending'; path: string; members: E[] })[] = [];
  const groups = new Map<string, { kind: 'pending'; path: string; members: E[] }>();
  for (const el of els) {
    const parts = groupParts(el.group);
    if (parts.length <= depth) {
      out.push({ kind: 'element', el });
      continue;
    }
    const path = parts.slice(0, depth + 1).join('/');
    let g = groups.get(path);
    if (!g) {
      g = { kind: 'pending', path, members: [] };
      groups.set(path, g);
      out.push(g);
    }
    g.members.push(el);
  }
  return out.map((n) => (n.kind === 'pending' ? { kind: 'group', path: n.path, children: layerTree(n.members, depth + 1) } : n));
}

export const layerKey = (n: LayerNode<{ id: string }>): string => (n.kind === 'element' ? `e:${n.el.id}` : `g:${n.path}`);

/**
 * Move a layer (element or whole group) before / after another, or into a group (on top): the new
 * front → back order and each element's group path. Null when the move makes no sense (a group into itself).
 */
export function moveLayer<E extends { id: string; group?: string }>(tree: LayerNode<E>[], from: string, to: string, where: 'before' | 'after' | 'inside'): { order: string[]; groups: Map<string, string | undefined> } | null {
  if (from === to) return null;
  const clone = structuredClone(tree);
  const find = (list: LayerNode<E>[], key: string): { list: LayerNode<E>[]; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!;
      if (layerKey(n) === key) return { list, index: i };
      if (n.kind === 'group') {
        const f = find(n.children, key);
        if (f) return f;
      }
    }
    return null;
  };
  const src = find(clone, from);
  if (!src) return null;
  const [node] = src.list.splice(src.index, 1);
  if (node!.kind === 'group' && to.startsWith('g:') && inGroup(to.slice(2), node!.path)) return null;
  const dst = find(clone, to);
  if (!dst) return null;
  const target = dst.list[dst.index]!;
  if (where === 'inside' && target.kind === 'group') target.children.unshift(node!);
  else dst.list.splice(dst.index + (where === 'after' ? 1 : 0), 0, node!);
  const order: string[] = [];
  const groups = new Map<string, string | undefined>();
  const walk = (list: LayerNode<E>[], prefix: string | null) => {
    for (const n of list) {
      if (n.kind === 'element') {
        order.push(n.el.id);
        groups.set(n.el.id, prefix ?? undefined);
      } else {
        const last = n.path.slice(n.path.lastIndexOf('/') + 1);
        walk(n.children, prefix ? `${prefix}/${last}` : last);
      }
    }
  };
  walk(clone, null);
  return { order, groups };
}
