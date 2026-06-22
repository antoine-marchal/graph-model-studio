import { describe, it, expect } from 'vitest'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { createEmptyModel, type GraphModel, type GraphView } from '@/core/model'

function el(id: string, parentId?: string, children: string[] = []): GraphModel['elements'][string] {
  return { id, name: id, type: 'node', notation: 'generic', tags: [], properties: {}, parentId, children }
}
function rel(id: string, sourceId: string, targetId: string, label?: string): GraphModel['relations'][string] {
  return { id, sourceId, targetId, type: 'rel', notation: 'generic', direction: 'directed', tags: [], properties: {}, label }
}

// A, and B containing b and c. Relations target the children of B.
function buildModel(): GraphModel {
  const m = createEmptyModel()
  m.elements = {
    A: el('A'),
    B: el('B', undefined, ['b', 'c']),
    b: el('b', 'B'),
    c: el('c', 'B'),
  }
  m.relations = {
    r1: rel('r1', 'A', 'b', 'Uses'),
    r2: rel('r2', 'b', 'c'),
  }
  return m
}

function view(includedElements: string[]): GraphView {
  return {
    id: 'v', name: 'v', type: 'default', includedElements, includedRelations: [],
    includeAll: false, layoutMode: 'auto', layoutDirection: 'tb',
    filters: [], styleOverrides: {}, layoutPositions: {},
  }
}

describe('inherited (lifted) edges', () => {
  it('lifts A->b to A->B when only A and B are visible', () => {
    const m = buildModel()
    const { edges } = modelToFlow(m, view(['A', 'B']))
    // b and c hidden; r2 (b->c) collapses to B->B and is dropped; r1 lifts to A->B
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('A')
    expect(edges[0].target).toBe('B')
    // single underlying relation keeps its label
    expect((edges[0].data as { label?: string }).label).toBe('Uses')
  })

  it('collapses several lifted relations into one edge, labels joined by "/"', () => {
    const m = buildModel()
    m.relations.r3 = rel('r3', 'A', 'c', 'Reads') // second A->(child of B)
    const { edges } = modelToFlow(m, view(['A', 'B']))
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('A')
    expect(edges[0].target).toBe('B')
    expect((edges[0].data as { label?: string }).label).toBe('Uses/Reads')
  })

  it('prefers a direct edge over an inherited duplicate', () => {
    const m = buildModel()
    m.relations.r4 = rel('r4', 'A', 'B', 'direct') // explicit A->B
    const { edges } = modelToFlow(m, view(['A', 'B']))
    // only the direct edge, no duplicate inherited one
    expect(edges).toHaveLength(1)
    expect((edges[0].data as { label?: string }).label).toBe('direct')
  })

  it('keeps normal edges when both endpoints are visible', () => {
    const m = buildModel()
    const { edges } = modelToFlow(m, view(['A', 'B', 'b', 'c']))
    // r1 A->b and r2 b->c both direct now
    expect(edges.map(e => `${e.source}->${e.target}`).sort()).toEqual(['A->b', 'b->c'])
  })
})
