import { toPng } from 'html-to-image'

export interface GraphCaptureWorkspace extends HTMLElement {
  __gmsGetContentBounds?: () => { x: number; y: number; width: number; height: number }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Capture the canvas using the original application's transparent, cropped PNG behavior. */
export async function captureGraphPng(wrapper: HTMLElement): Promise<Uint8Array> {
  const graphWrapper = wrapper as GraphCaptureWorkspace
  const contentBounds = graphWrapper.__gmsGetContentBounds?.()
  if (contentBounds && contentBounds.width > 0 && contentBounds.height > 0) {
    return captureCompleteGraph(graphWrapper, contentBounds)
  }

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

/**
 * Rasterize the complete graph in model coordinates. React Flow normally clips
 * its viewport to the visible editor. Moving that viewport onto a canvas sized
 * from getNodesBounds means portrait/tall graphs are present in the source
 * raster instead of trying to recover them with a crop afterwards.
 */
async function captureCompleteGraph(
  wrapper: GraphCaptureWorkspace,
  bounds: { x: number; y: number; width: number; height: number },
): Promise<Uint8Array> {
  const reactFlow = wrapper.querySelector<HTMLElement>('.react-flow')
  const viewport = wrapper.querySelector<HTMLElement>('.react-flow__viewport')
  if (!reactFlow || !viewport) throw new Error('The graph viewport did not initialize.')

  const padding = 32
  const width = Math.max(1, Math.ceil(bounds.width + padding * 2))
  const height = Math.max(1, Math.ceil(bounds.height + padding * 2))
  const skippedClasses = [
    'react-flow__background',
    'react-flow__controls',
    'react-flow__minimap',
    'react-flow__panel',
    'react-flow__attribution',
  ]
  const saved = {
    wrapperWidth: wrapper.style.getPropertyValue('width'),
    wrapperHeight: wrapper.style.getPropertyValue('height'),
    reactFlowWidth: reactFlow.style.getPropertyValue('width'),
    reactFlowHeight: reactFlow.style.getPropertyValue('height'),
    reactFlowOverflow: reactFlow.style.getPropertyValue('overflow'),
    reactFlowBackground: reactFlow.style.getPropertyValue('background-color'),
    viewportTransform: viewport.style.getPropertyValue('transform'),
  }

  const materializedStrokes = materializeEdgeStrokes(wrapper)
  try {
    wrapper.style.setProperty('width', `${width}px`, 'important')
    wrapper.style.setProperty('height', `${height}px`, 'important')
    reactFlow.style.setProperty('width', `${width}px`, 'important')
    reactFlow.style.setProperty('height', `${height}px`, 'important')
    reactFlow.style.setProperty('overflow', 'visible', 'important')
    reactFlow.style.setProperty('background-color', 'transparent', 'important')
    viewport.style.setProperty(
      'transform',
      `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`,
      'important',
    )
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const dataUrl = await toPng(wrapper, {
      pixelRatio: 2,
      width,
      height,
      backgroundColor: undefined,
      filter: node => !(node instanceof Element) || !skippedClasses.some(className => node.classList?.contains(className)),
    })
    return dataUrlToBytes(dataUrl)
  } finally {
    restoreProperty(wrapper, 'width', saved.wrapperWidth)
    restoreProperty(wrapper, 'height', saved.wrapperHeight)
    restoreProperty(reactFlow, 'width', saved.reactFlowWidth)
    restoreProperty(reactFlow, 'height', saved.reactFlowHeight)
    restoreProperty(reactFlow, 'overflow', saved.reactFlowOverflow)
    restoreProperty(reactFlow, 'background-color', saved.reactFlowBackground)
    restoreProperty(viewport, 'transform', saved.viewportTransform)
    restoreEdgeStrokes(materializedStrokes)
  }
}

function materializeEdgeStrokes(wrapper: HTMLElement) {
  const strokes = Array.from(wrapper.querySelectorAll<SVGPathElement>('.react-flow__edge-path')).map(path => ({
    path,
    value: path.style.getPropertyValue('stroke'),
    priority: path.style.getPropertyPriority('stroke'),
  }))
  for (const { path } of strokes) {
    const stroke = getComputedStyle(path).stroke
    if (stroke && stroke !== 'none') path.style.setProperty('stroke', stroke, 'important')
  }
  return strokes
}

function restoreEdgeStrokes(strokes: ReturnType<typeof materializeEdgeStrokes>) {
  for (const { path, value, priority } of strokes) {
    if (value) path.style.setProperty('stroke', value, priority)
    else path.style.removeProperty('stroke')
  }
}

function restoreProperty(element: HTMLElement, property: string, value: string) {
  if (value) element.style.setProperty(property, value)
  else element.style.removeProperty(property)
}

export function pngBytesToDataUrl(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode the PNG export.'))
    reader.readAsDataURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }))
  })
}
