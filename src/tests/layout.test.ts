import { describe, it, expect } from 'vitest'
import { layeredLayout } from '@/core/layout'

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

  it('places isolated nodes', () => {
    const pos = layeredLayout(
      [...nodes, { id: 'lonely', width: 80, height: 40 }],
      edges,
      { direction: 'tb' },
    )
    expect(pos.lonely).toBeDefined()
  })
})
