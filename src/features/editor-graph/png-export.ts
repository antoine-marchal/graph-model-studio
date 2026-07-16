import { toPng } from 'html-to-image'

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Capture the canvas using the original application's transparent, cropped PNG behavior. */
export async function captureGraphPng(wrapper: HTMLElement): Promise<Uint8Array> {
  const wrapperRect = wrapper.getBoundingClientRect()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const expand = (rect: DOMRect) => {
    if (rect.width === 0 && rect.height === 0) return
    minX = Math.min(minX, rect.left)
    minY = Math.min(minY, rect.top)
    maxX = Math.max(maxX, rect.right)
    maxY = Math.max(maxY, rect.bottom)
  }

  wrapper.querySelectorAll('.react-flow__node').forEach(node => expand(node.getBoundingClientRect()))
  wrapper.querySelectorAll('.react-flow__edge-path').forEach(path => expand((path as SVGGraphicsElement).getBoundingClientRect()))
  wrapper.querySelectorAll('.react-flow__edgelabel-renderer > *').forEach(label => expand(label.getBoundingClientRect()))
  if (!isFinite(minX)) throw new Error('The active graph view has no visible content to export.')

  const padding = 24
  const ratio = 2
  const cropX = (minX - wrapperRect.left - padding) * ratio
  const cropY = (minY - wrapperRect.top - padding) * ratio
  const cropWidth = (maxX - minX + 2 * padding) * ratio
  const cropHeight = (maxY - minY + 2 * padding) * ratio
  const skippedClasses = [
    'react-flow__background',
    'react-flow__controls',
    'react-flow__minimap',
    'react-flow__panel',
    'react-flow__attribution',
  ]
  const reactFlow = wrapper.querySelector('.react-flow') as HTMLElement | null
  const previousBackground = reactFlow?.style.backgroundColor
  if (reactFlow) reactFlow.style.backgroundColor = 'transparent'

  // SVG presentation values containing CSS custom properties do not survive
  // html-to-image when the graph lives in an isolated Shadow DOM (Markdown
  // preview). Resolve edge strokes to concrete colours for the capture, just
  // as EdgeMarkers already does for arrowheads and other SVG markers.
  const materializedStrokes = Array.from(wrapper.querySelectorAll<SVGPathElement>('.react-flow__edge-path')).map(path => ({
    path,
    value: path.style.getPropertyValue('stroke'),
    priority: path.style.getPropertyPriority('stroke'),
  }))
  for (const { path } of materializedStrokes) {
    const stroke = getComputedStyle(path).stroke
    if (stroke && stroke !== 'none') path.style.setProperty('stroke', stroke, 'important')
  }

  let fullUrl: string
  try {
    fullUrl = await toPng(wrapper, {
      pixelRatio: ratio,
      backgroundColor: undefined,
      filter: node => !(node instanceof Element) || !skippedClasses.some(className => node.classList?.contains(className)),
    })
  } finally {
    if (reactFlow) reactFlow.style.backgroundColor = previousBackground ?? ''
    for (const { path, value, priority } of materializedStrokes) {
      if (value) path.style.setProperty('stroke', value, priority)
      else path.style.removeProperty('stroke')
    }
  }

  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = reject
    image.src = fullUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cropWidth))
  canvas.height = Math.max(1, Math.round(cropHeight))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create a PNG export canvas.')
  context.drawImage(image, cropX, cropY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
  return dataUrlToBytes(canvas.toDataURL('image/png'))
}

export function pngBytesToDataUrl(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode the PNG export.'))
    reader.readAsDataURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }))
  })
}
