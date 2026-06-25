import { describe, it, expect } from 'vitest'
import { getVisibleElementIds } from '@/core/model/view-visibility'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { createEmptyModel, type GraphModel, type GraphView } from '@/core/model'

function el(id: string, parentId?: string, children: string[] = []): GraphModel['elements'][string] {
  return { id, name: id, type: 'node', notation: 'generic', tags: [], properties: {}, parentId, children }
}
function rel(id: string, sourceId: string, targetId: string, label?: string): GraphModel['relations'][string] {
  return { id, sourceId, targetId, type: 'rel', notation: 'generic', direction: 'directed', tags: [], properties: {}, label }
}

// A contains b and c, with b -> c.
function buildModel(): GraphModel {
  const m = createEmptyModel()
  m.elements = {
    A: el('A', undefined, ['b', 'c']),
    b: el('b', 'A'),
    c: el('c', 'A'),
  }
  m.relations = { r1: rel('r1', 'b', 'c') }
  return m
}

function view(includedElements: string[]): GraphView {
  return {
    id: 'v', name: 'v', type: 'default', includedElements, includedRelations: [],
    includeAll: false, includeAllRelations: true, layoutMode: 'auto', layoutDirection: 'tb',
    filters: [], styleOverrides: {}, layoutPositions: {}, nodeSizes: {},
  }
}

describe('view include semantics', () => {
  it('shows only the included child, not its ancestor container', () => {
    const ids = getVisibleElementIds(buildModel(), view(['b']))
    expect([...ids].sort()).toEqual(['b'])
  })

  it('"A.*" includes all descendants but not A itself', () => {
    const ids = getVisibleElementIds(buildModel(), view(['A.*']))
    expect([...ids].sort()).toEqual(['b', 'c'])
  })

  it('does not draw deduced ascending edges (b->c lifted to b->A is dropped)', () => {
    // A and b visible, c hidden → b->c would lift to b->A (b's ancestor); drop it
    const { edges } = modelToFlow(buildModel(), view(['A', 'b']))
    expect(edges).toHaveLength(0)
  })
})
