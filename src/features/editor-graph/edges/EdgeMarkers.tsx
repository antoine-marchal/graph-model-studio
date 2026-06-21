/**
 * Global SVG marker definitions referenced by edges via `url(#id)`.
 * Rendered once inside the graph editor. Colours follow the --edge CSS var so
 * they track the theme. Markers are notation-aware (UML/ArchiMate/BPMN heads).
 */
export function EdgeMarkers() {
  const stroke = 'var(--edge)'
  const bg = 'var(--surface-0)'
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* open V arrow */}
        <marker id="gms-arrow-open" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M2,2 L10,6 L2,10" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        {/* filled triangle arrow */}
        <marker id="gms-arrow-filled" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
          <path d="M2,2 L10,6 L2,10 Z" fill={stroke} stroke={stroke} />
        </marker>
        {/* hollow triangle (realization / specialization) */}
        <marker id="gms-triangle-hollow" viewBox="0 0 14 14" refX="12" refY="7" markerWidth="13" markerHeight="13" orient="auto-start-reverse">
          <path d="M2,2 L12,7 L2,12 Z" fill={bg} stroke={stroke} strokeWidth="1.3" />
        </marker>
        {/* filled diamond (composition) */}
        <marker id="gms-diamond-filled" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="16" markerHeight="11" orient="auto-start-reverse">
          <path d="M1,6 L8,2 L15,6 L8,10 Z" fill={stroke} stroke={stroke} />
        </marker>
        {/* hollow diamond (aggregation) */}
        <marker id="gms-diamond-hollow" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="16" markerHeight="11" orient="auto-start-reverse">
          <path d="M1,6 L8,2 L15,6 L8,10 Z" fill={bg} stroke={stroke} strokeWidth="1.3" />
        </marker>
        {/* filled ball (assignment source) */}
        <marker id="gms-ball" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <circle cx="5" cy="5" r="3.2" fill={stroke} stroke={stroke} />
        </marker>
        {/* open circle (message flow source) */}
        <marker id="gms-circle-open" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <circle cx="5" cy="5" r="3.2" fill={bg} stroke={stroke} strokeWidth="1.3" />
        </marker>
      </defs>
    </svg>
  )
}
