import { describe, expect, it } from 'vitest'
import {
  absoluteNodePosition,
  constrainDragPosition,
  droppedPosition,
  positionsCenteredAt,
  relationEndpoints,
  resizeSelection,
  type ResizeSnapshot,
} from '@/features/editor-graph/graph-interactions'
import { createDefaultView, createEmptyModel } from '@/core/model'
import { useModelStore } from '@/store'

describe('graph interactions', () => {
  it('constrains Shift-drag movement to the dominant horizontal or vertical axis', () => {
    const start = { x: 100, y: 80 }
    expect(constrainDragPosition(start, { x: 180, y: 105 })).toEqual({ x: 180, y: 80 })
    expect(constrainDragPosition(start, { x: 118, y: 160 })).toEqual({ x: 100, y: 160 })
    expect(constrainDragPosition(start, { x: 180, y: 160 }, 'vertical')).toEqual({ x: 100, y: 160 })
  })

  it('keeps connection-point anchors automatic for a new relation', () => {
    const endpoints = relationEndpoints({ source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l' })
    expect(endpoints).toEqual({ sourceId: 'a', targetId: 'b' })
    expect(endpoints).not.toHaveProperty('sourceHandle')
    expect(endpoints).not.toHaveProperty('targetHandle')
  })

  it('still resolves embedded tree and Sankey endpoints', () => {
    expect(relationEndpoints({
      source: '__treeanchor_topic_l',
      target: 'chart',
      sourceHandle: 'l',
      targetHandle: 'sankey:metric:r',
    })).toEqual({ sourceId: 'topic', targetId: 'metric' })
  })

  it('resizes every selected node and reduces container left/top padding', () => {
    const group: ResizeSnapshot = { id: 'group', position: { x: 100, y: 80 }, size: { width: 200, height: 160 } }
    const peer: ResizeSnapshot = { id: 'peer', position: { x: 400, y: 300 }, size: { width: 120, height: 70 } }
    const child: ResizeSnapshot = { id: 'child', parentId: 'group', position: { x: 40, y: 30 }, size: { width: 80, height: 50 } }
    const mutation = resizeSelection(
      'group',
      { x: 100, y: 80, width: 200, height: 160 },
      { x: 130, y: 100, width: 170, height: 140 },
      [group, peer],
      [group, peer, child],
    )

    expect(mutation.sizes.group).toEqual({ width: 170, height: 140 })
    expect(mutation.sizes.peer).toEqual({ width: 170, height: 140 })
    expect(mutation.positions.peer).toEqual({ x: 400, y: 300 })
    expect(mutation.positions.child).toEqual({ x: 10, y: 10 })
    expect(mutation.positions.group.x + mutation.positions.child.x).toBe(140)
    expect(mutation.positions.group.y + mutation.positions.child.y).toBe(110)
  })

  it('centers a pasted node or selection exactly under the mouse', () => {
    expect(positionsCenteredAt({ x: 500, y: 300 }, [
      { id: 'single', position: { x: 20, y: 40 }, size: { width: 120, height: 60 } },
    ])).toEqual({ single: { x: 440, y: 270 } })

    const multiple = positionsCenteredAt({ x: 300, y: 200 }, [
      { id: 'a', position: { x: 100, y: 100 }, size: { width: 80, height: 40 } },
      { id: 'b', position: { x: 220, y: 160 }, size: { width: 100, height: 60 } },
    ])
    expect(multiple).toEqual({ a: { x: 190, y: 140 }, b: { x: 310, y: 200 } })
  })

  it('preserves the exact canvas position when entering or leaving a group', () => {
    const group = { id: 'group', position: { x: 100, y: 50 } }
    const nested = { id: 'node', parentId: 'group', position: { x: 35, y: 45 } }
    const root = { id: 'root-node', position: { x: 260, y: 180 } }
    expect(absoluteNodePosition(nested, [group, nested, root])).toEqual({ x: 135, y: 95 })
    expect(droppedPosition(nested, undefined, [group, nested, root])).toEqual({ x: 135, y: 95 })
    expect(droppedPosition(root, group, [group, nested, root])).toEqual({ x: 160, y: 130 })
  })

  it('turns an ordinary target node into a parent and commits the drop atomically', () => {
    const model = createEmptyModel()
    model.views.default = createDefaultView()
    model.elements.group = { id: 'group', name: 'Ordinary node', type: 'node', notation: 'generic', tags: [], properties: {}, children: [] }
    model.elements.node = { id: 'node', name: 'Node', type: 'node', notation: 'generic', tags: [], properties: {}, children: [] }
    useModelStore.getState().loadModel(model)

    useModelStore.getState().dispatch({
      type: 'REPARENT_ELEMENT',
      payload: { viewId: 'default', id: 'node', parentId: 'group', position: { x: 37, y: 51 } },
    })

    const updated = useModelStore.getState().model
    expect(updated.elements.node.parentId).toBe('group')
    expect(updated.elements.group.children).toContain('node')
    expect(updated.views.default.layoutPositions.node).toEqual({ x: 37, y: 51 })
  })

  it('keeps an identical selection stable instead of notifying every marquee frame', () => {
    useModelStore.getState().selectElements(['group', 'node'])
    const selected = useModelStore.getState().selectedElementIds
    useModelStore.getState().selectElements(['group', 'node'])
    expect(useModelStore.getState().selectedElementIds).toBe(selected)
  })
})
