import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'

describe('DSL Serializer', () => {
  it('round-trips a simple model', () => {
    const original = `model {
  user = person "User"
  app = softwareSystem "Application"

  user -> app "Uses"
}

views {
  view main {
    include *
    autolayout lr
  }
}`

    const parsed = parseDsl(original)
    expect(parsed.success).toBe(true)
    const serialized = serializeModel(parsed.model!)

    // Re-parse the serialized version
    const reparsed = parseDsl(serialized)
    expect(reparsed.success).toBe(true)
    expect(Object.keys(reparsed.model!.elements)).toHaveLength(2)
    expect(Object.keys(reparsed.model!.relations)).toHaveLength(1)
    expect(Object.keys(reparsed.model!.views)).toHaveLength(1)
  })

  it('preserves element names and types', () => {
    const dsl = `model {
  u = person "Alice"
  s = softwareSystem "My System"
}
views { view v { include * autolayout tb } }`

    const model = parseDsl(dsl).model!
    const serialized = serializeModel(model)
    expect(serialized).toContain('u = person "Alice"')
    expect(serialized).toContain('s = softwareSystem "My System"')
  })

  it('serializes relations with labels', () => {
    const dsl = `model {
  a = node "A"
  b = node "B"
  a -> b "connects to"
}
views { view v { include * autolayout tb } }`

    const model = parseDsl(dsl).model!
    const serialized = serializeModel(model)
    expect(serialized).toContain('-> b "connects to"')
  })

  it('serializes views with autolayout', () => {
    const dsl = `model {
  a = node "A"
}
views {
  view myView {
    include *
    autolayout lr
  }
}`
    const model = parseDsl(dsl).model!
    const serialized = serializeModel(model)
    expect(serialized).toContain('view myView')
    expect(serialized).toContain('autolayout lr')
  })

  it('serializes nested elements', () => {
    const dsl = `model {
  sys = softwareSystem "System" {
    web = container "Web App" {
      technology "React"
    }
  }
}
views { view v { include * autolayout tb } }`

    const model = parseDsl(dsl).model!
    const serialized = serializeModel(model)
    // sys should be root, web nested inside
    expect(serialized).toContain('sys = softwareSystem "System"')
    expect(serialized).toContain('web = container "Web App"')
  })

  it('serializes description', () => {
    const dsl = `model {
  u = person "User" {
    description "An important person"
  }
}
views { view v { include * autolayout tb } }`

    const model = parseDsl(dsl).model!
    const serialized = serializeModel(model)
    expect(serialized).toContain('description "An important person"')
  })
})

describe('DSL round-trip: positions, sizes, anchors', () => {
  it('preserves node positions, manual sizes and pinned edge anchors', () => {
    const dsl = `model {
  a = container "A" {
    size 300 180
  }
  b = node "B"

  a -> b : flow "x" anchor r l
}

views {
  view main {
    include *
    autolayout lr
    a at 120 40
    b at 500 60
  }
}`
    const r1 = parseDsl(dsl)
    expect(r1.success).toBe(true)
    const m = r1.model!
    expect(m.elements['a'].size).toEqual({ width: 300, height: 180 })
    const rel = Object.values(m.relations)[0]
    expect(rel.sourceHandle).toBe('r')
    expect(rel.targetHandle).toBe('l')
    expect(m.views['main'].layoutPositions['a']).toEqual({ x: 120, y: 40 })
    expect(m.views['main'].layoutPositions['b']).toEqual({ x: 500, y: 60 })

    // serialize -> reparse must be stable
    const out = serializeModel(m)
    const r2 = parseDsl(out)
    expect(r2.success).toBe(true)
    const m2 = r2.model!
    expect(m2.elements['a'].size).toEqual({ width: 300, height: 180 })
    const rel2 = Object.values(m2.relations)[0]
    expect(rel2.sourceHandle).toBe('r')
    expect(rel2.targetHandle).toBe('l')
    expect(m2.views['main'].layoutPositions['b']).toEqual({ x: 500, y: 60 })
  })
})
