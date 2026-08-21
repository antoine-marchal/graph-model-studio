import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { notationRegistry } from '@/core/notation'
import {
  computePert, computeGanttChart, formatGanttDuration, formatGanttStart, parseGanttSpecialLines,
  parseGanttDuration, parseGanttDate, parseGanttUnitStart, GANTT_PX_PER_DAY, GANTT_AXIS_H, GANTT_AXIS_TASK_GAP,
  GANTT_SECTION_INSET,
} from '@/core/layout'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { ganttAttachmentPoints } from '@/features/editor-graph/edges/FloatingEdge'
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

describe('BPMN lane layout', () => {
  it('reserves a left label band and starts children beside it', () => {
    const m = parse(`model {
      lane1 = lane "Operations" { work = task "Process request" }
    } views { view v { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    const lane = nodes.find(n => n.id === 'lane1')!
    const work = nodes.find(n => n.id === 'work')!
    expect(lane.data.elementType).toBe('lane')
    expect(work.parentId).toBe('lane1')
    expect(work.position.x).toBeGreaterThanOrEqual(44)
    expect(work.position.y).toBeGreaterThanOrEqual(16)
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
    expect(parseGanttUnitStart('3')).toBe(3)
    expect(parseGanttUnitStart('2026-01-01')).toBeUndefined()
  })

  it('supports unit-based starts, durations and a custom axis prefix', () => {
    const m = parse(`model {
      chart = ganttGraph "Increment plan" { prefix "PI"
        a = ganttTask "Foundation" { start "1" duration "2" }
        b = ganttTask "Delivery" { start "4" duration "2" }
      }
    } views { view v { include * } }`)
    const chart = computeGanttChart(m, new Set(['a', 'b']), { unitPrefix: m.elements.chart.properties.prefix })!
    expect(chart.baseDate).toBeUndefined()
    expect(chart.baseUnit).toBe(1)
    expect(chart.schedule.a).toEqual({ startDay: 0, days: 2 })
    expect(chart.schedule.b).toEqual({ startDay: 3, days: 2 })
    expect(chart.axis.ticks.slice(0, 4).map(tick => tick.label)).toEqual(['PI1', 'PI2', 'PI3', 'PI4'])
    expect(formatGanttStart(chart, 2)).toBe('3')
    expect(formatGanttDuration(2, '1', '2')).toBe('2')
    expect(formatGanttDuration(14, '2026-01-01', '2w')).toBe('2w')
  })

  it('supports a spaced prefix and configurable numeric/date axis origins', () => {
    const units = parse(`model { graph = ganttGraph { task = ganttTask { start "10" duration "2" } } }`)
    const unitChart = computeGanttChart(units, new Set(['task']), { unitPrefix: 'PI ', firstUnit: 10 })!
    expect(unitChart.schedule.task.startDay).toBe(0)
    expect(unitChart.axis.ticks.slice(0, 3).map(tick => tick.label)).toEqual(['PI 10', 'PI 11', 'PI 12'])
    expect(formatGanttStart(unitChart, 2)).toBe('12')

    const dates = parse(`model { graph = ganttGraph { task = ganttTask { start "2026-01-12" duration "2d" } } }`)
    const dateChart = computeGanttChart(dates, new Set(['task']), { firstDate: '2026-01-10' })!
    expect(dateChart.schedule.task.startDay).toBe(2)
    expect(dateChart.axis.ticks[0].label).toBe('01-10')
    expect(formatGanttStart(dateChart, 3)).toBe('2026-01-13')
  })

  it('stretches and shrinks the time scale to an explicit chart width', () => {
    const m = parse(`model { graph = ganttGraph { task = ganttTask { start "1" duration "2" } later = ganttTask { start "5" duration "1" } } }`)
    const wide = computeGanttChart(m, new Set(['task', 'later']), { axisWidth: 640 })!
    const narrow = computeGanttChart(m, new Set(['task', 'later']), { axisWidth: 120 })!
    expect(wide.axis.width).toBe(640)
    expect(narrow.axis.width).toBe(120)
    expect(wide.pixelsPerUnit).toBeGreaterThan(narrow.pixelsPerUnit)
    expect(wide.placements.task.width).toBeCloseTo(wide.pixelsPerUnit * 2)
    expect(narrow.placements.later.x).toBeCloseTo(GANTT_SECTION_INSET + narrow.pixelsPerUnit * 4)
    expect(narrow.axis.ticks.length).toBeLessThan(wide.axis.ticks.length)
    expect(narrow.axis.ticks[1].x - narrow.axis.ticks[0].x).toBeGreaterThanOrEqual(28)
  })

  it('repeats an evenly divided numeric subunit timeline for every major unit', () => {
    const m = parse(`model {
      graph = ganttGraph {
        first = ganttTask { start "1" duration "1" }
        last = ganttTask { start "3" duration "1" }
      }
    }`)
    const chart = computeGanttChart(m, new Set(['first', 'last']), {
      unitPrefix: 'PI ', subunitPrefix: 'IT ', maxSubunit: 3, axisWidth: 400,
    })!
    expect(chart.axis.ticks.slice(0, 2).map(tick => tick.label)).toEqual(['PI 1', 'PI 2'])
    expect(chart.axis.subTicks.slice(0, 6).map(tick => tick.label)).toEqual(['IT 1', 'IT 2', 'IT 3', 'IT 1', 'IT 2', 'IT 3'])
    const [it1, it2, it3] = chart.axis.subTicks
    const pi2 = chart.axis.ticks[1]
    expect(it2.x - it1.x).toBeCloseTo(it3.x - it2.x)
    expect(pi2.x - it3.x).toBeCloseTo(it2.x - it1.x)
    expect(chart.axis.subTicks[3].x).toBeCloseTo(pi2.x)
    expect(chart.axis.subTicks.every(tick => tick.showLabel)).toBe(true)
  })

  it('reserves only the width needed by an external task label', () => {
    const m = parse(`model {
      graph = ganttGraph {
        first = ganttTask "Short" { start "2026-08-21" duration "5d" }
        last = ganttTask "Tournée spéciale " { start "2026-09-03" duration "2d" }
        milestone = ganttMilestone "Done" { start "2026-09-06" }
      }
    }`)
    const chart = computeGanttChart(m, new Set(['first', 'last', 'milestone']), { axisWidth: 336 })!
    expect(chart.axis.ticks.length).toBeLessThan(chart.totalDays + 1)
    expect(chart.labelOverflow).toBeGreaterThan(0)
    expect(chart.labelOverflow).toBeLessThan(140)
  })

  it('moves an early milestone label right and reserves enough frame width', () => {
    const m = parse(`model {
      graph = ganttGraph {
        milestone = ganttMilestone "Gantt Milestone" { start "2026-08-21" }
        later = ganttTask "Later" { start "2026-08-22" duration "1d" }
      }
    }`)
    const chart = computeGanttChart(m, new Set(['milestone', 'later']), { axisWidth: 120 })!
    expect(chart.milestoneLabelSide.milestone).toBe('right')
    expect(chart.labelOverflow).toBeGreaterThan(0)
  })

  it('keeps a late milestone label on the left when it fits', () => {
    const m = parse(`model {
      graph = ganttGraph {
        first = ganttTask "First" { start "2026-08-21" duration "1d" }
        milestone = ganttMilestone "Done" { start "2026-08-28" }
      }
    }`)
    const chart = computeGanttChart(m, new Set(['first', 'milestone']), { axisWidth: 240 })!
    expect(chart.milestoneLabelSide.milestone).toBe('left')
  })

  it('parses and places labelled special lines on unit and date scales', () => {
    expect(parseGanttSpecialLines(`2:"Aujourd'hui"; 5:'Demain'`)).toEqual([
      { at: '2', label: "Aujourd'hui" },
      { at: '5', label: 'Demain' },
    ])
    const units = parse(`model { graph = ganttGraph { task = ganttTask { start "1" duration "5" } } }`)
    const unitChart = computeGanttChart(units, new Set(['task']), { specialLines: `2:"Aujourd'hui"; 5:"Demain"` })!
    expect(unitChart.axis.specialLines.map(line => line.label)).toEqual(["Aujourd'hui", 'Demain'])
    expect(unitChart.axis.specialLines[0].x).toBeCloseTo(GANTT_SECTION_INSET + unitChart.pixelsPerUnit)

    const dates = parse(`model { graph = ganttGraph { task = ganttTask { start "2026-01-01" duration "5d" } } }`)
    const dateChart = computeGanttChart(dates, new Set(['task']), { specialLines: `2026-01-03:"Review"` })!
    expect(dateChart.axis.specialLines[0].x).toBeCloseTo(GANTT_SECTION_INSET + dateChart.pixelsPerUnit * 2)
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
    // the frame carries axis data and a synthetic overlay paints it above sections
    const frame = nodes.find(n => n.id === 'chart')!
    expect(frame.data.ganttGraph).toBeTruthy()
    expect(frame.data.ganttGraph!.ticks.length).toBeGreaterThan(0)
    const axis = nodes.find(n => n.id === '__gantt_axis__chart')!
    expect(axis.parentId).toBe('chart')
    expect(axis.zIndex).toBe(2000)

    const a = nodes.find(n => n.id === 'a')!
    const b = nodes.find(n => n.id === 'b')!
    // rows are React Flow children of the frame → move with it
    expect(a.parentId).toBe('chart')
    expect(b.parentId).toBe('chart')
    // positions are relative to the frame (title + axis offset)
    expect(a.position.x).toBe(16 + GANTT_SECTION_INSET)
    expect(a.position.y).toBe(28 + GANTT_AXIS_H + GANTT_AXIS_TASK_GAP)
    expect(a.width).toBe(2 * GANTT_PX_PER_DAY)
    expect(b.position.x).toBe(16 + GANTT_SECTION_INSET + 2 * GANTT_PX_PER_DAY)
    expect(b.width).toBe(3 * GANTT_PX_PER_DAY)
    expect(b.position.y - (a.position.y + a.height!)).toBeGreaterThanOrEqual(24)
    expect(b.position.y).toBeGreaterThan(a.position.y)
    // frame grows to wrap the chart
    expect(frame.width!).toBeGreaterThanOrEqual(b.position.x + b.width!)
  })

  it('uses the persisted frame width as the responsive Gantt scale', () => {
    const m = parse(`model {
      chart = ganttGraph "Plan" { specialLines "2:Today"
        a = ganttTask "A label longer than its bar" { start "1" duration "1" }
        b = ganttTask "B" { start "5" duration "1" }
      }
      a -> b
    }
    views { view g { include * } }`)
    const graphView = view(m)
    graphView.nodeSizes.chart = { width: 400, height: 300 }
    const { nodes } = modelToFlow(m, graphView)
    const frame = nodes.find(node => node.id === 'chart')!
    const a = nodes.find(node => node.id === 'a')!
    const b = nodes.find(node => node.id === 'b')!
    expect(frame.width).toBe(400)
    expect(frame.data.ganttGraph?.specialLines).toHaveLength(1)
    expect(a.data.ganttPixelsPerUnit).toBe(frame.data.ganttGraph?.pixelsPerUnit)
    expect(b.position.x + b.width!).toBeCloseTo(400 - 16 - GANTT_SECTION_INSET)
    expect(a.zIndex).toBeGreaterThan(frame.zIndex!)
    const axis = nodes.find(node => node.id === '__gantt_axis__chart')!
    expect(axis.zIndex).toBeGreaterThan(nodes.find(node => node.id === 'chart')!.zIndex!)
  })

  it('forces Gantt dependencies to ignore persisted anchors', () => {
    const m = parse(`model {
      chart = ganttGraph { a = ganttTask { start "1" duration "2" } b = ganttMilestone { start "3" } }
      a -> b anchor l r
    } views { view v { include * } }`)
    const { edges } = modelToFlow(m, view(m))
    expect(edges[0].sourceHandle).toBeUndefined()
    expect(edges[0].targetHandle).toBeUndefined()
    expect(edges[0].data).toMatchObject({ chartRelation: 'gantt' })
    expect(edges[0].zIndex).toBe(2500)
  })

  it('routes all task/milestone combinations with milestone-aware corners', () => {
    const m = parse(`model {
      chart = ganttGraph {
        t1 = ganttTask { start "1" duration "1" }
        t2 = ganttTask { start "2" duration "1" }
        m1 = ganttMilestone { start "3" }
        m2 = ganttMilestone { start "4" }
      }
      t1 -> m1
      m1 -> t2
      m1 -> m2
    } views { view v { include * } }`)
    const { edges } = modelToFlow(m, view(m))
    const relation = (source: string, target: string) => edges.find(edge => edge.source === source && edge.target === target)!
    expect(relation('t1', 'm1').data).toMatchObject({ chartRelation: 'gantt', ganttTargetMilestone: true })
    expect(relation('m1', 't2').data).toMatchObject({ chartRelation: 'gantt', ganttTargetMilestone: false })
    expect(relation('m1', 'm2').data).toMatchObject({ chartRelation: 'gantt', ganttTargetMilestone: true })

    const taskTarget = ganttAttachmentPoints(
      { x: 10, y: 20, width: 30, height: 10 },
      { x: 80, y: 60, width: 40, height: 12 },
      false,
    )
    expect(taskTarget).toEqual({ source: { x: 40, y: 25 }, target: { x: 80, y: 60 } })
    const milestoneTarget = ganttAttachmentPoints(
      { x: 10, y: 20, width: 26, height: 26 },
      { x: 80, y: 60, width: 26, height: 26 },
      true,
    )
    expect(milestoneTarget).toEqual({ source: { x: 36, y: 33 }, target: { x: 93, y: 60 } })
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
    const axis = nodes.find(n => n.id === '__gantt_axis__chart')!
    const spec = nodes.find(n => n.id === 'spec')!
    const rev = nodes.find(n => n.id === 'rev')!
    expect(band.height!).toBeGreaterThan(spec.height! + rev.height!)
    expect(band.zIndex).toBeLessThan(axis.zIndex!)
    expect(axis.zIndex).toBeLessThan(spec.zIndex!)
    for (const t of [spec, rev]) {
      expect(t.position.x).toBeGreaterThan(band.position.x)
      expect(t.position.x + t.width!).toBeLessThan(band.position.x + band.width!)
      expect(t.position.y).toBeGreaterThan(band.position.y)
      expect(t.position.y + t.height!).toBeLessThan(band.position.y + band.height!)
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
