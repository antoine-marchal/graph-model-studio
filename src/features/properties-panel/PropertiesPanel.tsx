import { useState, useEffect, useRef, useCallback } from 'react'
import { useModelStore } from '@/store'
import { Input } from '@/ui/components/Input'
import { Select } from '@/ui/components/Select'
import { Button } from '@/ui/components/Button'
import { notationRegistry } from '@/core/notation'
import { ACCENT_PALETTE, deriveAccentColors, normalizeHexColor } from '@/core/notation'
import { NodeTypePicker, TypeSwatch } from '@/features/editor-graph/NodeTypePicker'
import {
  copyElementFormat,
  copyRelationFormat,
  elementFormatFor,
  hasElementFormat,
  hasRelationFormat,
  relationFormatFor,
} from '@/features/editor-graph/style-clipboard'
import { parseXyPointList } from './xy-series-points'

/** Searchable element-type selector — same picker as the canvas add-node menu. */
function TypeField({ value, onPick }: { value: string; onPick: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const def = notationRegistry.getElementDef(value)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm text-[var(--fg)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:bg-[var(--surface-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/15"
      >
        {def && <TypeSwatch t={def} size={14} />}
        <span className="truncate">{def?.label ?? value}</span>
        <span className="ml-auto shrink-0 text-[var(--fg-subtle)]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl">
          <NodeTypePicker
            currentType={value}
            showRecents={false}
            onPick={t => { onPick(t); setOpen(false) }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--fg-subtle)]">{label}</label>
      {children}
    </div>
  )
}

function AccentColorField({ value, fallback, nodeColor, containerColor, onChange, onNodeColorChange, onContainerColorChange, onClear }: {
  value?: string
  fallback: string
  nodeColor?: string
  containerColor?: string
  onChange: (value: string) => void
  onNodeColorChange?: (value: string) => void
  onContainerColorChange?: (value: string) => void
  onClear: () => void
}) {
  const normalized = normalizeHexColor(value) ?? normalizeHexColor(fallback) ?? ACCENT_PALETTE[0]
  const [draft, setDraft] = useState(normalized)
  const colors = deriveAccentColors(normalized)
  const resolvedNodeColor = normalizeHexColor(nodeColor) ?? colors.tertiary
  const resolvedContainerColor = normalizeHexColor(containerColor) ?? colors.container

  useEffect(() => setDraft(normalized), [normalized])

  const commitDraft = () => {
    const next = normalizeHexColor(draft)
    if (next) onChange(next)
    else setDraft(normalized)
  }

  return (
    <div className="space-y-2 rounded border border-[var(--border)] bg-[var(--surface-2)]/40 p-2">
      <div className="grid grid-cols-5 gap-1.5" aria-label="Accent color palette">
        {ACCENT_PALETTE.map(color => (
          <button
            key={color}
            type="button"
            aria-label={`Use accent ${color}`}
            title={color}
            onClick={() => onChange(color)}
            className="h-6 rounded border transition-transform hover:scale-105"
            style={{ background: color, borderColor: normalized === color ? 'var(--fg)' : 'transparent', boxShadow: normalized === color ? '0 0 0 1px var(--surface-1)' : undefined }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={normalized} onChange={event => onChange(event.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5" aria-label="Choose accent color" />
        <Input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={event => { if (event.key === 'Enter') commitDraft() }}
          placeholder="#4F46E5"
        />
      </div>
      <div className={`grid gap-1.5 text-center text-[9px] text-[var(--fg-subtle)] ${onNodeColorChange ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <div className="space-y-0.5"><span>Stroke</span><span className="block h-4 rounded border border-black/10" style={{ background: colors.primary }} title={colors.primary} /></div>
        {onNodeColorChange && (
          <label className="cursor-pointer space-y-0.5" title="Click to force the node background color">
            <span>Node</span>
            <span className="block h-4 rounded border border-black/10" style={{ background: resolvedNodeColor }} />
            <input type="color" value={resolvedNodeColor} onChange={event => onNodeColorChange(event.target.value.toUpperCase())} className="sr-only" aria-label="Force node background color" />
          </label>
        )}
        {onContainerColorChange && (
          <label className="cursor-pointer space-y-0.5" title="Click to force the container background color">
            <span>Container</span>
            <span className="block h-4 rounded border border-black/10" style={{ background: resolvedContainerColor }} />
            <input type="color" value={resolvedContainerColor} onChange={event => onContainerColorChange(event.target.value.toUpperCase())} className="sr-only" aria-label="Force container background color" />
          </label>
        )}
      </div>
      <Button type="button" size="sm" variant="ghost" className="w-full" onClick={onClear}>Clear colors</Button>
    </div>
  )
}

/** Custom-property fields shown per element type, grouped under a labelled box. */
interface PropFieldSpec { key: string; label: string; placeholder: string; multiline?: boolean }
const CUSTOM_PROP_FIELDS: Record<string, { group: string; fields: PropFieldSpec[] }> = {
  ganttGraph: { group: 'Schedule axis', fields: [
    { key: 'prefix', label: 'Unit prefix', placeholder: 'e.g. PI, Sprint, D' },
    { key: 'firstUnit', label: 'First unit', placeholder: 'e.g. 10' },
    { key: 'firstDate', label: 'First date (YYYY-MM-DD)', placeholder: 'e.g. 2026-01-01' },
  ] },
  ganttTask: { group: 'Schedule', fields: [
    { key: 'start', label: 'Start (date or unit)', placeholder: 'e.g. 2026-08-03 or 1' },
    { key: 'duration', label: 'Duration (date or units)', placeholder: 'e.g. 5d, 2w or 2' },
    { key: 'progress', label: 'Progress (0–100)', placeholder: 'e.g. 60' },
  ] },
  ganttMilestone: { group: 'Schedule', fields: [
    { key: 'start', label: 'Start (date or unit)', placeholder: 'e.g. 2026-08-03 or 1' },
  ] },
  pertTask: { group: 'PERT', fields: [
    { key: 'duration', label: 'Duration (time units)', placeholder: 'e.g. 5' },
  ] },
  timelineEvent: { group: 'Timeline', fields: [
    { key: 'date', label: 'Date', placeholder: 'e.g. 2026 or 2026-03' },
  ] },
  snakeGraph: { group: 'Snake diagram', fields: [
    { key: 'maxColumns', label: 'Maximum columns', placeholder: '5' },
  ] },
  commit: { group: 'Git', fields: [
    { key: 'branch', label: 'Branch', placeholder: 'e.g. main, feature/x' },
    { key: 'tag', label: 'Tag', placeholder: 'e.g. v1.0' },
  ] },
  mergeCommit: { group: 'Git', fields: [
    { key: 'branch', label: 'Branch', placeholder: 'e.g. main' },
    { key: 'tag', label: 'Tag', placeholder: 'e.g. v1.0' },
  ] },
  quadrantChart: { group: 'Quadrant', fields: [
    { key: 'xLabel', label: 'X axis label', placeholder: 'e.g. Effort' },
    { key: 'yLabel', label: 'Y axis label', placeholder: 'e.g. Impact' },
    { key: 'q1', label: 'Q1 (top-right)', placeholder: 'e.g. Do first' },
    { key: 'q2', label: 'Q2 (top-left)', placeholder: 'e.g. Plan' },
    { key: 'q3', label: 'Q3 (bottom-left)', placeholder: 'e.g. Reconsider' },
    { key: 'q4', label: 'Q4 (bottom-right)', placeholder: 'e.g. Quick wins' },
  ] },
  quadrantItem: { group: 'Position (0–1)', fields: [
    { key: 'x', label: 'X (0 left → 1 right)', placeholder: 'e.g. 0.8' },
    { key: 'y', label: 'Y (0 bottom → 1 top)', placeholder: 'e.g. 0.6' },
    { key: 'projection', label: 'Projection (x y)', placeholder: 'e.g. 0.9 0.3' },
  ] },
  umlClass: { group: 'UML Class', fields: [
    { key: 'attributes', label: 'Attributes (; separated)', placeholder: '- id: int; - name: string', multiline: true },
    { key: 'methods', label: 'Methods (; separated)', placeholder: '+ login(): void', multiline: true },
  ] },
  umlInterface: { group: 'UML Interface', fields: [
    { key: 'attributes', label: 'Attributes (; separated)', placeholder: '', multiline: true },
    { key: 'methods', label: 'Methods (; separated)', placeholder: '+ save(): void', multiline: true },
  ] },
  umlEnum: { group: 'UML Enum', fields: [
    { key: 'values', label: 'Values (; separated)', placeholder: 'ACTIVE; INACTIVE', multiline: true },
  ] },
  erdEntity: { group: 'ERD Entity', fields: [
    { key: 'attributes', label: 'Attributes (; separated, end PK/FK)', placeholder: 'id: int PK; email: string', multiline: true },
  ] },
  gridGraph: { group: 'Matrix', fields: [
    { key: 'cols', label: 'Columns', placeholder: '5' },
    { key: 'rows', label: 'Rows', placeholder: '5' },
    { key: 'xLabel', label: 'X axis title', placeholder: 'Severity' },
    { key: 'yLabel', label: 'Y axis title', placeholder: 'Occurrence' },
    { key: 'xHeaders', label: 'Column headers (;)', placeholder: '1; 2; 3; 4; 5' },
    { key: 'yHeaders', label: 'Row headers (;)', placeholder: '1; 2; 3; 4; 5' },
    { key: 'cellBg', label: 'Cell colours (r,c or wildcard)', placeholder: '1,*=#fff; *,5=#444; 5,5=#e53935', multiline: true },
  ] },
  gridItem: { group: 'Cell (1-based)', fields: [
    { key: 'row', label: 'Row', placeholder: '1' },
    { key: 'col', label: 'Column', placeholder: '1' },
    { key: 'projection', label: 'Projection (row offset, column offset)', placeholder: 'e.g. -1,+1' },
  ] },
  treeNode: { group: 'Tree node', fields: [
    { key: 'icon', label: 'Icon path or URL', placeholder: 'icons/file.svg, C:\\icons\\file.png, or https://…' },
  ] },
  sankeyNode: { group: 'Sankey', fields: [
    { key: 'color', label: 'Colour', placeholder: '#0ea5e9' },
    { key: 'height', label: 'Node height', placeholder: '38' },
  ] },
  radarChart: { group: 'Radar', fields: [
    { key: 'axes', label: 'Axes (; separated)', placeholder: 'Speed; Quality; Cost; Reach' },
    { key: 'max', label: 'Maximum value', placeholder: '100' },
  ] },
  radarSeries: { group: 'Radar series', fields: [
    { key: 'values', label: 'Values (; separated)', placeholder: '80; 60; 90; 50' },
    { key: 'color', label: 'Colour', placeholder: '#8b5cf6' },
  ] },
  xyChart: { group: 'XY chart', fields: [
    { key: 'xLabel', label: 'X axis label', placeholder: 'Revenue' },
    { key: 'yLabel', label: 'Y axis label', placeholder: 'Growth' },
    { key: 'xMin', label: 'X minimum', placeholder: 'auto' },
    { key: 'xMax', label: 'X maximum', placeholder: 'auto' },
    { key: 'yMin', label: 'Y minimum', placeholder: 'auto' },
    { key: 'yMax', label: 'Y maximum', placeholder: 'auto' },
    { key: 'connect', label: 'Connect points', placeholder: 'true / false' },
    { key: 'regression', label: 'Linear regression', placeholder: 'true / false' },
  ] },
  xySeries: { group: 'XY series', fields: [
    { key: 'color', label: 'Colour', placeholder: '#10b981' },
  ] },
  xyPoint: { group: 'XY / bubble point', fields: [
    { key: 'x', label: 'X', placeholder: '10' },
    { key: 'y', label: 'Y', placeholder: '25' },
    { key: 'size', label: 'Bubble radius', placeholder: '6' },
  ] },
  barChart: { group: 'Bar chart', fields: [
    { key: 'categories', label: 'Categories (; separated)', placeholder: 'Q1; Q2; Q3; Q4' },
    { key: 'xLabel', label: 'X axis label', placeholder: 'Quarter' },
    { key: 'yLabel', label: 'Y axis label', placeholder: 'Revenue' },
    { key: 'mode', label: 'Mode', placeholder: 'grouped / stacked' },
  ] },
  barSeries: { group: 'Bar series', fields: [
    { key: 'values', label: 'Values (; separated)', placeholder: '12; 18; 24; 30' },
    { key: 'color', label: 'Colour', placeholder: '#f59e0b' },
  ] },
}

/** One live-committed custom-property input (own hooks so the field list can vary). */
function PropField({ value, placeholder, label, multiline, onCommit }: { value: string; placeholder: string; label: string; multiline?: boolean; onCommit: (v: string) => void }) {
  const [v, onChange, flush] = useLiveField(value, onCommit)
  return (
    <FieldRow label={label}>
      {multiline
        ? <textarea value={v} onChange={e => onChange(e.target.value)} onBlur={flush} rows={3} placeholder={placeholder}
            className="w-full resize-none rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[11px] text-[var(--fg)] placeholder-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none" />
        : <Input value={v} onChange={e => onChange(e.target.value)} onBlur={flush} placeholder={placeholder} />}
    </FieldRow>
  )
}

/** Debounced live commit. */
function useLiveField<T>(value: T, commit: (v: T) => void, delay = 250) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committedRef = useRef(value)

  useEffect(() => { setLocal(value); committedRef.current = value }, [value])

  const onChange = useCallback((v: T) => {
    setLocal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (v !== committedRef.current) { committedRef.current = v; commit(v) }
    }, delay)
  }, [commit, delay])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (local !== committedRef.current) { committedRef.current = local; commit(local) }
  }, [local, commit])

  return [local, onChange, flush] as const
}

function XySeriesPointGenerator({ seriesId }: { seriesId: string }) {
  const series = useModelStore(s => s.model.elements[seriesId])
  const elements = useModelStore(s => s.model.elements)
  const dispatch = useModelStore(s => s.dispatch)
  const points = (series?.children ?? []).flatMap(id => {
    const point = elements[id]
    if (point?.type !== 'xyPoint') return []
    const x = Number(point.properties.x)
    const y = Number(point.properties.y)
    const size = point.properties.size === undefined ? undefined : Number(point.properties.size)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return []
    return [[x, y, ...(Number.isFinite(size) ? [size] : [])]]
  })
  const serialized = JSON.stringify(points)
  const [source, setSource] = useState(serialized)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSource(serialized)
    setError(null)
  }, [seriesId, serialized])

  const generate = () => {
    try {
      const parsed = parseXyPointList(source)
      dispatch({ type: 'REPLACE_XY_SERIES_POINTS', payload: { seriesId, points: parsed } })
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not parse the point list.')
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5">
      <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--fg-subtle)]">Generate points</label>
      <textarea
        value={source}
        onChange={event => { setSource(event.target.value); setError(null) }}
        rows={5}
        spellCheck={false}
        placeholder="[[0, 5], [10, 12], [20, 8, 10]]"
        className="w-full resize-y rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 font-mono text-[11px] text-[var(--fg)] placeholder-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none"
      />
      <span className="text-[9px] leading-snug text-[var(--fg-subtle)]">Rows are [x, y] or [x, y, bubble size]. Applying replaces this series’ existing points.</span>
      {error && <span role="alert" className="text-[10px] leading-snug text-red-500">{error}</span>}
      <Button type="button" size="sm" variant="outline" onClick={generate}>Generate / replace points</Button>
    </div>
  )
}

function ElementProperties({ elementId }: { elementId: string }) {
  const element = useModelStore(s => s.model.elements[elementId])
  const views = useModelStore(s => s.model.views)
  const activeViewId = useModelStore(s => s.activeViewId)
  const dispatch = useModelStore(s => s.dispatch)
  const focusNonce = useModelStore(s => s.focusPropertiesNonce)
  const [, refreshFormatButtons] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)

  const commitName = useCallback((v: string) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, name: v } }), [dispatch, elementId])
  const commitDesc = useCallback((v: string) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, description: v || undefined } }), [dispatch, elementId])
  const commitTech = useCallback((v: string) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, technology: v || undefined } }), [dispatch, elementId])
  const commitTags = useCallback((v: string) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, tags: v.split(',').map(t => t.trim()).filter(Boolean) } }), [dispatch, elementId])

  // merge one custom property (empty value removes it)
  const properties = element?.properties
  const setProp = useCallback((key: string, v: string) => {
    const props = { ...(properties ?? {}) }
    // Prefix spacing is meaningful (`prefix "PI "` renders "PI 10"). Other
    // fields retain the usual whitespace-normalising behaviour.
    const next = key === 'prefix' ? v : v.trim()
    if (next.length > 0) props[key] = next; else delete props[key]
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, properties: props } })
  }, [dispatch, elementId, properties])
  const clearColors = useCallback(() => {
    const props = { ...(properties ?? {}) }
    delete props.accentColor
    delete props.backgroundColor
    delete props.containerColor
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, properties: props } })
  }, [dispatch, elementId, properties])

  const [name, onName, flushName] = useLiveField(element?.name ?? '', commitName)
  const [desc, onDesc, flushDesc] = useLiveField(element?.description ?? '', commitDesc)
  const [tech, onTech, flushTech] = useLiveField(element?.technology ?? '', commitTech)
  const [tagsStr, onTags, flushTags] = useLiveField((element?.tags ?? []).join(', '), commitTags)

  // Only steal focus when the nonce actually changes after mount (i.e. a deliberate request).
  const seenNonce = useRef(focusNonce)
  useEffect(() => {
    if (focusNonce !== seenNonce.current) {
      seenNonce.current = focusNonce
      nameRef.current?.focus()
      nameRef.current?.select()
    }
  }, [focusNonce])

  if (!element) return null

  const custom = CUSTOM_PROP_FIELDS[element.type]

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--fg)]">Element</span>
        <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">{element.id}</code>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => {
          if (!activeViewId) return
          copyElementFormat(useModelStore.getState().model, activeViewId, elementId)
          refreshFormatButtons(value => value + 1)
        }}>Copy style</Button>
        <Button size="sm" variant="outline" disabled={!activeViewId || !hasElementFormat()} onClick={() => {
          if (!activeViewId) return
          const format = elementFormatFor(useModelStore.getState().model, elementId)
          if (format) dispatch({ type: 'APPLY_ELEMENT_FORMAT', payload: { viewId: activeViewId, id: elementId, ...format } })
        }}>Paste style</Button>
      </div>

      <FieldRow label="Name">
        <Input ref={nameRef} value={name} onChange={e => onName(e.target.value)} onBlur={flushName} />
      </FieldRow>

      <FieldRow label="Type">
        <TypeField
          value={element.type}
          onPick={t => {
            const def = notationRegistry.getElementDef(t)
            dispatch({ type: 'UPDATE_ELEMENT', payload: { id: elementId, type: t, notation: def?.notation ?? element.notation } })
          }}
        />
      </FieldRow>

      <FieldRow label="Description">
        <textarea
          value={desc}
          onChange={e => onDesc(e.target.value)}
          onBlur={flushDesc}
          rows={2}
          className="w-full resize-none rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--fg)] placeholder-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none"
          placeholder="Optional description"
        />
      </FieldRow>

      <FieldRow label="Technology">
        <Input value={tech} onChange={e => onTech(e.target.value)} onBlur={flushTech} placeholder="e.g. React, Node.js" />
      </FieldRow>

      <FieldRow label="Tags (comma-separated)">
        <Input value={tagsStr} onChange={e => onTags(e.target.value)} onBlur={flushTags} placeholder="domain, core" />
      </FieldRow>

      <FieldRow label="Linked view">
        <Select
          value={properties?.linkedView ?? ''}
          onChange={e => setProp('linkedView', e.target.value)}
          title="Show a navigation button on this node"
        >
          <option value="">None</option>
          {Object.values(views).map(view => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </Select>
      </FieldRow>

      <FieldRow label="Accent color">
        <AccentColorField
          value={properties?.accentColor}
          fallback={notationRegistry.getElementDef(element.type)?.accent ?? '#4F46E5'}
          nodeColor={properties?.backgroundColor}
          containerColor={properties?.containerColor}
          onChange={value => setProp('accentColor', value)}
          onNodeColorChange={value => setProp('backgroundColor', value)}
          onContainerColorChange={value => setProp('containerColor', value)}
          onClear={clearColors}
        />
      </FieldRow>

      {custom && (
        <div className="flex flex-col gap-3 rounded border border-[var(--border)] bg-[var(--surface-2)]/40 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">{custom.group}</span>
          {custom.fields.map(f => (
            <PropField
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              multiline={f.multiline}
              value={properties?.[f.key] ?? ''}
              onCommit={v => setProp(f.key, v)}
            />
          ))}
          {element.type === 'xySeries' && <XySeriesPointGenerator seriesId={elementId} />}
        </div>
      )}

      <Button size="sm" variant="danger" className="mt-1 w-full" onClick={() => dispatch({ type: 'DELETE_ELEMENT', payload: { id: elementId } })}>
        Delete Element
      </Button>
    </div>
  )
}

function RelationProperties({ relationId }: { relationId: string }) {
  const relation = useModelStore(s => s.model.relations[relationId])
  const elements = useModelStore(s => s.model.elements)
  const dispatch = useModelStore(s => s.dispatch)
  const [, refreshFormatButtons] = useState(0)

  const commitLabel = useCallback((v: string) => dispatch({ type: 'UPDATE_RELATION', payload: { id: relationId, label: v || undefined } }), [dispatch, relationId])
  const [label, onLabel, flushLabel] = useLiveField(relation?.label ?? '', commitLabel)

  const relProps = relation?.properties
  const setRelProp = useCallback((key: string, v: string) => {
    const props = { ...(relProps ?? {}) }
    const t = v.trim()
    if (t) props[key] = t; else delete props[key]
    dispatch({ type: 'UPDATE_RELATION', payload: { id: relationId, properties: props } })
  }, [dispatch, relationId, relProps])

  if (!relation) return null
  const src = elements[relation.sourceId]?.name ?? relation.sourceId
  const tgt = elements[relation.targetId]?.name ?? relation.targetId

  return (
    <div className="flex flex-col gap-3 p-3">
      <span className="text-xs font-semibold text-[var(--fg)]">Relation</span>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => {
          copyRelationFormat(useModelStore.getState().model, relationId)
          refreshFormatButtons(value => value + 1)
        }}>Copy style</Button>
        <Button size="sm" variant="outline" disabled={!hasRelationFormat()} onClick={() => {
          const format = relationFormatFor(useModelStore.getState().model, relationId)
          if (format) dispatch({ type: 'APPLY_RELATION_FORMAT', payload: { id: relationId, ...format } })
        }}>Paste style</Button>
      </div>
      <div className="rounded bg-[var(--surface-2)] p-2 text-xs text-[var(--fg-muted)]">
        <span className="text-[var(--fg)]">{src}</span>
        <span className="mx-1">→</span>
        <span className="text-[var(--fg)]">{tgt}</span>
      </div>

      <FieldRow label="Label">
        <Input value={label} onChange={e => onLabel(e.target.value)} onBlur={flushLabel} placeholder="Optional label" />
      </FieldRow>

      <FieldRow label="Accent color">
        <AccentColorField
          value={relation.properties?.accentColor}
          fallback="#64748B"
          onChange={value => setRelProp('accentColor', value)}
          onClear={() => setRelProp('accentColor', '')}
        />
      </FieldRow>

      <div className="grid grid-cols-2 gap-2">
        <PropField label="Source multiplicity" placeholder="1" value={relation.properties?.['sourceCard'] ?? ''} onCommit={v => setRelProp('sourceCard', v)} />
        <PropField label="Target multiplicity" placeholder="0..*" value={relation.properties?.['targetCard'] ?? ''} onCommit={v => setRelProp('targetCard', v)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PropField label="Flow value" placeholder="1" value={relation.properties?.['value'] ?? ''} onCommit={v => setRelProp('value', v)} />
        <PropField label="Flow colour" placeholder="#0ea5e9" value={relation.properties?.['color'] ?? ''} onCommit={v => setRelProp('color', v)} />
      </div>

      <FieldRow label="Type">
        <Select value={relation.type} onChange={e => dispatch({ type: 'UPDATE_RELATION', payload: { id: relationId, type: e.target.value } })}>
          {notationRegistry.getNotations().map(({ kind, label }) => {
            const types = notationRegistry.getRelationTypes(kind).filter(t => t.notation === kind || kind === 'generic')
            if (!types.length) return null
            return (
              <optgroup key={kind} label={label}>
                {types.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
              </optgroup>
            )
          })}
        </Select>
      </FieldRow>

      <FieldRow label="Direction">
        <Select
          value={relation.direction}
          onChange={e => dispatch({ type: 'UPDATE_RELATION', payload: { id: relationId, direction: e.target.value as 'directed' | 'undirected' | 'bidirectional' } })}
        >
          <option value="directed">Directed →</option>
          <option value="bidirectional">Bidirectional ↔</option>
          <option value="undirected">Undirected —</option>
        </Select>
      </FieldRow>

      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Source anchor">
          <Select
            value={relation.sourceHandle ?? ''}
            onChange={e => dispatch({ type: 'UPDATE_RELATION', payload: { id: relationId, sourceHandle: (e.target.value || undefined) as 't' | 'b' | 'l' | 'r' | undefined } })}
          >
            <option value="">Auto</option>
            <option value="t">Top</option>
            <option value="b">Bottom</option>
            <option value="l">Left</option>
            <option value="r">Right</option>
          </Select>
        </FieldRow>
        <FieldRow label="Target anchor">
          <Select
            value={relation.targetHandle ?? ''}
            onChange={e => dispatch({ type: 'UPDATE_RELATION', payload: { id: relationId, targetHandle: (e.target.value || undefined) as 't' | 'b' | 'l' | 'r' | undefined } })}
          >
            <option value="">Auto</option>
            <option value="t">Top</option>
            <option value="b">Bottom</option>
            <option value="l">Left</option>
            <option value="r">Right</option>
          </Select>
        </FieldRow>
      </div>

      <Button size="sm" variant="danger" className="mt-1 w-full" onClick={() => dispatch({ type: 'DELETE_RELATION', payload: { id: relationId } })}>
        Delete Relation
      </Button>
    </div>
  )
}

function MultiSelectionPanel({ ids }: { ids: string[] }) {
  const dispatch = useModelStore(s => s.dispatch)
  return (
    <div className="flex flex-col gap-3 p-3">
      <span className="text-xs font-semibold text-[var(--fg)]">{ids.length} elements selected</span>
      <p className="text-xs text-[var(--fg-muted)]">
        Use “⤢ Selected” in the graph toolbar to arrange just these nodes, or
        Ctrl/Cmd+D to duplicate them.
      </p>
      <Button size="sm" variant="danger" className="w-full" onClick={() => dispatch({ type: 'DELETE_ELEMENTS', payload: { ids } })}>
        Delete {ids.length} Elements
      </Button>
    </div>
  )
}

function ViewProperties() {
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const dispatch = useModelStore(s => s.dispatch)
  const renameView = useModelStore(s => s.renameView)
  const deleteView = useModelStore(s => s.deleteView)
  const view = activeViewId ? model.views[activeViewId] : undefined

  const commitName = useCallback((v: string) => { if (activeViewId) renameView(activeViewId, v || activeViewId) }, [activeViewId, renameView])
  const [name, onName, flushName] = useLiveField(view?.name ?? '', commitName)

  if (!view) return null
  const viewCount = Object.keys(model.views).length

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--fg)]">View</span>
        <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">{view.id}</code>
      </div>
      <FieldRow label="Name">
        <Input value={name} onChange={e => onName(e.target.value)} onBlur={flushName} />
      </FieldRow>
      <FieldRow label="Layout direction">
        <Select value={view.layoutDirection} onChange={e => dispatch({ type: 'UPDATE_VIEW', payload: { id: view.id, layoutDirection: e.target.value as 'lr' | 'rl' | 'tb' | 'bt' } })}>
          <option value="tb">Top → Bottom</option>
          <option value="bt">Bottom → Top</option>
          <option value="lr">Left → Right</option>
          <option value="rl">Right → Left</option>
        </Select>
      </FieldRow>
      <FieldRow label="Scope">
        <Select value={view.includeAll ? 'all' : 'custom'} onChange={e => dispatch({ type: 'UPDATE_VIEW', payload: { id: view.id, includeAll: e.target.value === 'all' } })}>
          <option value="all">Include everything</option>
          <option value="custom">Custom (edit in DSL)</option>
        </Select>
      </FieldRow>
      {viewCount > 1 && (
        <Button size="sm" variant="danger" className="mt-1 w-full" onClick={() => deleteView(view.id)}>Delete View</Button>
      )}
    </div>
  )
}

function DiagnosticsPanel() {
  const diagnostics = useModelStore(s => s.diagnostics)
  if (diagnostics.length === 0) return null
  return (
    <div className="border-t border-[var(--border)] p-3">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">Diagnostics</span>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {diagnostics.map((d, i) => (
          <div key={i} className={`rounded px-2 py-1 text-xs ${
            d.severity === 'error' ? 'bg-red-500/15 text-red-500' :
            d.severity === 'warning' ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' :
            'bg-blue-500/15 text-blue-500'
          }`}>
            {d.line ? `[L${d.line}] ` : ''}{d.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const selectedElementIds = useModelStore(s => s.selectedElementIds)
  const selectedElementId = useModelStore(s => s.selectedElementId)
  const selectedRelationId = useModelStore(s => s.selectedRelationId)

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)] text-[var(--fg)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--accent-soft)] text-[11px] text-[var(--accent)]">◫</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Inspector</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {selectedElementIds.length > 1 && <MultiSelectionPanel ids={selectedElementIds} />}
        {selectedElementIds.length === 1 && selectedElementId && <ElementProperties elementId={selectedElementId} />}
        {selectedElementIds.length === 0 && selectedRelationId && <RelationProperties relationId={selectedRelationId} />}
        {selectedElementIds.length === 0 && !selectedRelationId && <ViewProperties />}
      </div>
      <DiagnosticsPanel />
    </div>
  )
}
