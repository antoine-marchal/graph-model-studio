import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { notationRegistry } from '@/core/notation'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import type { GraphModel, GraphView } from '@/core/model'
import { layoutMindmapGraph } from '@/core/layout'

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
    expect(frame.data.label).toBe('Vision')
    // 4 connectors: root→a, root→b, root→c, a→x1
    expect(frame.data.chartFrame!.lines).toHaveLength(4)
    for (const id of ['root', 'a', 'b', 'c', 'x1']) {
      const node = nodes.find(n => n.id === id)!
      expect(node.parentId).toBe('mm')
      expect(node.data.isContainer).toBe(false)
    }
    expect(nodes.find(n => n.id === 'root')!.data.mindmapDepth).toBe(0)
    expect(nodes.find(n => n.id === 'a')!.data.mindmapDepth).toBe(1)
    expect(nodes.find(n => n.id === 'x1')!.data.mindmapDepth).toBe(2)
    expect(nodes.find(n => n.id === 'root')!.width).toBeGreaterThan(nodes.find(n => n.id === 'a')!.width!)
    // root sits near the centre; leaves are further out
    const rc = nodes.find(n => n.id === 'root')!.position
    const xc = nodes.find(n => n.id === 'x1')!.position
    expect(Math.abs(xc.x - rc.x) + Math.abs(xc.y - rc.y)).toBeGreaterThan(100)
  })

  it('keeps relations from a mind-map topic to an external node connectable', () => {
    const m = parse(`model {
      mm = mindmapGraph { root = mindmapRoot { topic = mindmapNode } }
      external = artifact
      topic -> external anchor r l
    } views { view v { include * autolayout lr } }`)
    const { edges } = modelToFlow(m, view(m))
    const relation = edges.find(e => e.source === 'topic' && e.target === 'external')
    expect(relation).toBeTruthy()
    expect(relation).toMatchObject({ sourceHandle: 'r', targetHandle: 'l' })
  })

  it('expands dense rings so sibling nodes do not overlap', () => {
    const children = Array.from({ length: 16 }, (_, i) => `n${i} = mindmapNode "Branch ${i}"`).join('\n')
    const m = parse(`model { mm = mindmapGraph "Dense" { root = mindmapRoot "Root" { ${children} } } }`)
    const hosted = new Set(['root', ...Array.from({ length: 16 }, (_, i) => `n${i}`)])
    const layout = layoutMindmapGraph(m, 'mm', hosted)
    const leaves = [...hosted].filter(id => id !== 'root').map(id => layout.placements[id])
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j]
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
        expect(overlaps, `nodes ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  it('keeps orphaned hosted nodes inside the frame', () => {
    const m = parse(`model { mm = mindmapGraph "Map" { root = mindmapRoot "Root" } stray = mindmapNode "Stray" }`)
    const layout = layoutMindmapGraph(m, 'mm', new Set(['root', 'stray']))
    expect(layout.placements.root).toBeTruthy()
    expect(layout.placements.stray).toBeTruthy()
    for (const p of Object.values(layout.placements)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(28)
      expect(p.x + p.width).toBeLessThanOrEqual(layout.width)
      expect(p.y + p.height).toBeLessThanOrEqual(layout.height)
    }
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
        i1 = gridItem "Leak" { row "5" col "5" projection "1, 1" }
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
    expect(i1.data.projection).toBeDefined()
    expect(i1.data.projection!.dx).toBeLessThan(0)
    expect(i1.data.projection!.dy).toBeLessThan(0)
    expect(i2.data.projection).toBeUndefined()
  })

  it('expands cells to fill a manually resized matrix', () => {
    const m = parse(`model {
      matrix = gridGraph "Matrix" {
        cols "2" rows "2"
        a = gridItem "A" { row "1" col "1" }
        b = gridItem "B" { row "2" col "2" }
      }
    } views { view v { include * } }`)
    const v = view(m)
    v.nodeSizes.matrix = { width: 800, height: 600 }
    const { nodes } = modelToFlow(m, v)
    const matrix = nodes.find(n => n.id === 'matrix')!
    expect(matrix.width).toBe(800)
    expect(matrix.height).toBe(600)
    expect(matrix.data.grid!.cellW).toBeGreaterThan(300)
    expect(matrix.data.grid!.cellH).toBeGreaterThan(200)
    const grid = matrix.data.grid!
    expect(matrix.width! - (grid.originX + grid.cols * grid.cellW)).toBeCloseTo(grid.originX)
    expect(matrix.height! - (grid.originY + grid.rows * grid.cellH)).toBeCloseTo(grid.originY - 28)
    expect(nodes.find(n => n.id === 'b')!.position.x).toBeGreaterThan(400)
    expect(nodes.find(n => n.id === 'b')!.position.y).toBeGreaterThan(300)
  })

  it('preserves a resized grid item while constraining it to its cell', () => {
    const m = parse(`model {
      matrix = gridGraph "Matrix" { cols "2" rows "2" cellW "250" cellH "120" item = gridItem "Resizable" { row "1" col "1" } }
    } views { view v { include * } }`)
    const v = view(m)
    v.nodeSizes.item = { width: 180, height: 72 }
    const { nodes } = modelToFlow(m, v)
    const item = nodes.find(n => n.id === 'item')!
    const grid = nodes.find(n => n.id === 'matrix')!.data.grid!
    expect(item.width).toBe(180)
    expect(item.height).toBe(72)
    expect(item.width!).toBeLessThanOrEqual(grid.cellW - 12)
    expect(item.height!).toBeLessThanOrEqual(grid.cellH - 12)
  })
})
