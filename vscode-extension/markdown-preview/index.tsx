import React from 'react'
import ReactDOM from 'react-dom/client'
import '../bundled-icons'
import studioCss from '../../src/styles/global.css?inline'
import reactFlowCss from '@xyflow/react/dist/style.css?inline'
import { GraphPanel } from '../../src/app/GraphPanel'
import { parseDsl } from '../../src/core/dsl/parser'
import { createDefaultView } from '../../src/core/model'
import { captureGraphPng, pngBytesToDataUrl } from '../../src/features/editor-graph/png-export'
import { useModelStore } from '../../src/store'

interface DiagramElement extends HTMLElement {
  dataset: DOMStringMap & {
    gmcSource?: string
    gmcId?: string
    gmcView?: string
    gmcTheme?: string
    gmcWidth?: string
    gmcHeight?: string
  }
}

let requestedGeneration = 0
let renderTimer: number | undefined
let renderQueue = Promise.resolve()
const renderedPngCache = new Map<string, { dataUrl: string; chars: number }>()
const MAX_CACHE_ENTRIES = 24
const MAX_CACHE_CHARS = 48 * 1024 * 1024

const delay = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds))
const isCurrent = (generation: number, figure?: DiagramElement) => (
  generation === requestedGeneration && (!figure || figure.isConnected)
)

function sourceFromBase64(value: string): string {
  const binary = atob(value)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

function dimension(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(4096, parsed)) : fallback
}

function shadowCss(): string {
  return `${reactFlowCss}\n${studioCss}`
    .replace(/:root\s*\{/g, ':host {')
    .replace(/\.dark\s*\{/g, ':host(.dark) {')
}

const sharedShadowCss = shadowCss()

async function cacheKey(parts: string[]): Promise<string> {
  const source = parts.join('\u0000')
  if (!globalThis.crypto?.subtle) return source
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function cachedPng(key: string): string | undefined {
  const entry = renderedPngCache.get(key)
  if (!entry) return undefined
  // Refresh insertion order so Map acts as a small LRU.
  renderedPngCache.delete(key)
  renderedPngCache.set(key, entry)
  return entry.dataUrl
}

function rememberPng(key: string, dataUrl: string): void {
  const previous = renderedPngCache.get(key)
  if (previous) renderedPngCache.delete(key)
  renderedPngCache.set(key, { dataUrl, chars: dataUrl.length })
  let chars = 0
  for (const entry of renderedPngCache.values()) chars += entry.chars
  while (renderedPngCache.size > MAX_CACHE_ENTRIES || chars > MAX_CACHE_CHARS) {
    const oldest = renderedPngCache.entries().next().value as [string, { dataUrl: string; chars: number }] | undefined
    if (!oldest) break
    renderedPngCache.delete(oldest[0])
    chars -= oldest[1].chars
  }
}

function showPng(figure: DiagramElement, id: string, dataUrl: string): void {
  const image = document.createElement('img')
  image.className = 'gmc-markdown-png'
  image.src = dataUrl
  image.alt = `Graph Model Studio diagram: ${id}`
  figure.replaceChildren(image)
}

async function waitForGraphReady(shadow: ShadowRoot, alive: () => boolean): Promise<boolean> {
  let fitRequested = false
  let previousBounds = ''
  let stableSamples = 0
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!alive()) return false
    await delay(40)
    const workspace = shadow.querySelector('.gms-graph-workspace')
    const nodes = Array.from(shadow.querySelectorAll<HTMLElement>('.react-flow__node'))
    if (workspace && nodes.length > 0 && nodes.every(node => {
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })) {
      // React Flow's initial fit can run before custom nodes finish measuring,
      // and GraphEditor also has an animated fit. Explicitly fit once after all
      // nodes have dimensions so even content far below the viewport is inside
      // the rasterized canvas rather than being cropped at its fixed height.
      if (!fitRequested) {
        const fitButton = shadow.querySelector<HTMLButtonElement>(
          '.react-flow__controls-fitview, button[aria-label="fit view"]',
        )
        fitButton?.click()
        fitRequested = true
        previousBounds = ''
        stableSamples = 0
        continue
      }

      const rects = nodes.map(node => node.getBoundingClientRect())
      const bounds = [
        Math.min(...rects.map(rect => rect.left)),
        Math.min(...rects.map(rect => rect.top)),
        Math.max(...rects.map(rect => rect.right)),
        Math.max(...rects.map(rect => rect.bottom)),
      ].map(value => Math.round(value * 2) / 2).join(':')
      stableSamples = bounds === previousBounds ? stableSamples + 1 : 0
      previousBounds = bounds
      if (stableSamples >= 3) {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return alive()
      }
    }
  }
  return alive()
}

/** Lay out `source` offscreen and capture it; undefined when `alive()` turns false. */
async function rasterize(
  source: string,
  view: string | undefined,
  theme: 'light' | 'dark',
  width: number,
  height: number,
  alive: () => boolean,
): Promise<string | undefined> {
  const parsed = parseDsl(source)
  if (!parsed.model) throw new Error(parsed.diagnostics[0]?.message ?? 'Unable to parse GMC')

  const model = parsed.model
  if (Object.keys(model.views).length === 0) {
    const defaultView = createDefaultView()
    model.views[defaultView.id] = defaultView
  }
  const preferredView = view
    ? Object.values(model.views).find(candidate => candidate.id === view || candidate.name === view)
    : undefined
  const activeViewId = preferredView?.id ?? Object.keys(model.views)[0] ?? null
  useModelStore.setState({
    model,
    dslSource: source,
    activeViewId,
    selectedElementIds: [],
    selectedElementId: null,
    selectedRelationId: null,
    diagnostics: parsed.diagnostics,
    parseError: !parsed.success,
    theme,
    isDirty: false,
    past: [],
    future: [],
  })

  const host = document.createElement('div')
  host.className = theme
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;display:block;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = sharedShadowCss
  const mount = document.createElement('div')
  mount.style.width = `${width}px`
  mount.style.height = `${height}px`
  mount.style.display = 'flex'
  shadow.append(style, mount)
  document.body.append(host)

  const root = ReactDOM.createRoot(mount)
  try {
    root.render(<GraphPanel />)
    if (!await waitForGraphReady(shadow, alive)) return undefined
    if (document.fonts) await Promise.race([document.fonts.ready, delay(200)])
    if (!alive()) return undefined

    const workspace = shadow.querySelector('.gms-graph-workspace') as HTMLElement | null
    if (!workspace) throw new Error('Graph canvas did not initialize')
    const dataUrl = await pngBytesToDataUrl(await captureGraphPng(workspace))
    return alive() ? dataUrl : undefined
  } finally {
    root.unmount()
    host.remove()
  }
}

async function renderDiagram(figure: DiagramElement, generation: number): Promise<void> {
  if (!isCurrent(generation, figure) || figure.dataset.gmcRendered === 'true') return
  figure.dataset.gmcRendered = 'true'

  const id = figure.dataset.gmcId || 'diagram'
  try {
    const source = sourceFromBase64(figure.dataset.gmcSource ?? '')
    const requestedTheme = figure.dataset.gmcTheme
    const theme = requestedTheme === 'light' || requestedTheme === 'dark'
      ? requestedTheme
      : document.body.classList.contains('vscode-light') ? 'light' : 'dark'
    const width = dimension(figure.dataset.gmcWidth, 1600, 320)
    const height = dimension(figure.dataset.gmcHeight, 1000, 240)
    const key = await cacheKey([source, figure.dataset.gmcView ?? '', theme, String(width), String(height)])
    const cached = cachedPng(key)
    if (cached) {
      showPng(figure, id, cached)
      return
    }
    const dataUrl = await rasterize(source, figure.dataset.gmcView, theme, width, height, () => isCurrent(generation, figure))
    if (!dataUrl) return
    rememberPng(key, dataUrl)
    showPng(figure, id, dataUrl)
  } catch (error) {
    if (isCurrent(generation, figure)) {
      figure.classList.add('gmc-markdown-error')
      figure.textContent = `GMC diagram "${id}" could not be generated: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Render a GMC model to a PNG data URL in this (visible) webview — used by the
 * rich editor to refresh `.gmc` image embeds without opening the graph panel.
 */
export function renderPng(options: { source: string; view?: string; theme?: string; width?: number; height?: number }): Promise<string> {
  const theme = options.theme === 'light' || options.theme === 'dark'
    ? options.theme
    : document.body.classList.contains('vscode-light') ? 'light' : 'dark'
  const run = renderQueue.catch(() => undefined).then(async () => {
    const dataUrl = await rasterize(
      options.source,
      options.view,
      theme,
      dimension(String(options.width), 1600, 320),
      dimension(String(options.height), 1000, 240),
      () => true,
    )
    if (!dataUrl) throw new Error('The diagram could not be rendered')
    return dataUrl
  })
  renderQueue = run.then(() => undefined, () => undefined)
  return run
}

async function renderAll(generation: number): Promise<void> {
  if (generation !== requestedGeneration) return
  const figures = Array.from(document.querySelectorAll<DiagramElement>('.gmc-markdown-diagram'))
  for (const figure of figures) {
    if (generation !== requestedGeneration) return
    await renderDiagram(figure, generation)
  }
}

function ensurePreviewStyle() {
  if (document.getElementById('gmc-markdown-preview-style')) return
  const style = document.createElement('style')
  style.id = 'gmc-markdown-preview-style'
  style.textContent = `
    .gmc-markdown-diagram { margin: 1rem 0; min-height: 80px; }
    .gmc-markdown-loading { display:grid; min-height:80px; place-items:center; border:1px dashed var(--vscode-panel-border); border-radius:6px; color:var(--vscode-descriptionForeground); }
    .gmc-markdown-png { display:block; max-width:100%; height:auto; margin:0 auto; }
    .gmc-markdown-error { padding:12px; border-left:3px solid var(--vscode-errorForeground); color:var(--vscode-errorForeground); background:var(--vscode-textCodeBlock-background); }
  `
  document.head.append(style)
}

/** Called by the lightweight contributed loader after each Markdown content update. */
export function scheduleRender(): void {
  ensurePreviewStyle()
  const generation = ++requestedGeneration
  if (renderTimer) window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(() => {
    renderQueue = renderQueue
      .catch(() => undefined)
      .then(() => renderAll(generation))
  }, 180)
}
