import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultView, createEmptyModel } from '@/core/model'
import {
  clearFormatClipboard,
  copyElementFormat,
  copyRelationFormat,
  elementFormatFor,
  relationFormatFor,
} from '@/features/editor-graph/style-clipboard'

describe('style clipboard', () => {
  beforeEach(clearFormatClipboard)

  it('copies node colors and size without copying semantic properties', () => {
    const model = createEmptyModel()
    model.views.default = createDefaultView()
    model.elements.source = {
      id: 'source', name: 'Source', type: 'node', notation: 'generic', tags: [], children: [],
      properties: { accentColor: '#112233', backgroundColor: '#445566', owner: 'Alice' },
    }
    model.elements.target = {
      id: 'target', name: 'Target', type: 'node', notation: 'generic', tags: [], children: [],
      properties: { accentColor: '#FFFFFF', owner: 'Bob' },
    }
    model.views.default.nodeSizes.source = { width: 240, height: 110 }

    expect(copyElementFormat(model, 'default', 'source')).toBe(true)
    expect(elementFormatFor(model, 'target')).toEqual({
      properties: { owner: 'Bob', accentColor: '#112233', backgroundColor: '#445566' },
      size: { width: 240, height: 110 },
    })
  })

  it('copies relation type, colors, direction and both anchor directions only', () => {
    const model = createEmptyModel()
    model.views.default = createDefaultView()
    model.relations.source = {
      id: 'source', sourceId: 'a', targetId: 'b', notation: 'generic', type: 'dependency',
      direction: 'bidirectional', sourceHandle: 'r', targetHandle: 'l', tags: [],
      properties: { accentColor: '#123456', weight: '8' },
    }
    model.relations.target = {
      id: 'target', sourceId: 'c', targetId: 'd', notation: 'generic', type: 'rel',
      direction: 'directed', tags: [], properties: { accentColor: '#FFFFFF', weight: '2' },
    }

    expect(copyRelationFormat(model, 'source')).toBe(true)
    expect(relationFormatFor(model, 'target')).toEqual({
      type: 'dependency', direction: 'bidirectional', sourceHandle: 'r', targetHandle: 'l',
      properties: { weight: '2', accentColor: '#123456' },
    })
  })
})

