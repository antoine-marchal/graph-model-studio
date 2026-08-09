import { beforeEach, describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { parseXyPointList } from '@/features/properties-panel/xy-series-points'
import { useModelStore } from '@/store'

const source = `model {
  chart = xyChart "Metrics" {
    series = xySeries "Observed" {
      old = xyPoint "Old" { x "1" y "2" }
    }
    annotation = group "Chart annotation"
  }
}
views { view main { include * annotation at 210 170 } }`

describe('XY series point tools', () => {
  beforeEach(() => {
    const parsed = parseDsl(source)
    expect(parsed.model).toBeTruthy()
    useModelStore.getState().loadModel(parsed.model!)
  })

  it('parses point rows with an optional bubble size', () => {
    expect(parseXyPointList('[[0, 5], [10, 12, 8]]')).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 12, size: 8 },
    ])
    expect(() => parseXyPointList('[[0]]')).toThrow(/Point 1/)
    expect(() => parseXyPointList('[[0, 1, -2]]')).toThrow(/bubble size/)
  })

  it('replaces a series point list as one undoable command', () => {
    const before = useModelStore.getState().past.length
    useModelStore.getState().dispatch({
      type: 'REPLACE_XY_SERIES_POINTS',
      payload: { seriesId: 'series', points: [{ x: 3, y: 4 }, { x: 5, y: 6, size: 9 }] },
    })

    const model = useModelStore.getState().model
    expect(model.elements.old).toBeUndefined()
    expect(model.elements.series.children).toHaveLength(2)
    expect(model.elements.series.children.map(id => model.elements[id].properties)).toEqual([
      { x: '3', y: '4' },
      { x: '5', y: '6', size: '9' },
    ])
    expect(useModelStore.getState().past).toHaveLength(before + 1)

    useModelStore.getState().undo()
    expect(useModelStore.getState().model.elements.old).toBeTruthy()
  })

  it('keeps an embedded XY series as a draggable React Flow node', () => {
    const model = useModelStore.getState().model
    const flow = modelToFlow(model, model.views.main)
    const series = flow.nodes.find(node => node.id === 'series')

    expect(series?.parentId).toBe('chart')
    expect(series?.data.embeddedSeries).toBe(true)
    expect(series?.position).toMatchObject({ x: 5, y: 38 })
    expect(series?.data.seriesColor).toBe('#3B82F6')
    expect(flow.nodes.some(node => node.id === 'old')).toBe(false)
  })

  it('preserves free positions for ordinary nodes nested in a chart', () => {
    const model = useModelStore.getState().model
    let annotation = modelToFlow(model, model.views.main).nodes.find(node => node.id === 'annotation')
    expect(annotation?.parentId).toBe('chart')
    expect(annotation?.position).toEqual({ x: 210, y: 170 })

    useModelStore.getState().dispatch({
      type: 'APPLY_LAYOUT',
      payload: { viewId: 'main', positions: { annotation: { x: 330, y: 245 } } },
    })
    const updated = useModelStore.getState().model
    annotation = modelToFlow(updated, updated.views.main).nodes.find(node => node.id === 'annotation')
    expect(annotation?.position).toEqual({ x: 330, y: 245 })
  })
})
