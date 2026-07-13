import { describe, it, expect } from 'vitest'
import { alignNodes, layeredLayout, runLayout, runLayoutSubset, type LayoutEngine } from '@/core/layout'

describe('layeredLayout', () => {
  const nodes = [
    { id: 'a', width: 100, height: 50 },
    { id: 'b', width: 100, height: 50 },
    { id: 'c', width: 100, height: 50 },
    { id: 'd', width: 100, height: 50 },
  ]
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'c' },
    { source: 'b', target: 'd' },
    { source: 'c', target: 'd' },
  ]

  it('places every node', () => {
    const pos = layeredLayout(nodes, edges, { direction: 'tb' })
    expect(Object.keys(pos).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('assigns distinct positions', () => {
    const pos = layeredLayout(nodes, edges, { direction: 'tb' })
    const keys = Object.values(pos).map(p => `${p.x},${p.y}`)
    expect(new Set(keys).size).toBe(4)
  })

  it('orders layers top-to-bottom for tb', () => {
    const pos = layeredLayout(nodes, edges, { direction: 'tb' })
    expect(pos.a.y).toBeLessThan(pos.b.y)
    expect(pos.b.y).toBeLessThan(pos.d.y)
  })

  it('orders layers left-to-right for lr', () => {
    const pos = layeredLayout(nodes, edges, { direction: 'lr' })
    expect(pos.a.x).toBeLessThan(pos.b.x)
    expect(pos.b.x).toBeLessThan(pos.d.x)
  })

  it('handles cycles without crashing', () => {
    const cyc = [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]
    const pos = layeredLayout([{ id: 'a', width: 80, height: 40 }, { id: 'b', width: 80, height: 40 }], cyc, { direction: 'tb' })
    expect(Object.keys(pos)).toHaveLength(2)
  })

  it('places a cyclic component before its outgoing dependencies', () => {
    const pos = layeredLayout(nodes.slice(0, 3), [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'b', target: 'c' },
    ], { direction: 'tb' })
    expect(pos.c.y).toBeGreaterThan(Math.max(pos.a.y, pos.b.y))
  })

  it('places isolated nodes', () => {
    const pos = layeredLayout(
      [...nodes, { id: 'lonely', width: 80, height: 40 }],
      edges,
      { direction: 'tb' },
    )
    expect(pos.lonely).toBeDefined()
  })
})

describe.each<LayoutEngine>(['layered', 'dagre'])('%s layout engine', engine => {
  const nodes = [
    { id: 'a', width: 120, height: 60 },
    { id: 'b', width: 80, height: 40 },
    { id: 'c', width: 100, height: 50 },
  ]
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]

  it('honours forward and reverse directions', () => {
    const lr = runLayout(engine, nodes, edges, { direction: 'lr', origin: { x: 25, y: 35 } })
    const rl = runLayout(engine, nodes, edges, { direction: 'rl', origin: { x: 25, y: 35 } })
    expect(lr.a.x).toBeLessThan(lr.b.x)
    expect(lr.b.x).toBeLessThan(lr.c.x)
    expect(rl.a.x).toBeGreaterThan(rl.b.x)
    expect(rl.b.x).toBeGreaterThan(rl.c.x)
    expect(Math.min(...Object.values(lr).map(position => position.x))).toBe(25)
  })

  it('lays out only the selection and preserves its visual centre', () => {
    const current = { a: { x: 400, y: 200 }, b: { x: 560, y: 250 }, c: { x: 900, y: 700 } }
    const selected = runLayoutSubset(engine, nodes, edges, current, new Set(['a', 'b']), { direction: 'lr' })
    expect(Object.keys(selected).sort()).toEqual(['a', 'b'])
    const beforeX = ((current.a.x + 60) + (current.b.x + 40)) / 2
    const afterX = ((selected.a.x + 60) + (selected.b.x + 40)) / 2
    const beforeY = ((current.a.y + 30) + (current.b.y + 20)) / 2
    const afterY = ((selected.a.y + 30) + (selected.b.y + 20)) / 2
    expect(afterX).toBeCloseTo(beforeX)
    expect(afterY).toBeCloseTo(beforeY)
  })
})

describe('alignNodes', () => {
  const nodes = [
    { id: 'a', width: 100, height: 40 },
    { id: 'b', width: 60, height: 80 },
  ]
  const positions = { a: { x: 20, y: 10 }, b: { x: 180, y: 130 } }

  it('aligns different-sized nodes on a vertical centre line', () => {
    const aligned = alignNodes(nodes, positions, 'vertical')
    expect(aligned.a.x + nodes[0].width / 2).toBe(aligned.b.x + nodes[1].width / 2)
    expect(aligned.a.y).toBe(positions.a.y)
    expect(aligned.b.y).toBe(positions.b.y)
  })

  it('aligns different-sized nodes on a horizontal centre line', () => {
    const aligned = alignNodes(nodes, positions, 'horizontal')
    expect(aligned.a.y + nodes[0].height / 2).toBe(aligned.b.y + nodes[1].height / 2)
    expect(aligned.a.x).toBe(positions.a.x)
    expect(aligned.b.x).toBe(positions.b.x)
  })
})
