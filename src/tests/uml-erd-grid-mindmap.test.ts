import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { notationRegistry } from '@/core/notation'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import type { GraphModel, GraphView } from '@/core/model'

const view = (m: GraphModel): GraphView => Object.values(m.views)[0]
function parse(src: string): GraphModel {
  const r = parseDsl(src)
  expect(r.model).toBeTruthy()
  return r.model!
}

describe('registry: uml / erd / grid / mindmapGraph', () => {
  it('registers the new element and relation types', () => {
    for (const t of ['umlClass', 'umlInterface', 'umlEnum', 'umlNote', 'erdEntity', 'gridGraph', 'gridItem', 'mindmapGraph']) {
      expect(notationRegistry.getElementDef(t), t).toBeTruthy()
    }
    for (const t of ['dependency', 'erdOneToMany', 'erdManyToMany', 'erdZeroToMany', 'erdOneToOne']) {
      expect(notationRegistry.getRelationDef(t), t).toBeTruthy()
    }
  })

  it('infers notations', () => {
    const m = parse(`model {
      c = umlClass "User"
      e = erdEntity "Order"
      g = gridGraph "AMDEC"
      mm = mindmapGraph "Ideas"
    }`)
    expect(m.elements['c'].notation).toBe('uml')
    expect(m.elements['e'].notation).toBe('erd')
    expect(m.elements['g'].notation).toBe('grid')
    expect(m.elements['mm'].notation).toBe('mindmap')
  })
})

describe('UML class', () => {
  it('passes attributes/methods to the node and cardinality onto the edge', () => {
    const m = parse(`model {
      user = umlClass "User" {
        attributes "- id: int; - name: string"
        methods "+ login(): bool"
      }
      order = umlClass "Order"
      user -> order : association {
        sourceCard "1"
        targetCard "0..*"
      }
    }
    views { view v { include * autolayout lr } }`)
    const { nodes, edges } = modelToFlow(m, view(m))
    const u = nodes.find(n => n.id === 'user')!
    expect(u.data.chartProps?.attributes).toContain('id: int')
    expect(u.data.chartProps?.methods).toContain('login')
    const e = edges.find(x => x.source === 'user')!
    expect((e.data as { sourceLabel?: string; targetLabel?: string }).sourceLabel).toBe('1')
    expect((e.data as { targetLabel?: string }).targetLabel).toBe('0..*')
  })
})

describe('ERD', () => {
  it('carries attributes and uses crow-foot markers', () => {
    const m = parse(`model {
      user = erdEntity "User" { attributes "id: int PK; email: string" }
      order = erdEntity "Order" { attributes "id: int PK; userId: int FK" }
      user -> order : erdOneToMany
    }
    views { view v { include * autolayout lr } }`)
    const { nodes, edges } = modelToFlow(m, view(m))
    expect(nodes.find(n => n.id === 'user')!.data.chartProps?.attributes).toContain('PK')
    const e = edges.find(x => x.source === 'user')!
    expect(e.markerEnd).toBe('gms-crow-many')
    expect(e.markerStart).toBe('gms-crow-one')
  })
})

describe('mindmap graph (radial)', () => {
  it('hosts nodes in the frame and draws one connector per parent→child', () => {
    const m = parse(`model {
      mm = mindmapGraph "Vision" {
        root = mindmapRoot "Product" {
          a = mindmapNode "UX" { x1 = mindmapNode "Onboarding" }
          b = mindmapNode "Perf"
          c = mindmapNode "Growth"
        }
      }
    }
    views { view v { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    const frame = nodes.find(n => n.id === 'mm')!
    expect(frame.data.chartFrame).toBeTruthy()
    // 4 connectors: root→a, root→b, root→c, a→x1
    expect(frame.data.chartFrame!.lines).toHaveLength(4)
    for (const id of ['root', 'a', 'b', 'c', 'x1']) {
      expect(nodes.find(n => n.id === id)!.parentId).toBe('mm')
    }
    // root sits near the centre; leaves are further out
    const rc = nodes.find(n => n.id === 'root')!.position
    const xc = nodes.find(n => n.id === 'x1')!.position
    expect(Math.abs(xc.x - rc.x) + Math.abs(xc.y - rc.y)).toBeGreaterThan(100)
  })
})

describe('grid / AMDEC matrix', () => {
  it('places items into cells and exposes the matrix frame', () => {
    const m = parse(`model {
      amdec = gridGraph "Risk 5x5" {
        cols "5"
        rows "5"
        xLabel "Severity"
        yLabel "Occurrence"
        cellBg "5,5=#e53935; 1,1=#43a047"
        i1 = gridItem "Leak" { row "5" col "5" }
        i2 = gridItem "Typo" { row "1" col "1" }
      }
    }
    views { view v { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    const g = nodes.find(n => n.id === 'amdec')!
    expect(g.data.grid).toBeTruthy()
    expect(g.data.grid!.cols).toBe(5)
    expect(g.data.grid!.cellBg['5,5']).toBe('#e53935')
    // items are frame children placed in different cells (i1 bottom-right, i2 top-left)
    const i1 = nodes.find(n => n.id === 'i1')!
    const i2 = nodes.find(n => n.id === 'i2')!
    expect(i1.parentId).toBe('amdec')
    expect(i1.position.x).toBeGreaterThan(i2.position.x)
    expect(i1.position.y).toBeGreaterThan(i2.position.y)
  })
})
