import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { notationRegistry } from '@/core/notation'
import { computePert, computeGanttChart, parseGanttDuration, parseGanttDate, GANTT_PX_PER_DAY, GANTT_AXIS_H } from '@/core/layout'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import type { GraphModel, GraphView } from '@/core/model'

function view(model: GraphModel): GraphView {
  return Object.values(model.views)[0]
}

function parse(src: string): GraphModel {
  const r = parseDsl(src)
  expect(r.model).toBeTruthy()
  return r.model!
}

describe('new notations: registry + parsing', () => {
  it('registers use case, tree, pert and gantt element types', () => {
    for (const t of ['actor', 'useCase', 'systemBoundary', 'treeGraph', 'treeNode',
      'pertTask', 'pertMilestone', 'ganttTask', 'ganttMilestone', 'ganttSection']) {
      expect(notationRegistry.getElementDef(t), t).toBeTruthy()
    }
    for (const t of ['include', 'extend', 'generalization', 'branch', 'dependsOn']) {
      expect(notationRegistry.getRelationDef(t), t).toBeTruthy()
    }
  })

  it('infers the new notations from element types', () => {
    const m = parse(`model {
      a = actor "User"
      u = useCase "Login"
      r = treeNode "Root"
      p = pertTask "Design"
      g = ganttTask "Build"
    }`)
    expect(m.elements['a'].notation).toBe('usecase')
    expect(m.elements['u'].notation).toBe('usecase')
    expect(m.elements['r'].notation).toBe('tree')
    expect(m.elements['p'].notation).toBe('pert')
    expect(m.elements['g'].notation).toBe('gantt')
  })
})

describe('PERT critical path', () => {
  //   a(3) -> b(2) -> d(4)
  //   a(3) -> c(5) -> d(4)   critical path: a,c,d = 12
  const m = parse(`model {
    a = pertTask "A" { duration "3" }
    b = pertTask "B" { duration "2" }
    c = pertTask "C" { duration "5" }
    d = pertTask "D" { duration "4" }
    a -> b : dependsOn
    a -> c : dependsOn
    b -> d : dependsOn
    c -> d : dependsOn
  }`)

  it('computes forward/backward pass and slack', () => {
    const r = computePert(m)
    expect(r.duration).toBe(12)
    expect(r.nodes['a']).toMatchObject({ es: 0, ef: 3, slack: 0, critical: true })
    expect(r.nodes['c']).toMatchObject({ es: 3, ef: 8, slack: 0, critical: true })
    expect(r.nodes['d']).toMatchObject({ es: 8, ef: 12, slack: 0, critical: true })
    // b: es 3, ef 5, must finish by 8 → slack 3
    expect(r.nodes['b']).toMatchObject({ es: 3, ef: 5, slack: 3, critical: false })
  })

  it('marks only critical relations', () => {
    const r = computePert(m)
    const critIds = [...r.criticalRelations]
    // a->c and c->d critical; a->b and b->d not
    expect(critIds.some(id => id.includes('_a_c_'))).toBe(true)
    expect(critIds.some(id => id.includes('_c_d_'))).toBe(true)
    expect(critIds.some(id => id.includes('_a_b_'))).toBe(false)
    expect(critIds.some(id => id.includes('_b_d_'))).toBe(false)
  })

  it('injects CPM values and red edges into the flow', () => {
    const { nodes, edges } = modelToFlow(m, view(m))
    const a = nodes.find(n => n.id === 'a')!
    expect(a.data.pert).toMatchObject({ es: 0, ef: 3, critical: true })
    const critEdge = edges.find(e => e.source === 'c' && e.target === 'd')!
    expect(critEdge.style?.stroke).toBe('#D32F2F')
    const slackEdge = edges.find(e => e.source === 'a' && e.target === 'b')!
    expect(slackEdge.style?.stroke).not.toBe('#D32F2F')
  })
})

describe('Gantt scheduling and layout', () => {
  it('parses durations and dates', () => {
    expect(parseGanttDuration('5')).toBe(5)
    expect(parseGanttDuration('5d')).toBe(5)
    expect(parseGanttDuration('2w')).toBe(14)
    expect(parseGanttDuration('nope')).toBeUndefined()
    expect(parseGanttDate('2026-07-10')?.getUTCDate()).toBe(10)
    expect(parseGanttDate('July 10')).toBeUndefined()
  })

  it('schedules from explicit dates and dependencies', () => {
    const m = parse(`model {
      spec = ganttTask "Spec" { start "2026-01-05" duration "3d" }
      build = ganttTask "Build" { duration "4d" }
      ship = ganttMilestone "Ship"
      spec -> build
      build -> ship
    }`)
    const chart = computeGanttChart(m, new Set(['spec', 'build', 'ship']))!
    expect(chart).toBeTruthy()
    expect(chart.baseDate?.toISOString().slice(0, 10)).toBe('2026-01-05')
    expect(chart.schedule['spec']).toEqual({ startDay: 0, days: 3 })
    expect(chart.schedule['build']).toEqual({ startDay: 3, days: 4 })
    expect(chart.schedule['ship']).toEqual({ startDay: 7, days: 0 })
    expect(chart.totalDays).toBe(8)
  })

  it('supports inclusive end dates', () => {
    const m = parse(`model {
      t = ganttTask "T" { start "2026-01-01" end "2026-01-05" }
    }`)
    const chart = computeGanttChart(m, new Set(['t']))!
    expect(chart.schedule['t'].days).toBe(5)
  })

  it('hosts rows inside a ganttGraph frame with an embedded axis', () => {
    const m = parse(`model {
      chart = ganttGraph "Plan" {
        a = ganttTask "A" { start "2026-01-05" duration "2d" }
        b = ganttTask "B" { duration "3d" }
      }
      a -> b
    }
    views { view g { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    // the frame carries the axis ticks; no separate axis node exists
    const frame = nodes.find(n => n.id === 'chart')!
    expect(frame.data.ganttGraph).toBeTruthy()
    expect(frame.data.ganttGraph!.ticks.length).toBeGreaterThan(0)
    expect(nodes.find(n => n.id === '__gantt_axis__')).toBeUndefined()

    const a = nodes.find(n => n.id === 'a')!
    const b = nodes.find(n => n.id === 'b')!
    // rows are React Flow children of the frame → move with it
    expect(a.parentId).toBe('chart')
    expect(b.parentId).toBe('chart')
    // positions are relative to the frame (title + axis offset)
    expect(a.position.x).toBe(16)
    expect(a.position.y).toBe(28 + GANTT_AXIS_H)
    expect(a.width).toBe(2 * GANTT_PX_PER_DAY)
    expect(b.position.x).toBe(16 + 2 * GANTT_PX_PER_DAY)
    expect(b.width).toBe(3 * GANTT_PX_PER_DAY)
    expect(b.position.y).toBeGreaterThan(a.position.y)
    // frame grows to wrap the chart
    expect(frame.width!).toBeGreaterThanOrEqual(b.position.x + b.width!)
  })

  it('flattens section nesting: rows parent to the frame, band wraps its tasks', () => {
    const m = parse(`model {
      chart = ganttGraph "Plan" {
        p1 = ganttSection "Phase 1" {
          spec = ganttTask "Spec" { start "2026-01-05" duration "2d" }
          rev  = ganttTask "Review" { duration "1d" }
        }
        p2 = ganttSection "Phase 2" {
          build = ganttTask "Build" { duration "3d" }
        }
      }
    }
    views { view g { include * autolayout lr } }`)
    // DSL nesting is preserved in the model…
    expect(m.elements['spec'].parentId).toBe('p1')
    const { nodes } = modelToFlow(m, view(m))
    // …but every row (task and section) is a React Flow child of the frame
    for (const id of ['p1', 'spec', 'rev', 'p2', 'build']) {
      expect(nodes.find(n => n.id === id)!.parentId).toBe('chart')
    }
    // the section band spans its header row plus both task rows
    const band = nodes.find(n => n.id === 'p1')!
    const spec = nodes.find(n => n.id === 'spec')!
    const rev = nodes.find(n => n.id === 'rev')!
    expect(band.height!).toBeGreaterThan(spec.height! + rev.height!)
    for (const t of [spec, rev]) {
      expect(t.position.y).toBeGreaterThanOrEqual(band.position.y)
      expect(t.position.y + t.height!).toBeLessThanOrEqual(band.position.y + band.height!)
    }
  })

  it('supports several independent gantt graphs', () => {
    const m = parse(`model {
      g1 = ganttGraph "A" { t1 = ganttTask "T1" { duration "2d" } }
      g2 = ganttGraph "B" { t2 = ganttTask "T2" { duration "5d" } }
    }
    views { view g { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    expect(nodes.find(n => n.id === 't1')!.parentId).toBe('g1')
    expect(nodes.find(n => n.id === 't2')!.parentId).toBe('g2')
    // each frame is sized to its own longest task
    const g1 = nodes.find(n => n.id === 'g1')!
    const g2 = nodes.find(n => n.id === 'g2')!
    expect(g2.width!).toBeGreaterThan(g1.width!)
  })
})

describe('gantt round-trip', () => {
  it('serializes start/duration/end properties back to parseable DSL', async () => {
    const { serializeModel } = await import('@/core/dsl/serializer')
    const m = parse(`model {
      spec = ganttTask "Spec" { start "2026-01-05" duration "3d" progress "50" }
      ship = ganttMilestone "Ship" { start "2026-01-12" }
      spec -> ship
    }`)
    const dsl = serializeModel(m)
    const m2 = parse(dsl)
    expect(m2.elements['spec'].properties).toMatchObject({ start: '2026-01-05', duration: '3d', progress: '50' })
    expect(m2.elements['ship'].properties).toMatchObject({ start: '2026-01-12' })
    expect(m2.elements['spec'].children).toEqual([])
  })
})

describe('use case auto-labels', () => {
  it('labels include/extend edges with guillemets when unlabelled', () => {
    const m = parse(`model {
      login = useCase "Login"
      otp = useCase "Verify OTP"
      audit = useCase "Audit"
      login -> otp : include
      login -> audit : extend "sometimes"
    }`)
    const { edges } = modelToFlow(m, view(m))
    const inc = edges.find(e => e.target === 'otp')!
    expect(inc.data?.label).toBe('«include»')
    const ext = edges.find(e => e.target === 'audit')!
    expect(ext.data?.label).toBe('sometimes')
  })
})
