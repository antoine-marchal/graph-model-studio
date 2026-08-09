export interface XyPointValue {
  x: number
  y: number
  size?: number
}

export function parseXyPointList(source: string): XyPointValue[] {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('Enter valid JSON, for example [[0, 5], [10, 12, 8]].')
  }
  if (!Array.isArray(value)) throw new Error('The value must be a list of point lists.')
  return value.map((row, index) => {
    if (!Array.isArray(row) || row.length < 2 || row.length > 3) {
      throw new Error(`Point ${index + 1} must be [x, y] or [x, y, bubbleSize].`)
    }
    const [x, y, size] = row
    if (![x, y].every(item => typeof item === 'number' && Number.isFinite(item))) {
      throw new Error(`Point ${index + 1} has an invalid x or y value.`)
    }
    if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size <= 0)) {
      throw new Error(`Point ${index + 1} has an invalid bubble size.`)
    }
    return { x, y, ...(size === undefined ? {} : { size }) }
  })
}
