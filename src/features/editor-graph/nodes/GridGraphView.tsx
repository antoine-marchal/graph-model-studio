import type { GridFrame } from '@/core/layout'

/** Draws the N×M matrix chrome (cells, headers, axis titles, cell fills) behind
 *  the gridItem nodes. Items are separate React Flow children placed in cells. */
export function GridGraphView({ frame, stroke, text, accent }: {
  frame: GridFrame
  stroke: string
  text: string
  accent: string
}) {
  const { cols, rows, cellW, cellH, originX, originY, xHeaders, yHeaders, xLabel, yLabel, cellBg } = frame
  const gridW = cols * cellW
  const gridH = rows * cellH
  const cells: JSX.Element[] = []
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const bg = cellBg[`${r},${c}`]
      if (bg) cells.push(<rect key={`b${r}-${c}`} x={originX + (c - 1) * cellW} y={originY + (r - 1) * cellH} width={cellW} height={cellH} fill={bg} opacity={0.55} />)
    }
  }
  const vlines: JSX.Element[] = []
  for (let c = 0; c <= cols; c++) vlines.push(<line key={`v${c}`} x1={originX + c * cellW} y1={originY} x2={originX + c * cellW} y2={originY + gridH} stroke={stroke} strokeWidth={1} opacity={0.5} />)
  const hlines: JSX.Element[] = []
  for (let r = 0; r <= rows; r++) hlines.push(<line key={`h${r}`} x1={originX} y1={originY + r * cellH} x2={originX + gridW} y2={originY + r * cellH} stroke={stroke} strokeWidth={1} opacity={0.5} />)

  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%">
      {cells}
      {vlines}
      {hlines}
      {/* column headers */}
      {xHeaders.slice(0, cols).map((h, i) => (
        <text key={`xh${i}`} x={originX + i * cellW + cellW / 2} y={originY - 9} fontSize={10} fontWeight={700} textAnchor="middle" fill={text} fillOpacity={0.85}>{h}</text>
      ))}
      {/* row headers */}
      {yHeaders.slice(0, rows).map((h, i) => (
        <text key={`yh${i}`} x={originX - 8} y={originY + i * cellH + cellH / 2 + 3} fontSize={10} fontWeight={700} textAnchor="end" fill={text} fillOpacity={0.85}>{h}</text>
      ))}
      {/* axis titles */}
      {xLabel && <text x={originX + gridW / 2} y={originY - 22} fontSize={11} fontWeight={700} textAnchor="middle" fill={accent}>{xLabel}</text>}
      {yLabel && <text x={12} y={originY + gridH / 2} fontSize={11} fontWeight={700} textAnchor="middle" fill={accent} transform={`rotate(-90 12 ${originY + gridH / 2})`}>{yLabel}</text>}
    </svg>
  )
}
