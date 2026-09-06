import { useCallback, useEffect, useRef, useState } from 'react'
import { useModelStore } from '@/store'
import { readClipboardImageDataUrl } from '../clipboard-image'
import {
  drawingImageDataUrl,
  drawingCanvasHeight,
  drawingStrokePath,
  parseDrawingStrokes,
  serializeDrawingStrokes,
  smoothDrawingPoint,
  type DrawingPoint,
  type DrawingStroke,
} from '../drawing-strokes'

interface DrawingNodeProps {
  id: string
  label: string
  width: number
  height: number
  fill: string
  stroke: string
  selected: boolean
  sketching: boolean
  onSketchingChange(active: boolean): void
  encodedStrokes?: string
  smoothing: number
  imageDataUrl?: string
  canvasWidth?: number
  canvasHeight?: number
  cropX?: number
  cropY?: number
}

export function DrawingNode({ id, label, width, height, fill, stroke, selected, sketching, onSketchingChange, encodedStrokes, smoothing, imageDataUrl, canvasWidth, canvasHeight, cropX = 0, cropY = 0 }: DrawingNodeProps) {
  const [strokes, setStrokes] = useState<DrawingStroke[]>(() => parseDrawingStrokes(encodedStrokes))
  const active = useRef(false)
  const strokesRef = useRef(strokes)
  const hasTitle = label.trim().length > 0
  const drawingHeight = drawingCanvasHeight(label, height)
  const contentWidth = Math.max(1, canvasWidth ?? width)
  const contentHeight = Math.max(1, canvasHeight ?? drawingHeight)

  useEffect(() => {
    if (active.current) return
    const next = parseDrawingStrokes(encodedStrokes)
    strokesRef.current = next
    setStrokes(next)
  }, [encodedStrokes])

  const update = (next: DrawingStroke[]) => {
    strokesRef.current = next
    setStrokes(next)
  }
  const pointFor = (element: SVGSVGElement, clientX: number, clientY: number): DrawingPoint => {
    const rect = element.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height))),
    }
  }
  const commit = () => {
    if (!active.current) return
    active.current = false
    const element = useModelStore.getState().model.elements[id]
    if (!element) return
    useModelStore.getState().dispatch({
      type: 'UPDATE_ELEMENT',
      payload: { id, properties: { ...element.properties, strokes: serializeDrawingStrokes(strokesRef.current) } },
    })
  }
  const setImage = useCallback((image: string | undefined) => {
    const element = useModelStore.getState().model.elements[id]
    if (!image || !element) return
    useModelStore.getState().dispatch({
      type: 'UPDATE_ELEMENT',
      payload: { id, properties: { ...element.properties, image } },
    })
  }, [id])
  const pasteImage = useCallback((clipboardData: DataTransfer): boolean => {
    const file = Array.from(clipboardData.items)
      .find(item => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile()
      ?? Array.from(clipboardData.files).find(candidate => candidate.type.startsWith('image/'))
    if (!file) return false
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const image = typeof reader.result === 'string' ? drawingImageDataUrl(reader.result) : undefined
      setImage(image)
    })
    reader.readAsDataURL(file)
    return true
  }, [setImage])

  useEffect(() => {
    if (!selected) return
    const onPaste = (event: ClipboardEvent) => {
      const selection = useModelStore.getState().selectedElementIds
      if (selection.length !== 1 || selection[0] !== id || !event.clipboardData) return
      if (pasteImage(event.clipboardData)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      void readClipboardImageDataUrl().then(setImage)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [id, pasteImage, selected, setImage])

  useEffect(() => {
    if (!sketching) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSketchingChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSketchingChange, sketching])

  const image = drawingImageDataUrl(imageDataUrl)

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded border ${selected ? 'ring-2 ring-[var(--node-selection)] ring-offset-1' : ''}`}
      style={{ background: fill, borderColor: stroke }}
    >
      {hasTitle && (
        <div className="flex h-[26px] cursor-move items-center border-b px-2 text-[10px] font-semibold" style={{ borderColor: stroke + '55', color: stroke }} title="Drag to move the drawing">
          <span className="truncate">{label}</span>
        </div>
      )}
      <svg
        className={`${sketching ? 'nodrag nopan cursor-crosshair' : 'cursor-move'} block touch-none`}
        width={contentWidth}
        height={contentHeight}
        viewBox={`0 0 ${contentWidth} ${contentHeight}`}
        style={{ transform: `translate(${-cropX}px, ${-cropY}px)` }}
        role="img"
        tabIndex={0}
        data-sketching={sketching ? 'true' : 'false'}
        aria-label={hasTitle ? `Drawing surface for ${label}` : 'Drawing surface'}
        onDoubleClick={event => {
          event.preventDefault()
          event.stopPropagation()
          useModelStore.getState().selectElements([id])
          event.currentTarget.focus()
          onSketchingChange(true)
        }}
        onPointerDown={event => {
          if (!sketching) {
            useModelStore.getState().selectElements([id])
            event.currentTarget.focus()
            return
          }
          event.preventDefault()
          event.stopPropagation()
          useModelStore.getState().selectElements([id])
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          active.current = true
          update([...strokesRef.current, [pointFor(event.currentTarget, event.clientX, event.clientY)]])
        }}
        onPointerMove={event => {
          if (!active.current) return
          event.preventDefault()
          const next = pointFor(event.currentTarget, event.clientX, event.clientY)
          const all = strokesRef.current
          const current = all[all.length - 1]
          const previous = current[current.length - 1]
          const point = smoothDrawingPoint(previous, next, smoothing)
          update([...all.slice(0, -1), [...current, point]])
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
      >
        {image && <image href={image} x="0" y="0" width={contentWidth} height={contentHeight} preserveAspectRatio="xMidYMid meet" />}
        {strokes.map((drawnStroke, index) => (
          <path
            key={index}
            d={drawingStrokePath(drawnStroke, contentWidth, contentHeight)}
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  )
}
