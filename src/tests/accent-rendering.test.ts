import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseDsl } from '@/core/dsl/parser'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { EdgeMarkers } from '@/features/editor-graph/edges/EdgeMarkers'

function render(source: string) {
  const parsed = parseDsl(source)
  expect(parsed.diagnostics.filter(item => item.severity === 'error')).toHaveLength(0)
  if (!parsed.model) throw new Error('Expected model')
  return modelToFlow(parsed.model, Object.values(parsed.model.views)[0])
}

describe('accent rendering', () => {
  it('derives light backgrounds while using the chosen accent for strokes', () => {
    const out = render(`model {
      c4 = softwareSystem { accentColor "#123456" }
      generic = node { accentColor "#123456" }
      mind = mindmapGraph { accentColor "#123456" root = mindmapRoot { accentColor "#123456" } }
      fish = problem { accentColor "#123456" cause1 = cause { accentColor "#123456" sub = subCause { accentColor "#123456" } } }
      seq = seqGraph { accentColor "#123456" participant1 = participant { accentColor "#123456" } }
      task1 = pertTask { accentColor "#123456" }
      milestone1 = pertMilestone { accentColor "#123456" }
      quad = quadrantChart { accentColor "#123456" qitem = quadrantItem { accentColor "#123456" } }
      grid = gridGraph { accentColor "#123456" gitem = gridItem { row "1" col "1" accentColor "#123456" } }
      git = gitGraph { accentColor "#123456" commit1 = commit { accentColor "#123456" } merge1 = mergeCommit { accentColor "#123456" } }
    } views { view v { include * autolayout lr } }`)

    const ids = ['c4', 'generic', 'mind', 'root', 'fish', 'cause1', 'sub', 'seq', 'participant1', 'task1', 'milestone1', 'quad', 'qitem', 'grid', 'gitem', 'git', 'commit1', 'merge1']
    const containers = new Set(['mind', 'fish', 'cause1', 'seq', 'quad', 'grid', 'git'])
    for (const id of ids) {
      const node = out.nodes.find(item => item.id === id)
      expect(node, id).toBeTruthy()
      expect(node!.data.fill, id).toBe(containers.has(id) ? '#F1F3F5' : '#D4DAE1')
      expect(node!.data.stroke, id).toBe('#123456')
      expect(node!.data.accent, id).toBe('#123456')
      expect(node!.data.text, id).toBe('#111827')
      expect((node!.style as Record<string, unknown>)['--node-selection'], id).toBe('#0E2841')
    }
  })

  it('uses explicit node and container background overrides', () => {
    const out = render(`model {
      dark = node { accentColor "#123456" backgroundColor "#102030" }
      group1 = group { accentColor "#DC2626" containerColor "#ABCDEF" child = node }
    } views { view v { include * } }`)

    const dark = out.nodes.find(node => node.id === 'dark')!
    expect(dark.data.fill).toBe('#102030')
    expect(dark.data.stroke).toBe('#123456')
    expect(dark.data.text).toBe('#FFFFFF')

    const group = out.nodes.find(node => node.id === 'group1')!
    expect(group.data.fill).toBe('#ABCDEF')
    expect(group.data.stroke).toBe('#DC2626')
    expect(group.data.text).toBe('#111827')
  })

  it('applies relation accents to ordinary and sequence relations', () => {
    const out = render(`model {
      a = node
      b = node
      a -> b { accentColor "#DC2626" }
      seq = seqGraph { p1 = participant p2 = participant }
      p1 -> p2 : message { accentColor "#059669" }
    } views { view v { include * } }`)
    const ordinary = out.edges.find(edge => edge.source === 'a' && edge.target === 'b')!
    const sequence = out.edges.find(edge => edge.id !== ordinary.id && String(edge.source).startsWith('__seqpt_'))!
    expect(ordinary.style?.stroke).toBe('#DC2626')
    expect(ordinary.data?.selectedStroke).toBe('#A71D1D')
    expect(sequence.style?.stroke).toBe('#059669')
    expect(sequence.data?.selectedStroke).toBe('#047250')
  })

  it('lets arrow markers inherit each relation stroke', () => {
    const markup = renderToStaticMarkup(createElement(EdgeMarkers))
    expect(markup).toContain('stroke="context-stroke"')
    expect(markup).toContain('fill="context-stroke"')
  })
})
