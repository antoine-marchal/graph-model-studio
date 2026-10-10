import { beforeEach, describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'
import { useModelStore } from '@/store'

const source = `model {
  outer = group "Outer" {
    a = node "A"
    b = node "B"
  }
  c = node "C"
} views { view v "V" { include outer, a, b, c } }`

describe('group elements', () => {
  beforeEach(() => {
    useModelStore.getState().loadModel(parseDsl(source).model!)
  })

  it('wraps siblings in a new group under their common parent, enclosing their rects', () => {
    useModelStore.getState().dispatch({
      type: 'GROUP_ELEMENTS',
      payload: {
        viewId: 'v', id: 'grp', type: 'group', name: 'Group', notation: 'generic', memberIds: ['a', 'b'],
        rects: { outer: { x: 100, y: 100, width: 500, height: 300 }, a: { x: 200, y: 200, width: 100, height: 50 }, b: { x: 400, y: 260, width: 100, height: 50 } },
      },
    })
    const { model } = useModelStore.getState()
    expect(model.elements.grp.parentId).toBe('outer')
    expect(model.elements.outer.children).toEqual(['grp'])
    expect(model.elements.grp.children).toEqual(['a', 'b'])
    expect(model.views.v.includedElements).toContain('grp')
    expect(model.views.v.layoutPositions.grp).toEqual({ x: 76, y: 40 })
    expect(model.views.v.layoutPositions.a).toEqual({ x: 24, y: 60 })
    expect(model.views.v.nodeSizes.grp).toEqual({ width: 348, height: 194 })
    const reparsed = parseDsl(serializeModel(model)).model!
    expect(reparsed.elements.a.parentId).toBe('grp')
  })

  it('groups members with different parents at top level and keeps nested members inside their own parent', () => {
    useModelStore.getState().dispatch({
      type: 'GROUP_ELEMENTS',
      payload: { viewId: 'v', id: 'grp', type: 'group', name: 'Group', notation: 'generic', memberIds: ['outer', 'a', 'c'] },
    })
    const { model } = useModelStore.getState()
    expect(model.elements.grp.parentId).toBeUndefined()
    expect(model.elements.grp.children).toEqual(['outer', 'c'])
    expect(model.elements.a.parentId).toBe('outer')
  })
})
