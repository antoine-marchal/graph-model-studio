import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultView, createEmptyModel } from '@/core/model'
import {
  clearFormatClipboard,
  copyElementFormat,
  copyRelationFormat,
  elementFormatFor,
  pasteElementFormatCommand,
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

  it('carries a tree node icon with its style', () => {
    const model = createEmptyModel()
    model.views.default = createDefaultView()
    const treeNode = (id: string, properties: Record<string, string>) => ({ id, name: id, type: 'treeNode', notation: 'generic' as const, tags: [], children: [], properties })
    model.elements.source = treeNode('source', { icon: 'glyph:package-blue', accentColor: '#112233' })
    model.elements.target = treeNode('target', { icon: 'glyph:package-green' })
    model.elements.plain = treeNode('plain', {})

    copyElementFormat(model, 'default', 'source')
    expect(elementFormatFor(model, 'target')?.properties).toEqual({ icon: 'glyph:package-blue', accentColor: '#112233' })
    copyElementFormat(model, 'default', 'plain')
    expect(elementFormatFor(model, 'target')?.properties).toEqual({})
  })

  it('pastes a style onto several nodes in one command', () => {
    const model = createEmptyModel()
    model.views.default = createDefaultView()
    const node = (id: string, properties: Record<string, string>) => ({ id, name: id, type: 'node', notation: 'generic' as const, tags: [], children: [], properties })
    model.elements.source = node('source', { accentColor: '#112233' })
    model.elements.a = node('a', { owner: 'A' })
    model.elements.b = node('b', {})
    copyElementFormat(model, 'default', 'source')
    const command = pasteElementFormatCommand(model, 'default', ['a', 'b', 'missing'])
    expect(command?.type === 'APPLY_ELEMENT_FORMAT' && command.payload.formats.map(f => [f.id, f.properties])).toEqual([
      ['a', { owner: 'A', accentColor: '#112233' }],
      ['b', { accentColor: '#112233' }],
    ])
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

