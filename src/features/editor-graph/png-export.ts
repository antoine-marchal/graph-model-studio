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
  await waitForStableGraph(graphWrapper)
  const nodeBounds = graphWrapper.__gmsGetContentBounds?.()
  if (nodeBounds && nodeBounds.width > 0 && nodeBounds.height > 0) {
    return captureCompleteGraph(graphWrapper, renderedContentBounds(graphWrapper, nodeBounds))
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
  return dataUrlToBytes(trimCanvas(canvas).toDataURL('image/png'))
}

/** Pixels at or below this alpha are background: the last fringe of a soft shadow, not content. */
const TRIM_ALPHA = 10

/**
 * Crop a transparent capture to its visible pixels, edge to edge: slides and
 * documents place the diagram themselves, so any margin baked into the PNG
 * shows up as an off-centre gap.
 */
export function trimCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source
  const context = source.getContext('2d')
  if (!context || !width || !height) return source
  const box = alphaBounds(context.getImageData(0, 0, width, height).data, width, height)
  if (!box || (box.x === 0 && box.y === 0 && box.width === width && box.height === height)) return source
  const out = document.createElement('canvas')
  out.width = box.width
  out.height = box.height
  out.getContext('2d')!.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
  return out
}

/** Smallest box holding every pixel more opaque than `threshold` (RGBA data), or null when none is. */
export function alphaBounds(data: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = TRIM_ALPHA): { x: number; y: number; width: number; height: number } | null {
  let top = height, bottom = -1, left = width, right = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] <= threshold) continue
      if (y < top) top = y
      bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  return bottom < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

async function trimDataUrl(dataUrl: string): Promise<Uint8Array> {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = reject
    image.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) return dataUrlToBytes(dataUrl)
  context.drawImage(image, 0, 0)
  return dataUrlToBytes(trimCanvas(canvas).toDataURL('image/png'))
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

  // Covers arrowheads and stroke widths not part of the measured geometry; the trim removes it.
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
    viewportTransition: viewport.style.getPropertyValue('transition'),
  }

  const materializedStrokes = materializeEdgeStrokes(wrapper)
  try {
    wrapper.style.setProperty('width', `${width}px`, 'important')
    wrapper.style.setProperty('height', `${height}px`, 'important')
    reactFlow.style.setProperty('width', `${width}px`, 'important')
    reactFlow.style.setProperty('height', `${height}px`, 'important')
    reactFlow.style.setProperty('overflow', 'visible', 'important')
    reactFlow.style.setProperty('background-color', 'transparent', 'important')
    viewport.style.setProperty('transition', 'none', 'important')
    viewport.style.setProperty(
      'transform',
      `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`,
      'important',
    )
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const dataUrl = await toPng(wrapper, {
      pixelRatio: exportPixelRatio(width, height),
      width,
      height,
      backgroundColor: undefined,
      filter: node => !(node instanceof Element) || !skippedClasses.some(className => node.classList?.contains(className)),
    })
    // The padding keeps strokes, arrowheads and labels that overhang node bounds; the trim then removes it.
    return await trimDataUrl(dataUrl)
  } finally {
    restoreProperty(wrapper, 'width', saved.wrapperWidth)
    restoreProperty(wrapper, 'height', saved.wrapperHeight)
    restoreProperty(reactFlow, 'width', saved.reactFlowWidth)
    restoreProperty(reactFlow, 'height', saved.reactFlowHeight)
    restoreProperty(reactFlow, 'overflow', saved.reactFlowOverflow)
    restoreProperty(reactFlow, 'background-color', saved.reactFlowBackground)
    restoreProperty(viewport, 'transform', saved.viewportTransform)
    restoreProperty(viewport, 'transition', saved.viewportTransition)
    restoreEdgeStrokes(materializedStrokes)
  }
}

/**
 * Node bounds widened to everything drawn around them: edge routes that leave
 * the nodes' box, arrowheads and edge labels. Without this the capture canvas,
 * sized from the nodes alone, cuts relations off at its border.
 */
function renderedContentBounds(
  wrapper: HTMLElement,
  nodes: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const viewport = wrapper.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport) return nodes
  // Screen → flow coordinates: the viewport is a 0×0 box at the flow origin, scaled by the zoom.
  const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a || 1
  const origin = viewport.getBoundingClientRect()
  let minX = nodes.x, minY = nodes.y, maxX = nodes.x + nodes.width, maxY = nodes.y + nodes.height
  const drawn = wrapper.querySelectorAll('.react-flow__edge-path, .react-flow__edge path[marker-end], .react-flow__edge text, .react-flow__edgelabel-renderer > *, .react-flow__edges marker')
  drawn.forEach(element => {
    const rect = element.getBoundingClientRect()
    if (!rect.width && !rect.height) return
    minX = Math.min(minX, (rect.left - origin.left) / zoom)
    minY = Math.min(minY, (rect.top - origin.top) / zoom)
    maxX = Math.max(maxX, (rect.right - origin.left) / zoom)
    maxY = Math.max(maxY, (rect.bottom - origin.top) / zoom)
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Raster scale: crisp on slides and in documents (≈4000 px on the long side), within canvas limits. */
export function exportPixelRatio(width: number, height: number): number {
  const long = Math.max(width, height, 1)
  return Math.max(2, Math.min(4, 4000 / long, 16000 / long))
}

/** Wait until measured node geometry is unchanged across consecutive paints. */
async function waitForStableGraph(wrapper: GraphCaptureWorkspace): Promise<void> {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  const images = Array.from(wrapper.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(images.map(image => image.complete ? image.decode?.().catch(() => undefined) : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
  })))

  let previous = ''
  let stableFrames = 0
  for (let attempt = 0; attempt < 60 && stableFrames < 3; attempt++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const bounds = wrapper.__gmsGetContentBounds?.()
    const nodes = Array.from(wrapper.querySelectorAll<HTMLElement>('.react-flow__node'))
    const signature = bounds && bounds.width > 0 && bounds.height > 0
      ? [bounds.x, bounds.y, bounds.width, bounds.height, nodes.length, ...nodes.flatMap(node => [node.offsetWidth, node.offsetHeight])].join(':')
      : ''
    stableFrames = signature && signature === previous ? stableFrames + 1 : 0
    previous = signature
  }
  if (!previous) throw new Error('The active graph view has no measured content to export.')
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
