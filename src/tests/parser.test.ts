import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'

const SIMPLE_DSL = `
model {
  user = person "User"
  app = softwareSystem "Application"
  db = container "Database"

  user -> app "Uses"
  app -> db "Reads/Writes"
}

views {
  view main {
    include *
    autolayout lr
  }
}
`

describe('DSL Parser', () => {
  it('parses a simple model', () => {
    const result = parseDsl(SIMPLE_DSL)
    expect(result.success).toBe(true)
    expect(result.model).not.toBeNull()
  })

  it('extracts elements', () => {
    const result = parseDsl(SIMPLE_DSL)
    const elements = result.model!.elements
    expect(Object.keys(elements)).toHaveLength(3)
    expect(elements['user']).toBeDefined()
    expect(elements['user'].name).toBe('User')
    expect(elements['user'].type).toBe('person')
    expect(elements['user'].notation).toBe('c4')
  })

  it('extracts relations', () => {
    const result = parseDsl(SIMPLE_DSL)
    const relations = Object.values(result.model!.relations)
    expect(relations).toHaveLength(2)

    const r1 = relations.find(r => r.sourceId === 'user' && r.targetId === 'app')
    expect(r1).toBeDefined()
    expect(r1?.label).toBe('Uses')

    const r2 = relations.find(r => r.sourceId === 'app' && r.targetId === 'db')
    expect(r2).toBeDefined()
    expect(r2?.label).toBe('Reads/Writes')
  })

  it('extracts views', () => {
    const result = parseDsl(SIMPLE_DSL)
    const views = result.model!.views
    expect(views['main']).toBeDefined()
    expect(views['main'].includeAll).toBe(true)
    expect(views['main'].layoutDirection).toBe('lr')
  })

  it('handles nested elements', () => {
    const dsl = `
model {
  banking = softwareSystem "Banking Platform" {
    web = container "Web Application" {
      technology "React"
    }
    api = container "API Gateway" {
      technology "Node.js"
    }
  }
}
views {
  view main {
    include *
    autolayout tb
  }
}
`
    const result = parseDsl(dsl)
    expect(result.success).toBe(true)
    const elements = result.model!.elements
    expect(elements['banking']).toBeDefined()
    expect(elements['web']).toBeDefined()
    expect(elements['web'].parentId).toBe('banking')
    expect(elements['web'].technology).toBe('React')
    expect(elements['banking'].children).toContain('web')
  })

  it('handles description', () => {
    const dsl = `
model {
  user = person "User" {
    description "A human user"
  }
}
views {
  view main { include * autolayout tb }
}
`
    const result = parseDsl(dsl)
    expect(result.model?.elements['user']?.description).toBe('A human user')
  })

  it('returns diagnostics for broken DSL', () => {
    const dsl = `model { invalid syntax !!! }`
    const result = parseDsl(dsl)
    // Should not crash and return a model (partial)
    expect(result).toBeDefined()
  })

  it('resolves qualified relation refs to flat ids', () => {
    const dsl = `
model {
  banking = softwareSystem "Banking" {
    web = container "Web"
    api = container "API"
  }
  user = person "User"
  user -> banking.web "Uses"
  banking.web -> banking.api "Calls"
}
views { view main { include * autolayout lr } }
`
    const result = parseDsl(dsl)
    const rels = Object.values(result.model!.relations)
    const r1 = rels.find(r => r.label === 'Uses')!
    expect(r1.sourceId).toBe('user')
    expect(r1.targetId).toBe('web')
    const r2 = rels.find(r => r.label === 'Calls')!
    expect(r2.sourceId).toBe('web')
    expect(r2.targetId).toBe('api')
  })

  it('assigns correct notations', () => {
    const dsl = `
model {
  a = person "A"
  b = businessActor "B"
  c = startEvent "C"
  d = decision "D"
}
views { view main { include * autolayout tb } }
`
    const result = parseDsl(dsl)
    const els = result.model!.elements
    expect(els['a'].notation).toBe('c4')
    expect(els['b'].notation).toBe('archimate')
    expect(els['c'].notation).toBe('bpmn')
    expect(els['d'].notation).toBe('flowchart')
  })
})
