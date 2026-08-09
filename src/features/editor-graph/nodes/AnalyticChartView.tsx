import type { AnalyticChartFrame, XyPointFrame } from '@/core/layout'
import { useModelStore } from '@/store'
import { Handle, Position } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'

const PAD = { l: 54, r: 24, t: 64, b: 48 }

function Legend({ series, selectedIds, onSelect, onEdit, x = 12, y = 48 }: { series: { id: string; label: string; color: string }[]; selectedIds: string[]; onSelect: (id: string, event: React.MouseEvent) => void; onEdit: (id: string, event: React.MouseEvent) => void; x?: number; y?: number }) {
  return <g>{series.map((s, i) => { const selected = selectedIds.includes(s.id); return <g key={s.id} className="nodrag nopan" transform={`translate(${x + i * 110} ${y})`} onClick={e => onSelect(s.id, e)} onDoubleClick={e => onEdit(s.id, e)} role="button" aria-label={`Select series ${s.label}`} aria-pressed={selected} style={{ cursor: 'pointer' }}><rect x="-7" y="-10" width="104" height="20" rx="4" fill={selected ? 'var(--accent)' : 'transparent'} fillOpacity={selected ? .14 : 0} stroke={selected ? 'var(--accent)' : 'none'} /><circle r="4" fill={s.color} /><text x="7" y="3" fontSize="9" fontWeight={selected ? 700 : 400} fill={selected ? 'var(--fg)' : 'var(--fg-muted)'}>{s.label}</text></g> })}</g>
}

function ChartNameEditor({ id }: { id: string }) {
  const element = useModelStore(s => s.model.elements[id])
  const dispatch = useModelStore(s => s.dispatch)
  const setEditingElement = useModelStore(s => s.setEditingElement)
  const [value, setValue] = useState(element?.name ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  if (!element) return null
  const commit = () => {
    const next = value.trim()
    if (next && next !== element.name) dispatch({ type: 'UPDATE_ELEMENT', payload: { id, name: next } })
    setEditingElement(null)
  }
  return <div className="nodrag nopan absolute left-1/2 top-9 z-[70] w-48 -translate-x-1/2" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <input ref={ref} value={value} onChange={event => setValue(event.target.value)} onBlur={commit} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') commit(); if (event.key === 'Escape') setEditingElement(null) }} className="w-full rounded border border-[var(--accent)] bg-[var(--surface-1)] px-2 py-1 text-center text-xs font-semibold text-[var(--fg)] shadow-lg outline-none" />
  </div>
}

function regression(points: XyPointFrame[]): [number, number] | null {
  if (points.length < 2) return null
  const n = points.length, sx = points.reduce((a, p) => a + p.x, 0), sy = points.reduce((a, p) => a + p.y, 0)
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0), sxy = points.reduce((a, p) => a + p.x * p.y, 0)
  const den = n * sxx - sx * sx
  return Math.abs(den) < 1e-9 ? null : [(n * sxy - sx * sy) / den, (sy * sxx - sx * sxy) / den]
}

export function AnalyticChartView({ frame }: { frame: AnalyticChartFrame }) {
  const selectedIds = useModelStore(s => s.selectedElementIds)
  const selectedRelationId = useModelStore(s => s.selectedRelationId)
  const selectElement = useModelStore(s => s.selectElement)
  const selectRelation = useModelStore(s => s.selectRelation)
  const editingElementId = useModelStore(s => s.editingElementId)
  const setEditingElement = useModelStore(s => s.setEditingElement)
  const onSelect = (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    selectElement(id, { additive: event.ctrlKey || event.metaKey })
  }
  const onEdit = (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    selectElement(id)
    setEditingElement(id)
  }
  const { width: w, height: h } = frame
  const embeddedIds = frame.kind === 'sankey' ? frame.nodes.map(item => item.id)
    : frame.kind === 'xy' ? frame.series.flatMap(series => [series.id, ...series.points.map(point => point.id)])
      : frame.series.map(series => series.id)
  const nameEditor = editingElementId && embeddedIds.includes(editingElementId) ? <ChartNameEditor id={editingElementId} /> : null
  if (frame.kind === 'sankey') {
    const byId = new Map(frame.nodes.map(n => [n.id, n]))
    return <><svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
      {frame.links.map(l => { const a = byId.get(l.source), b = byId.get(l.target); if (!a || !b) return null; const x1 = a.x + a.width, y1 = l.sourceY, x2 = b.x, y2 = l.targetY, c = (x1 + x2) / 2, center = `M${x1},${y1} C${c},${y1} ${c},${y2} ${x2},${y2}`, ribbon = `M${x1},${y1-l.sourceThickness/2} C${c},${y1-l.sourceThickness/2} ${c},${y2-l.targetThickness/2} ${x2},${y2-l.targetThickness/2} L${x2},${y2+l.targetThickness/2} C${c},${y2+l.targetThickness/2} ${c},${y1+l.sourceThickness/2} ${x1},${y1+l.sourceThickness/2} Z`, selected = selectedRelationId === l.id, selectedColor = l.selectedColor ?? 'var(--accent)'; return <g key={l.id} className="nodrag nopan" onClick={e => { e.stopPropagation(); selectRelation(l.id) }} role="button" aria-label={`Select relation ${l.source} to ${l.target}`} aria-pressed={selected} style={{cursor:'pointer'}}><path d={center} fill="none" stroke="transparent" strokeWidth={Math.max(14,l.sourceThickness,l.targetThickness)} pointerEvents="stroke"/><path d={ribbon} fill={selected ? selectedColor : l.color} fillOpacity={selected ? .8 : .48} stroke={selected ? selectedColor : 'none'} strokeWidth={selected ? 2 : 0} pointerEvents="none"><title>{l.value}</title></path></g> })}
      {frame.nodes.map(n => { const selected = selectedIds.includes(n.id); return <g key={n.id} className="nodrag nopan" onClick={e => onSelect(n.id, e)} onDoubleClick={e => onEdit(n.id, e)} role="button" aria-label={`Select ${n.label}`} aria-pressed={selected} style={{ cursor: 'pointer' }}><rect x={n.x - (selected ? 3 : 0)} y={n.y - n.height / 2 - (selected ? 3 : 0)} width={n.width + (selected ? 6 : 0)} height={n.height + (selected ? 6 : 0)} rx="4" fill={n.color} stroke={selected ? n.selectedStroke : n.stroke} strokeWidth={selected ? 3 : 2} /><text x={n.x + (n.x < w / 2 ? n.width + 6 : -6)} y={n.y + 3} textAnchor={n.x < w / 2 ? 'start' : 'end'} fontSize="10" fontWeight={selected ? 700 : 600} fill="var(--fg)">{n.label}</text></g> })}
    </svg>{frame.nodes.map(n => <div key={`handles-${n.id}`} className="group nodrag nopan absolute cursor-pointer" onClick={e => onSelect(n.id,e)} onDoubleClick={e => onEdit(n.id, e)} style={{ left: `${n.x / w * 100}%`, top: `${(n.y-n.height/2) / h * 100}%`, width: `${n.width / w * 100}%`, height: `${n.height / h * 100}%` }}>
      <Handle id={`sankey:${n.id}:l`} type="source" position={Position.Left} className="nodrag nopan !h-3 !w-3 !border-2 !border-white !bg-[var(--accent)] !opacity-0 transition-opacity group-hover:!opacity-100" title={`Connect ${n.label}`} />
      <Handle id={`sankey:${n.id}:r`} type="source" position={Position.Right} className="nodrag nopan !h-3 !w-3 !border-2 !border-white !bg-[var(--accent)] !opacity-0 transition-opacity group-hover:!opacity-100" title={`Connect ${n.label}`} />
    </div>)}{nameEditor}</>
  }
  if (frame.kind === 'radar') {
    const cx = w / 2, cy = h / 2 + 10, r = Math.min(w, h) * .34, count = frame.axes.length
    const point = (i: number, ratio: number) => { const a = -Math.PI / 2 + i * Math.PI * 2 / count; return [cx + Math.cos(a) * r * ratio, cy + Math.sin(a) * r * ratio] }
    return <><svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}><Legend series={frame.series} selectedIds={selectedIds} onSelect={onSelect} onEdit={onEdit} />
      {[.2,.4,.6,.8,1].map(level => <polygon key={level} points={frame.axes.map((_,i)=>point(i,level).join(',')).join(' ')} fill="none" stroke="var(--border)" strokeWidth="1" />)}
      {frame.axes.map((a,i)=>{const [x,y]=point(i,1.16); const [ex,ey]=point(i,1); return <g key={a}><line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--border)"/><text x={x} y={y} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--fg-muted)">{a}</text></g>})}
      {frame.series.map(s => { const selected = selectedIds.includes(s.id); return <polygon key={s.id} className="nodrag nopan" points={frame.axes.map((_,i)=>point(i,Math.max(0,Math.min(1,(s.values[i]??0)/frame.max))).join(',')).join(' ')} fill={s.color} fillOpacity={selected ? .5 : .3} stroke={s.stroke} strokeWidth={selected ? 4 : 2} onClick={e => onSelect(s.id, e)} onDoubleClick={e => onEdit(s.id, e)} style={{ cursor: 'pointer' }} /> })}
    </svg>{nameEditor}</>
  }
  if (frame.kind === 'xy') {
    const pw=w-PAD.l-PAD.r, ph=h-PAD.t-PAD.b, sx=(x:number)=>PAD.l+(x-frame.xMin)/(frame.xMax-frame.xMin)*pw, sy=(y:number)=>PAD.t+ph-(y-frame.yMin)/(frame.yMax-frame.yMin)*ph
    return <><svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
      {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={PAD.l} y1={PAD.t+t*ph} x2={w-PAD.r} y2={PAD.t+t*ph} stroke="var(--border)"/><text x={PAD.l-6} y={PAD.t+t*ph+3} textAnchor="end" fontSize="9" fill="var(--fg-muted)">{(frame.yMax-t*(frame.yMax-frame.yMin)).toFixed(1)}</text><text x={PAD.l+t*pw} y={h-PAD.b+16} textAnchor="middle" fontSize="9" fill="var(--fg-muted)">{(frame.xMin+t*(frame.xMax-frame.xMin)).toFixed(1)}</text></g>)}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={h-PAD.b} stroke="var(--fg-muted)"/><line x1={PAD.l} y1={h-PAD.b} x2={w-PAD.r} y2={h-PAD.b} stroke="var(--fg-muted)"/>
      {frame.series.map(s => { const seriesSelected = selectedIds.includes(s.id); return <g key={s.id} className="nodrag nopan" onClick={e => onSelect(s.id, e)} onDoubleClick={e => onEdit(s.id, e)} style={{ cursor: 'pointer' }}>{frame.connect && <polyline points={[...s.points].sort((a,b)=>a.x-b.x).map(p=>`${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" stroke={s.stroke} strokeWidth={seriesSelected ? 3.5 : 1.5}/>} {frame.regression && (()=>{const lr=regression(s.points); return lr?<line x1={sx(frame.xMin)} y1={sy(lr[0]*frame.xMin+lr[1])} x2={sx(frame.xMax)} y2={sy(lr[0]*frame.xMax+lr[1])} stroke={s.stroke} strokeWidth={seriesSelected ? 4 : 2} strokeDasharray="6 4"/>:null})()}{s.points.map(p=>{const pointSelected=selectedIds.includes(p.id), radius=Math.min(30,p.size), px=sx(p.x), py=sy(p.y), labelOnLeft=px>PAD.l+pw*.72; return <g key={p.id} onClick={e=>onSelect(p.id,e)} onDoubleClick={e=>onEdit(p.id,e)} role="button" aria-label={`Select point ${p.label ?? p.id}`} aria-pressed={pointSelected} style={{cursor:'pointer'}}><circle cx={px} cy={py} r={Math.max(14,radius+6)} fill="transparent" pointerEvents="all"/><circle cx={px} cy={py} r={radius+(pointSelected?3:seriesSelected?2:0)} fill={s.color} fillOpacity={pointSelected ? 1 : seriesSelected ? .9 : .75} stroke={s.stroke} strokeWidth={pointSelected?3:seriesSelected?2:1} pointerEvents="none"><title>{p.label}: {p.x}, {p.y}</title></circle>{p.description&&<text x={px+(labelOnLeft?-radius-5:radius+5)} y={py+3} textAnchor={labelOnLeft?'end':'start'} fontSize="9" fontWeight="600" fill="var(--fg)" stroke="var(--surface-1)" strokeWidth="3" paintOrder="stroke" pointerEvents="none">{p.description}</text>}</g>})}</g> })}
      {frame.xLabel&&<text x={PAD.l+pw/2} y={h-8} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--fg)">{frame.xLabel}</text>}{frame.yLabel&&<text x="13" y={PAD.t+ph/2} textAnchor="middle" transform={`rotate(-90 13 ${PAD.t+ph/2})`} fontSize="11" fontWeight="600" fill="var(--fg)">{frame.yLabel}</text>}
    </svg>{nameEditor}</>
  }
  const pw=w-PAD.l-PAD.r, ph=h-PAD.t-PAD.b, count=Math.max(1,frame.categories.length), max=Math.max(1,...(frame.stacked?frame.categories.map((_,i)=>frame.series.reduce((a,s)=>a+(s.values[i]??0),0)):frame.series.flatMap(s=>s.values)))
  return <><svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}><Legend series={frame.series} selectedIds={selectedIds} onSelect={onSelect} onEdit={onEdit}/><line x1={PAD.l} y1={h-PAD.b} x2={w-PAD.r} y2={h-PAD.b} stroke="var(--fg-muted)"/><line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={h-PAD.b} stroke="var(--fg-muted)"/>
    {frame.categories.map((c,i)=>{const band=pw/count, groupW=band*.72; let offset=0; return <g key={c}>{frame.series.map((s,j)=>{const selected=selectedIds.includes(s.id), v=s.values[i]??0, bh=v/max*ph, bw=frame.stacked?groupW:groupW/Math.max(1,frame.series.length), x=PAD.l+i*band+(band-groupW)/2+(frame.stacked?0:j*bw), y=h-PAD.b-bh-offset; if(frame.stacked)offset+=bh; return <rect key={s.id} className="nodrag nopan" x={x} y={y} width={bw-2} height={bh} rx="2" fill={s.color} stroke={s.stroke} strokeWidth={selected ? 3 : 1} fillOpacity={selected ? 1 : .86} onClick={e=>onSelect(s.id,e)} onDoubleClick={e=>onEdit(s.id,e)} style={{cursor:'pointer'}}><title>{s.label}: {v}</title></rect>})}<text x={PAD.l+(i+.5)*band} y={h-PAD.b+15} textAnchor="middle" fontSize="9" fill="var(--fg-muted)">{c}</text></g>})}
    {frame.xLabel&&<text x={PAD.l+pw/2} y={h-8} textAnchor="middle" fontSize="11" fill="var(--fg)">{frame.xLabel}</text>}{frame.yLabel&&<text x="13" y={PAD.t+ph/2} textAnchor="middle" transform={`rotate(-90 13 ${PAD.t+ph/2})`} fontSize="11" fill="var(--fg)">{frame.yLabel}</text>}
  </svg>{nameEditor}</>
}
