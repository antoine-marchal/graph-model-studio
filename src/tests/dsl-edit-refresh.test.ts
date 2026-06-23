import { describe, it, expect, beforeEach } from 'vitest'
import { useModelStore } from '@/store/model-store'

const base = (ax: number, ay: number, size?: string) => `model {
  a = capability "A"
  b = capability "B"
  a -> b
}
views {
  view default "Default View" {
    include *
    autolayout tb
    a at ${ax} ${ay}
    b at 200 200${size ? `\n    a size ${size}` : ''}
  }
}`

describe('editing at/size in the DSL refreshes the view', () => {
  beforeEach(() => {
    // start from a known model with stored positions (the "old" state)
    useModelStore.getState().parseDslAndUpdate(base(10, 20))
  })

  it('an edited "at" position wins over the previous one', () => {
    expect(useModelStore.getState().model.views.default.layoutPositions.a).toEqual({ x: 10, y: 20 })
    // simulate the user editing the at line in the code editor
    useModelStore.getState().parseDslAndUpdate(base(333, 444))
    expect(useModelStore.getState().model.views.default.layoutPositions.a).toEqual({ x: 333, y: 444 })
  })

  it('an edited "size" wins over the previous one', () => {
    useModelStore.getState().parseDslAndUpdate(base(10, 20, '120 90'))
    expect(useModelStore.getState().model.views.default.nodeSizes.a).toEqual({ width: 120, height: 90 })
    useModelStore.getState().parseDslAndUpdate(base(10, 20, '300 210'))
    expect(useModelStore.getState().model.views.default.nodeSizes.a).toEqual({ width: 300, height: 210 })
  })

  it('keeps a position the edited DSL no longer mentions (gap-fill)', () => {
    // b had a position; an edit that drops only a's line should not disturb b
    const noA = `model {
  a = capability "A"
  b = capability "B"
  a -> b
}
views {
  view default "Default View" {
    include *
    autolayout tb
    b at 200 200
  }
}`
    useModelStore.getState().parseDslAndUpdate(noA)
    expect(useModelStore.getState().model.views.default.layoutPositions.b).toEqual({ x: 200, y: 200 })
  })
})
