import { describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { notationRegistry } from '@/core/notation'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { demoGraphs } from '@/demos/catalog'

describe('built-in demo graphs', () => {
  it.each(demoGraphs)('parses and renders every view in $title', demo => {
    const result = parseDsl(demo.source)
    expect(result.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([])
    expect(result.model).toBeTruthy()

    const model = result.model!
    expect(Object.keys(model.views).length).toBeGreaterThan(0)
    for (const view of Object.values(model.views)) {
      const flow = modelToFlow(model, view)
      expect(flow.nodes.length, view.name).toBeGreaterThan(0)
    }
  })

  it('covers every registered notation across the catalog', () => {
    const covered = new Set<string>()
    for (const demo of demoGraphs) {
      const model = parseDsl(demo.source).model!
      for (const element of Object.values(model.elements)) covered.add(element.notation)
    }

    const registered = notationRegistry.getNotations().map(notation => notation.kind)
    expect([...covered].sort()).toEqual([...registered].sort())
  })
})
