import { describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'
import { glyphCatalog, glyphWords, isCharIcon, searchGlyphs } from '@/features/editor-graph/nodes/tree-icons'

describe('tree node icons', () => {
  it('treats typed emoji as text icons but paths as images', () => {
    expect(isCharIcon('📁')).toBe(true)
    expect(isCharIcon('icons/file.svg')).toBe(false)
    expect(isCharIcon('C:\\icons\\a.png')).toBe(false)
  })

  it('offers the bundled glyphs, searchable by the words of their names', () => {
    expect(glyphCatalog().length).toBeGreaterThan(200)
    expect(glyphWords('I_DELRMRobotSystem_32')).toBe('delrm robot system')
    expect(searchGlyphs('robot system').map(entry => entry.icon)).toContain('glyph:I_DELRMRobotSystem')
    expect(searchGlyphs('package green').map(entry => entry.icon)).toEqual(['glyph:package-green'])
  })

  it('keeps a picked glyph through the DSL', () => {
    const model = parseDsl('model {\n  t = treeGraph "T" {\n    f = treeNode "F" { icon "glyph:package-blue" }\n  }\n}\n').model!
    expect(parseDsl(serializeModel(model)).model!.elements.f.properties.icon).toBe('glyph:package-blue')
  })
})
