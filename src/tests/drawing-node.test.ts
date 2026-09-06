import { describe, expect, it } from 'vitest'
import { drawingCanvasHeight, drawingImageDataUrl, drawingStrokePath, parseDrawingStrokes, resizedDrawingCrop, serializeDrawingStrokes, smoothDrawingPoint } from '@/features/editor-graph/drawing-strokes'
import { isNodeOnTop, ON_TOP_Z_INDEX } from '@/features/editor-graph/node-layering'
import { parseDsl } from '@/core/dsl/parser'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { serializeModel } from '@/core/dsl/serializer'
import { hasTransparentBackground, supportsTransparentBackground } from '@/features/editor-graph/node-appearance'

describe('drawing nodes', () => {
  it('round-trips normalized strokes and rejects malformed data', () => {
    const strokes = [[{ x: 0.123456, y: 0.75 }, { x: 1.2, y: -1 }]]
    const encoded = serializeDrawingStrokes(strokes)
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(encoded).not.toContain('[{')
    expect(Array.from(atob(encoded).slice(0, 2), character => character.charCodeAt(0))).toEqual([0x1f, 0x8b])
    expect(parseDrawingStrokes(encoded)).toEqual([[
      { x: 0.1235, y: 0.75 },
      { x: 1, y: 0 },
    ]])
    // Legacy drawings containing raw JSON remain readable.
    expect(parseDrawingStrokes('[[{"x":0.25,"y":0.5}]]')).toEqual([[{ x: 0.25, y: 0.5 }]])
    expect(parseDrawingStrokes(btoa('[[{"x":0.4,"y":0.6}]]'))).toEqual([[{ x: 0.4, y: 0.6 }]])
    expect(parseDrawingStrokes('{bad')).toEqual([])
  })

  it('uses the full node height when its title is empty', () => {
    expect(drawingCanvasHeight('Drawing', 200)).toBe(174)
    expect(drawingCanvasHeight('', 200)).toBe(200)
    expect(drawingCanvasHeight('   ', 200)).toBe(200)
  })

  it('moves the crop origin without resizing the underlying canvas', () => {
    const frame = { canvasWidth: 300, canvasHeight: 200, cropX: 10, cropY: 5 }
    expect(resizedDrawingCrop(frame, { x: 100, y: 80 }, { x: 140, y: 105 })).toEqual({
      canvasWidth: 300,
      canvasHeight: 200,
      cropX: 50,
      cropY: 30,
    })
    expect(resizedDrawingCrop(frame, { x: 100, y: 80 }, { x: 20, y: 20 })).toMatchObject({ cropX: 0, cropY: 0 })
  })

  it('ranges from raw input to strong smoothing', () => {
    const previous = { x: 0, y: 0 }
    expect(smoothDrawingPoint(previous, { x: 1, y: 1 }, 0)).toEqual({ x: 1, y: 1 })
    expect(smoothDrawingPoint(previous, { x: 1, y: 1 }, 100)).toEqual({ x: 0.12, y: 0.12 })
    expect(drawingStrokePath([previous, { x: 1, y: 1 }], 100, 50)).toContain('L 100 50')
  })

  it('loads drawing data from the DSL into the rendered node', () => {
    const image = 'data:image/png;base64,iVBORw0KGgo='
    const parsed = parseDsl(`model {
      sketch = drawing "Sketch" { smoothing "72" strokes "[[{\\\"x\\\":0.1,\\\"y\\\":0.2}]]" image "${image}" canvasWidth "320" canvasHeight "210" cropX "24" cropY "12" }
    } views { view v { include * } }`)
    expect(parsed.diagnostics.filter(item => item.severity === 'error')).toHaveLength(0)
    const model = parsed.model!
    const node = modelToFlow(model, model.views.v).nodes.find(item => item.id === 'sketch')!
    expect(node.data.drawingSmoothing).toBe(72)
    expect(parseDrawingStrokes(node.data.drawingStrokes)).toEqual([[{ x: 0.1, y: 0.2 }]])
    expect(node.data.drawingImage).toBe(image)
    expect(node.data.drawingCanvasWidth).toBe(320)
    expect(node.data.drawingCanvasHeight).toBe(210)
    expect(node.data.drawingCropX).toBe(24)
    expect(node.data.drawingCropY).toBe(12)
    expect(serializeModel(model)).toContain(`image "${image}"`)
    expect(serializeModel(model)).toContain('canvasWidth "320"')
    expect(serializeModel(model)).toContain('cropX "24"')
  })

  it('accepts only base64 image data URLs', () => {
    expect(drawingImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBeTruthy()
    expect(drawingImageDataUrl('data:image/svg+xml,<svg/>')).toBeUndefined()
    expect(drawingImageDataUrl('https://example.com/image.png')).toBeUndefined()
  })
})

describe('on-top nodes', () => {
  it('recognizes only the enabled flag and reserves a high layer', () => {
    expect(isNodeOnTop({ onTop: 'true' })).toBe(true)
    expect(isNodeOnTop({ onTop: 'TRUE' })).toBe(true)
    expect(isNodeOnTop({ onTop: 'false' })).toBe(false)
    expect(ON_TOP_Z_INDEX).toBeGreaterThan(3000)
  })

  it('maps the DSL flag to the highest normal node layer', () => {
    const parsed = parseDsl(`model { back = group { front = node { onTop "true" } } } views { view v { include * } }`)
    const model = parsed.model!
    const front = modelToFlow(model, model.views.v).nodes.find(node => node.id === 'front')!
    expect(front.zIndex).toBeGreaterThanOrEqual(ON_TOP_Z_INDEX)
  })
})

describe('transparent node backgrounds', () => {
  it('supports drawings, declared containers, and nodes containing children', () => {
    expect(supportsTransparentBackground('drawing', 'drawing', 0)).toBe(true)
    expect(supportsTransparentBackground('group', 'container', 0)).toBe(true)
    expect(supportsTransparentBackground('node', 'roundedRectangle', 1)).toBe(true)
    expect(supportsTransparentBackground('node', 'roundedRectangle', 0)).toBe(false)
    expect(hasTransparentBackground({ transparentBackground: 'TRUE' })).toBe(true)
  })

  it('renders transparent drawing and container fills from the DSL', () => {
    const parsed = parseDsl(`model {
      sketch = drawing { transparentBackground "true" }
      box = group { transparentBackground "true" child = node }
    } views { view v { include * } }`)
    const model = parsed.model!
    const nodes = modelToFlow(model, model.views.v).nodes
    for (const id of ['sketch', 'box']) {
      const node = nodes.find(candidate => candidate.id === id)!
      expect(node.data.fill).toBe('transparent')
      expect(node.data.transparentBackground).toBe(true)
    }
  })
})
