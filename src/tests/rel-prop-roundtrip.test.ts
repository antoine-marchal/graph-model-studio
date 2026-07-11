import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'

describe('relation property round-trip', () => {
  it('keeps cardinality properties through serialize→reparse', () => {
    const src = `model {
  a = umlClass "A"
  b = umlClass "B"
  a -> b : association {
    sourceCard "1"
    targetCard "0..*"
  }
}
views { view v { include * } }`
    const m1 = parseDsl(src).model!
    const rel1 = Object.values(m1.relations)[0]
    expect(rel1.properties).toMatchObject({ sourceCard: '1', targetCard: '0..*' })
    const dsl = serializeModel(m1)
    expect(dsl).toContain('sourceCard "1"')
    const m2 = parseDsl(dsl).model!
    expect(Object.values(m2.relations)[0].properties).toMatchObject({ sourceCard: '1', targetCard: '0..*' })
  })
})
