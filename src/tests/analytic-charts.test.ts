import { describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import type { AnalyticChartFrame } from '@/core/layout'

function flow(source: string) {
  const result = parseDsl(source)
  expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  if (!result.model) throw new Error('Expected parsed model')
  const view = Object.values(result.model.views)[0]
  return modelToFlow(result.model, view)
}

const frame = (nodes: ReturnType<typeof flow>['nodes'], id: string) => nodes.find(n => n.id === id)!.data.analyticChart as AnalyticChartFrame

describe('analytic charts', () => {
  it('builds a Sankey chart from weighted relations and consumes its children/edges', () => {
    const out = flow(`model {
      chart = sankeyGraph "Energy" {
        source = sankeyNode "Source"
        useful = sankeyNode "Useful" { height "250" }
        loss = sankeyNode "Loss" { height "250" }
      }
      source -> useful { value "80" }
      source -> loss { value "20" color "#ef4444" }
    } views { view v { include * autolayout lr } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('sankey')
    if (f.kind !== 'sankey') return
    expect(f.nodes).toHaveLength(3)
    expect(f.links.map(l => l.value)).toEqual([80, 20])
    expect(f.links.map(l => l.id)).toEqual(expect.arrayContaining([expect.stringMatching(/^rel_/), expect.stringMatching(/^rel_/)]))
    expect(f.links[0].sourceThickness).toBeGreaterThan(f.links[1].sourceThickness)
    const useful = f.nodes.find(n => n.id === 'useful')!
    const loss = f.nodes.find(n => n.id === 'loss')!
    expect(useful.y + useful.height / 2).toBeLessThanOrEqual(loss.y - loss.height / 2)
    expect(out.nodes.some(n => n.id === 'source')).toBe(false)
    expect(out.edges).toHaveLength(0)
  })

  it('recomputes natural Sankey height when links change its depth columns', () => {
    const disconnected = flow(`model { chart = sankeyGraph {
      a = sankeyNode b = sankeyNode c = sankeyNode
    } } views { view v { include * } }`)
    const connected = flow(`model { chart = sankeyGraph {
      a = sankeyNode b = sankeyNode c = sankeyNode
    } a -> b b -> c } views { view v { include * } }`)
    const before = frame(disconnected.nodes, 'chart')
    const after = frame(connected.nodes, 'chart')
    expect(before.kind).toBe('sankey')
    expect(after.kind).toBe('sankey')
    expect(after.height).toBeLessThan(before.height)
    expect(connected.nodes.find(n => n.id === 'chart')!.height).toBe(after.height)
  })

  it('honours a manually resized Sankey frame below its registry default', () => {
    const out = flow(`model { chart = sankeyGraph {
      a = sankeyNode b = sankeyNode c = sankeyNode
    } a -> b b -> c } views { view v { include * chart size 300 180 } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.width).toBe(300)
    expect(f.height).toBe(180)
  })

  it('routes external Sankey relations through embedded-node anchor points', () => {
    const out = flow(`model { chart = sankeyGraph {
      a = sankeyNode b = sankeyNode c = sankeyNode
    } external = artifact a -> b b -> c c -> external
    } views { view v { include * autolayout lr } }`)
    const external = out.edges.find(e => e.target === 'external')
    expect(external).toBeTruthy()
    expect(String(external!.source)).toMatch(/^__sankeyanchor_c_[lr]$/)
    const anchor = out.nodes.find(n => n.id === external!.source && n.parentId === 'chart')
    expect(anchor).toBeTruthy()
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('sankey')
    if (f.kind !== 'sankey') return
    const embedded = f.nodes.find(node => node.id === 'c')!
    const side = String(external!.source).endsWith('_l') ? 'l' : 'r'
    expect(anchor!.position.x + 1).toBe(side === 'l' ? embedded.x : embedded.x + embedded.width)
    expect(anchor!.position.y + 1).toBe(embedded.y)
  })

  it('uses element accent colors for nodes and embedded chart items', () => {
    const out = flow(`model { chart = sankeyGraph "Energy" { accentColor "#7c3aed"
      source = sankeyNode "Source" { accentColor "#dc2626" backgroundColor "#112233" }
      target = sankeyNode "Target"
    } source -> target } views { view v { include * } }`)
    const chartNode = out.nodes.find(node => node.id === 'chart')!
    expect(chartNode.data.fill).toBe('#F7F3FE')
    expect(chartNode.data.stroke).toBe('#7C3AED')
    expect(chartNode.data.accent).toBe('#7C3AED')
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('sankey')
    if (f.kind === 'sankey') {
      expect(f.nodes.find(node => node.id === 'source')!.color).toBe('#112233')
      expect(f.nodes.find(node => node.id === 'source')!.stroke).toBe('#DC2626')
    }
  })

  it('builds multiple radar series over configured axes', () => {
    const out = flow(`model { chart = radarChart "Products" {
      axes "Speed; Quality; Cost; Reach" max "100"
      a = radarSeries "Alpha" { values "80;70;40;90" color "#3b82f6" }
      b = radarSeries "Beta" { values "50;90;75;60" }
    } } views { view v { include * } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('radar')
    if (f.kind !== 'radar') return
    expect(f.axes).toEqual(['Speed', 'Quality', 'Cost', 'Reach'])
    expect(f.series).toHaveLength(2)
    expect(f.series.map(s => s.id)).toEqual(['a', 'b'])
    expect(f.max).toBe(100)
  })

  it('fills both sides of an intermediate Sankey node independently', () => {
    const out = flow(`model { chart = sankeyGraph "Pipeline" {
      a1 = sankeyNode "A1" a2 = sankeyNode "A2" a3 = sankeyNode "A3" a4 = sankeyNode "A4"
      b = sankeyNode "B" c = sankeyNode "C"
    }
      a1 -> b { value "10" } a2 -> b { value "20" } a3 -> b { value "30" } a4 -> b { value "40" }
      b -> c { value "25" }
    } views { view v { include * } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('sankey')
    if (f.kind !== 'sankey') return
    const b = f.nodes.find(n => n.id === 'b')!
    const intoB = f.links.filter(l => l.target === 'b').reduce((sum, l) => sum + l.targetThickness, 0)
    const outOfB = f.links.filter(l => l.source === 'b').reduce((sum, l) => sum + l.sourceThickness, 0)
    expect(intoB).toBeCloseTo(b.height)
    expect(outOfB).toBeCloseTo(b.height)
  })

  it('builds multi-series XY data with regression and bubble sizes', () => {
    const out = flow(`model { chart = xyChart "Portfolio" {
      xLabel "Revenue" yLabel "Growth" regression "true" connect "false"
      a = xySeries "Core" { color "#10b981"
        p1 = xyPoint "One" { x "2" y "4" size "12" }
        p2 = xyPoint "Two" { x "4" y "8" size "20" }
      }
      b = xySeries "New" { p3 = xyPoint "Three" { x "3" y "7" size "8" } }
    } } views { view v { include * } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('xy')
    if (f.kind !== 'xy') return
    expect(f.series).toHaveLength(2)
    expect(f.series.map(s => s.id)).toEqual(['a', 'b'])
    expect(f.series[0].points[1].size).toBe(20)
    expect(f.series[0].points.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(f.regression).toBe(true)
    expect(f.connect).toBe(false)
  })

  it('builds grouped and stacked bar-series data', () => {
    const out = flow(`model { chart = barChart "Revenue" {
      categories "Q1;Q2;Q3" mode "stacked" xLabel "Quarter" yLabel "EUR"
      actual = barSeries "Actual" { values "10;20;30" }
      plan = barSeries "Plan" { values "12;22;28" color "#8b5cf6" }
    } } views { view v { include * } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('bar')
    if (f.kind !== 'bar') return
    expect(f.categories).toEqual(['Q1', 'Q2', 'Q3'])
    expect(f.series).toHaveLength(2)
    expect(f.series.map(s => s.id)).toEqual(['actual', 'plan'])
    expect(f.stacked).toBe(true)
  })

  it('excludes hidden Sankey nodes and their links from the chart frame', () => {
    const out = flow(`model { chart = sankeyGraph "Energy" {
      source = sankeyNode "Source"
      shown = sankeyNode "Shown"
      hidden = sankeyNode "Hidden"
    }
      source -> shown { value "80" }
      source -> hidden { value "20" }
    } views { view v { include chart, source, shown } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('sankey')
    if (f.kind !== 'sankey') return
    expect(f.nodes.map(n => n.id)).toEqual(['source', 'shown'])
    expect(f.links).toHaveLength(1)
    expect(f.links[0]).toMatchObject({ source: 'source', target: 'shown' })
  })

  it('excludes hidden radar and bar series from their chart frames', () => {
    const radar = flow(`model { chart = radarChart "Products" {
      axes "Speed;Quality;Cost"
      shown = radarSeries "Shown" { values "1;2;3" }
      hidden = radarSeries "Hidden" { values "3;2;1" }
    } } views { view v { include chart, shown } }`)
    const radarFrame = frame(radar.nodes, 'chart')
    expect(radarFrame.kind).toBe('radar')
    if (radarFrame.kind === 'radar') expect(radarFrame.series.map(s => s.id)).toEqual(['shown'])

    const bar = flow(`model { chart = barChart "Revenue" {
      categories "Q1;Q2"
      shown = barSeries "Shown" { values "1;2" }
      hidden = barSeries "Hidden" { values "2;1" }
    } } views { view v { include chart, shown } }`)
    const barFrame = frame(bar.nodes, 'chart')
    expect(barFrame.kind).toBe('bar')
    if (barFrame.kind === 'bar') expect(barFrame.series.map(s => s.id)).toEqual(['shown'])
  })

  it('excludes hidden XY series and bubble points from the chart frame', () => {
    const out = flow(`model { chart = xyChart "Portfolio" {
      shown = xySeries "Shown" {
        visiblePoint = xyPoint "Visible" { x "1" y "2" }
        hiddenPoint = xyPoint "Hidden" { x "9" y "9" }
      }
      hiddenSeries = xySeries "Hidden series" {
        hiddenSeriesPoint = xyPoint "Hidden series point" { x "5" y "5" }
      }
    } } views { view v { include chart, shown, visiblePoint } }`)
    const f = frame(out.nodes, 'chart')
    expect(f.kind).toBe('xy')
    if (f.kind !== 'xy') return
    expect(f.series.map(s => s.id)).toEqual(['shown'])
    expect(f.series[0].points.map(p => p.id)).toEqual(['visiblePoint'])
    expect(f.xMax).toBe(2)
    expect(f.yMax).toBe(3)
  })
})
