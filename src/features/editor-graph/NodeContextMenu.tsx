import { useEffect, useRef } from 'react'
import { NodeTypePicker } from './NodeTypePicker'

export interface ContextMenuState {
  x: number
  y: number
  /** flow coords where the new node should be placed */
  flowX: number
  flowY: number
}

export function NodeContextMenu({
  state,
  onPick,
  onClose,
}: {
  state: ContextMenuState
  onPick: (elementType: string, flowX: number, flowY: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  // clamp position to viewport
  const left = Math.min(state.x, window.innerWidth - 260)
  const top = Math.min(state.y, window.innerHeight - 380)

  return (
    <div
      ref={ref}
      className="fixed z-50 flex max-h-[60vh] w-60 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-sm shadow-2xl"
      style={{ left, top }}
    >
      <NodeTypePicker
        onPick={t => { onPick(t, state.flowX, state.flowY); onClose() }}
        onClose={onClose}
      />
    </div>
  )
}
