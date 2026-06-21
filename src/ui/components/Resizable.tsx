import { useCallback, useRef } from 'react'
import { cn } from '../primitives/cn'

/**
 * A thin draggable separator bar. Reports the pointer delta (in px) along the
 * given axis on every move; the parent decides how to apply it. Double-click
 * fires onDoubleClick (used to reset / collapse).
 */
export function ResizeHandle({
  axis = 'x',
  onResize,
  onResizeEnd,
  onDoubleClick,
  className,
}: {
  axis?: 'x' | 'y'
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  onDoubleClick?: () => void
  className?: string
}) {
  const start = useRef(0)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      start.current = axis === 'x' ? e.clientX : e.clientY
      const move = (ev: PointerEvent) => {
        const cur = axis === 'x' ? ev.clientX : ev.clientY
        onResize(cur - start.current)
        start.current = cur
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        onResizeEnd?.()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [axis, onResize, onResizeEnd],
  )

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        'group relative z-10 shrink-0 bg-[var(--border)] transition-colors',
        axis === 'x' ? 'w-px cursor-col-resize hover:bg-[var(--accent)]' : 'h-px cursor-row-resize hover:bg-[var(--accent)]',
        className,
      )}
    >
      {/* invisible wider hit area */}
      <span
        className={cn(
          'absolute',
          axis === 'x' ? '-left-1.5 -right-1.5 inset-y-0' : '-top-1.5 -bottom-1.5 inset-x-0',
        )}
      />
      {/* grip dots, visible on hover */}
      <span
        className={cn(
          'pointer-events-none absolute opacity-0 transition-opacity group-hover:opacity-100',
          axis === 'x'
            ? 'left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]'
            : 'left-1/2 top-1/2 h-[3px] w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]',
        )}
      />
    </div>
  )
}
