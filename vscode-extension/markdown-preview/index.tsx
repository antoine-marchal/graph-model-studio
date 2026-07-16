import React from 'react'
import ReactDOM from 'react-dom/client'
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

async function waitForGraphReady(shadow: ShadowRoot, generation: number, figure: DiagramElement): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!isCurrent(generation, figure)) return false
    await delay(40)
    const workspace = shadow.querySelector('.gms-graph-workspace')
    const nodes = Array.from(shadow.querySelectorAll<HTMLElement>('.react-flow__node'))
    if (workspace && nodes.length > 0 && nodes.every(node => {
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return isCurrent(generation, figure)
    }
  }
  return isCurrent(generation, figure)
}

async function renderDiagram(figure: DiagramElement, generation: number): Promise<void> {
  if (!isCurrent(generation, figure) || figure.dataset.gmcRendered === 'true') return
  figure.dataset.gmcRendered = 'true'

  const id = figure.dataset.gmcId || 'diagram'
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof ReactDOM.createRoot> | undefined
  try {
    const source = sourceFromBase64(figure.dataset.gmcSource ?? '')
    const parsed = parseDsl(source)
    if (!parsed.model) throw new Error(parsed.diagnostics[0]?.message ?? 'Unable to parse GMC')

    const model = parsed.model
    if (Object.keys(model.views).length === 0) {
      const view = createDefaultView()
      model.views[view.id] = view
    }
    const preferredView = figure.dataset.gmcView
      ? Object.values(model.views).find(view => view.id === figure.dataset.gmcView || view.name === figure.dataset.gmcView)
      : undefined
    const activeViewId = preferredView?.id ?? Object.keys(model.views)[0] ?? null
    const requestedTheme = figure.dataset.gmcTheme
    const theme = requestedTheme === 'light' || requestedTheme === 'dark'
      ? requestedTheme
      : document.body.classList.contains('vscode-light') ? 'light' : 'dark'

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

    host = document.createElement('div')
    host.className = theme
    host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;display:block;'
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = shadowCss()
    const mount = document.createElement('div')
    mount.style.width = `${dimension(figure.dataset.gmcWidth, 1600, 320)}px`
    mount.style.height = `${dimension(figure.dataset.gmcHeight, 1000, 240)}px`
    mount.style.display = 'flex'
    shadow.append(style, mount)
    document.body.append(host)

    root = ReactDOM.createRoot(mount)
    root.render(<GraphPanel />)
    if (!await waitForGraphReady(shadow, generation, figure)) return
    if (document.fonts) await Promise.race([document.fonts.ready, delay(200)])
    if (!isCurrent(generation, figure)) return

    const workspace = shadow.querySelector('.gms-graph-workspace') as HTMLElement | null
    if (!workspace) throw new Error('Graph canvas did not initialize')
    const dataUrl = await pngBytesToDataUrl(await captureGraphPng(workspace))
    if (!isCurrent(generation, figure)) return

    const image = document.createElement('img')
    image.className = 'gmc-markdown-png'
    image.src = dataUrl
    image.alt = `Graph Model Studio diagram: ${id}`
    figure.replaceChildren(image)
  } catch (error) {
    if (isCurrent(generation, figure)) {
      figure.classList.add('gmc-markdown-error')
      figure.textContent = `GMC diagram "${id}" could not be generated: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    root?.unmount()
    host?.remove()
  }
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
