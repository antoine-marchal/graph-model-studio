import { describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'
import { notationRegistry } from '@/core/notation'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { snakeArcCurve, snakeFlowCurve, snakeSelfLoopCurve } from '@/features/editor-graph/edges/FloatingEdge'

const source = `model {
  snake = snakeGraph "Delivery" {
    maxColumns "3"
    one = snakeBullet "One"
    two = snakeBullet "Two"
    left = snakeBullet "Left"
    right = snakeBullet "Right"
    join = snakeBullet "Join"
  }
  one -> two : snakeFlow
  two -> left : snakeFlow
  two -> right : snakeFlow
  left -> join : snakeFlow
  right -> join : snakeFlow
}
views { view main { include * autolayout lr } }`

describe('snake diagram', () => {
  it('registers and parses snake objects', () => {
    expect(notationRegistry.getElementDef('snakeGraph')?.notation).toBe('snake')
    expect(notationRegistry.getElementDef('snakeBullet')?.shape).toBe('snakeBullet')
    expect(notationRegistry.getRelationDef('snakeFlow')?.notation).toBe('snake')
    const model = parseDsl(source).model!
    expect(model.elements.snake.notation).toBe('snake')
    expect(model.elements.one.notation).toBe('snake')
  })

  it('wraps at maxColumns while keeping explicit fork and merge relations selectable', () => {
    const model = parseDsl(source).model!
    const styledRelation = Object.values(model.relations).find(relation => relation.sourceId === 'two' && relation.targetId === 'left')!
    styledRelation.label = 'branch'
    styledRelation.sourceHandle = 'b'
    styledRelation.targetHandle = 't'
    styledRelation.properties = { sourceCard: '1', targetCard: '0..*', accentColor: '#22C55E' }
    const view = Object.values(model.views)[0]
    const { nodes, edges } = modelToFlow(model, view)
    const frame = nodes.find(node => node.id === 'snake')!
    const bullets = ['one', 'two', 'left', 'right', 'join'].map(id => nodes.find(node => node.id === id)!)

    expect(frame.data.chartFrame?.paths).toHaveLength(4) // explicit successors replace all affected default lanes; start/end remain
    expect(frame.data.chartFrame?.arrows).toHaveLength(1)
    expect(frame.data.chartFrame?.arrows?.[0]).toMatchObject({ size: 34, color: '#FF9828' })
    expect(edges.filter(edge => Object.values(model.relations).some(relation => relation.id === edge.id))).toHaveLength(5)
    const explicit = edges.find(edge => edge.source === 'two' && edge.target === 'left')!
    expect(explicit).toMatchObject({ sourceHandle: 'b', targetHandle: 't' })
    expect(explicit.data).toMatchObject({ label: 'branch', sourceLabel: '1', targetLabel: '0..*', middleArrow: 'directed', middleArrowColor: '#22C55E', underlayStroke: '#3E4F8A', snakeSourceSide: 'r', snakeTargetSide: 'l' })
    expect(explicit.zIndex).toBeLessThan(bullets[0].zIndex!)
    expect(explicit.style).toMatchObject({ stroke: '#22C55E', strokeWidth: 3 })
    expect(bullets.every(node => node.parentId === 'snake')).toBe(true)
    expect(bullets.every(node => (node.zIndex ?? 0) > Math.max(...edges.map(edge => edge.zIndex ?? 0)))).toBe(true)
    expect(bullets[3].position.y).toBeGreaterThan(bullets[0].position.y)
    expect(bullets[3].position.x).toBeGreaterThan(bullets[4].position.x) // second row reverses
    expect(bullets.map(node => node.data.badge)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('accepts predecessor and successor properties without edge declarations', () => {
    const model = parseDsl(`model {
      snake = snakeGraph { maxColumns "2"
        start = snakeBullet { successor "left, right" }
        left = snakeBullet
        right = snakeBullet
        end = snakeBullet { predecessor "left, right" }
      }
    } views { view main { include * } }`).model!
    const frame = modelToFlow(model, Object.values(model.views)[0]).nodes.find(node => node.id === 'snake')!
    expect(frame.data.chartFrame?.paths).toHaveLength(12) // four property links replace affected defaults, plus start/end stubs
  })

  it('centres short snakes and decorates every root and leaf', () => {
    const model = parseDsl(`model {
      snake = snakeGraph { maxColumns "5"
        a = snakeBullet
        b = snakeBullet
        c = snakeBullet
        d = snakeBullet
      }
      a -> b : snakeFlow
      c -> d : snakeFlow
    } views { view main { include * } }`).model!
    const { nodes } = modelToFlow(model, Object.values(model.views)[0])
    const frame = nodes.find(node => node.id === 'snake')!
    const a = nodes.find(node => node.id === 'a')!
    const d = nodes.find(node => node.id === 'd')!
    expect((a.position.x + d.position.x + d.width!) / 2).toBeCloseTo(frame.width! / 2)
    expect(frame.data.chartFrame?.paths).toHaveLength(8) // two roots and two leaves, two strokes each
    expect(frame.data.chartFrame?.arrows).toHaveLength(2)
    expect(frame.data.chartFrame?.arrows?.every(arrow => arrow.size === 34)).toBe(true)
  })

  it('uses continuous cubics driven by Snake row direction', () => {
    const right = snakeFlowCurve({ x: 100, y: 40 }, { x: 100, y: 220 }, 'r', 'r')
    expect(right.path).toMatch(/^M 100,40 C /)
    expect(right.path).not.toMatch(/[LQ]/)
    expect(right.controls.every(control => control.x > 100)).toBe(true)
    const left = snakeFlowCurve({ x: 100, y: 40 }, { x: 100, y: 220 }, 'l', 'l')
    expect(left.controls.every(control => control.x < 100)).toBe(true)
    const forward = snakeFlowCurve({ x: 100, y: 40 }, { x: 250, y: 40 }, 'r', 'l')
    expect(forward.controls[0].x).toBeGreaterThan(100)
    expect(forward.controls[1].x).toBeLessThan(250)
    expect(forward.midpoint.y).toBe(40)
    // Skipping a bullet bows above the lane so the skipped badge stays visible.
    const skip = snakeFlowCurve({ x: 100, y: 40 }, { x: 400, y: 40 }, 'r', 'l')
    expect(skip.midpoint.y).toBeLessThan(40 - 19)
  })

  it('uses a manual step number when set and round-trips it through the DSL', () => {
    const model = parseDsl(source).model!
    model.elements.left.properties = { ...model.elements.left.properties, number: '3a' }
    const badges = Object.fromEntries(modelToFlow(model, model.views.main).nodes.map(node => [node.id, node.data.badge]))
    expect(badges).toMatchObject({ one: '1', two: '2', left: '3a', right: '4' })
    expect(parseDsl(serializeModel(model)).model!.elements.left.properties?.number).toBe('3a')
  })

  it('parts an A→B / B→A pair into an eye and keeps selected rails under every bullet', () => {
    const model = parseDsl(source.replace('  one -> two : snakeFlow', '  one -> two : snakeFlow\n  two -> one : snakeFlow')).model!
    const { nodes, edges } = modelToFlow(model, Object.values(model.views)[0])
    const pair = edges.filter(edge => (edge.source === 'one' && edge.target === 'two') || (edge.source === 'two' && edge.target === 'one'))
    expect(pair.map(edge => (edge.data as { snakeReverse?: boolean }).snakeReverse)).toEqual([true, true])
    const a = snakeArcCurve({ x: 0, y: 0 }, { x: 150, y: 0 }), b = snakeArcCurve({ x: 150, y: 0 }, { x: 0, y: 0 })
    expect(Math.sign(a.midpoint.y)).toBe(-Math.sign(b.midpoint.y))
    expect(Math.abs(a.midpoint.y - b.midpoint.y)).toBeGreaterThan(40)
    // React Flow adds the bullet's z to its edges, plus 1000 for a selected edge and 1000 for a
    // selected endpoint: the rail must still stay under the bullet's own z.
    expect(nodes.some(node => model.elements[node.id]?.type === 'snakeBullet')).toBe(true)
    expect(Math.max(...pair.map(edge => edge.zIndex ?? 0)) + 2000).toBeLessThan(0)
  })

  it('reserves headroom above rows holding a self-loop and keeps U-turns clear of captions', () => {
    const loopSource = source.replace('  one -> two : snakeFlow', '  one -> two : snakeFlow\n  join -> join : snakeFlow')
    const plain = layoutYs(source)
    const looped = layoutYs(loopSource)
    expect(looped.one).toBe(plain.one)
    expect(looped.join - looped.one).toBeGreaterThan(plain.join - plain.one)
    const loop = snakeSelfLoopCurve({ x: 0, y: 0 })
    expect(loop.midpoint.y).toBeLessThan(-55)
    const turn = snakeFlowCurve({ x: 0, y: 0 }, { x: 0, y: 126 }, 'r', 'r')
    expect(turn.controls[0].x * 0.75).toBeGreaterThanOrEqual(90)
  })
})

function layoutYs(dsl: string) {
  const model = parseDsl(dsl).model!
  const { nodes } = modelToFlow(model, Object.values(model.views)[0])
  return Object.fromEntries(nodes.map(node => [node.id, node.position.y]))
}
