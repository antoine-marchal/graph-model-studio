import { useEffect, useRef, useState } from 'react'
import { useModelStore } from '@/store'

/**
 * Global SVG marker definitions referenced by edges via `url(#id)`.
 * Rendered once inside the graph editor.
 *
 * Marker strokes/fills use `context-stroke` so each marker inherits the colour
 * of the edge that references it (including relation accents and selection).
 * Hollow marker backgrounds still use a concrete theme colour because CSS
 * custom properties do not survive html-to-image's DOM→SVG serialisation.
 */
export function EdgeMarkers() {
  const theme = useModelStore(s => s.theme)
  const [bg, setBackground] = useState('#0f1623')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const root = svgRef.current?.getRootNode()
    const themeElement = root instanceof ShadowRoot ? root.host : document.documentElement
    const cs = getComputedStyle(themeElement)
    const surface = cs.getPropertyValue('--surface-0').trim() || '#0f1623'
    setBackground(surface)
  }, [theme])

  return (
    <svg ref={svgRef} width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* open V arrow */}
        <marker id="gms-arrow-open" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M2,2 L10,6 L2,10" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        {/* filled triangle arrow */}
        <marker id="gms-arrow-filled" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
          <path d="M2,2 L10,6 L2,10 Z" fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* hollow triangle (realization / specialization) */}
        <marker id="gms-triangle-hollow" viewBox="0 0 14 14" refX="12" refY="7" markerWidth="13" markerHeight="13" orient="auto-start-reverse">
          <path d="M2,2 L12,7 L2,12 Z" fill={bg} stroke="context-stroke" strokeWidth="1.3" />
        </marker>
        {/* filled diamond (composition) */}
        <marker id="gms-diamond-filled" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="16" markerHeight="11" orient="auto-start-reverse">
          <path d="M1,6 L8,2 L15,6 L8,10 Z" fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* hollow diamond (aggregation) */}
        <marker id="gms-diamond-hollow" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="16" markerHeight="11" orient="auto-start-reverse">
          <path d="M1,6 L8,2 L15,6 L8,10 Z" fill={bg} stroke="context-stroke" strokeWidth="1.3" />
        </marker>
        {/* filled ball (assignment source) */}
        <marker id="gms-ball" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <circle cx="5" cy="5" r="3.2" fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* open circle (message flow source) */}
        <marker id="gms-circle-open" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <circle cx="5" cy="5" r="3.2" fill={bg} stroke="context-stroke" strokeWidth="1.3" />
        </marker>
        {/* ERD crow's-foot "many" */}
        <marker id="gms-crow-many" viewBox="0 0 22 20" refX="20" refY="10" markerWidth="20" markerHeight="18" orient="auto-start-reverse">
          <path d="M20,10 L6,2 M20,10 L6,10 M20,10 L6,18" fill="none" stroke="context-stroke" strokeWidth="1.4" strokeLinecap="round" />
        </marker>
        {/* ERD "one" (single bar) */}
        <marker id="gms-crow-one" viewBox="0 0 16 20" refX="14" refY="10" markerWidth="14" markerHeight="18" orient="auto-start-reverse">
          <path d="M8,3 L8,17" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" />
        </marker>
        {/* ERD "zero or many" (circle + crow's foot) */}
        <marker id="gms-crow-zero-many" viewBox="0 0 30 20" refX="28" refY="10" markerWidth="26" markerHeight="18" orient="auto-start-reverse">
          <circle cx="7" cy="10" r="4" fill={bg} stroke="context-stroke" strokeWidth="1.3" />
          <path d="M28,10 L14,2 M28,10 L14,10 M28,10 L14,18" fill="none" stroke="context-stroke" strokeWidth="1.4" strokeLinecap="round" />
        </marker>
      </defs>
    </svg>
  )
}
