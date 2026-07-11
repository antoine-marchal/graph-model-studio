import { beforeEach, describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { useModelStore } from '@/store'

const source = `model {
  source = group "Source" {
    child = node "Child"
    nested = node "Nested"
  }
  target = group "Target"
  child -> nested "internal"
} views { view v { include * } }`

describe('model clipboard duplication', () => {
  beforeEach(() => {
    const parsed = parseDsl(source)
    expect(parsed.model).toBeTruthy()
    useModelStore.getState().loadModel(parsed.model!)
  })

  it('pastes a copied subtree into the selected target', () => {
    const [copyId] = useModelStore.getState().duplicateElements(['source'], { parentId: 'target' })
    const model = useModelStore.getState().model
    expect(model.elements[copyId].parentId).toBe('target')
    expect(model.elements.target.children).toContain(copyId)
    expect(model.elements[copyId].children).toHaveLength(2)
    for (const childId of model.elements[copyId].children) {
      expect(model.elements[childId].parentId).toBe(copyId)
    }
    const copiedChildren = new Set(model.elements[copyId].children)
    expect(Object.values(model.relations).some(r => copiedChildren.has(r.sourceId) && copiedChildren.has(r.targetId))).toBe(true)
  })

  it('pastes at model root when no target is selected', () => {
    const [copyId] = useModelStore.getState().duplicateElements(['child'], { parentId: null })
    const copy = useModelStore.getState().model.elements[copyId]
    expect(copy.parentId).toBeUndefined()
  })
})
