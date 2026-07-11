/** Rendering bodies for UML class / ERD entity / UML note shapes. */

/** Split a `"a; b; c"` property into trimmed non-empty lines. */
function lines(raw: string | undefined): string[] {
  return (raw ?? '').split(/[;\n]/).map(s => s.trim()).filter(Boolean)
}

const STEREO: Record<string, string> = { umlInterface: '«interface»', umlEnum: '«enumeration»' }

export function UmlClassBody({ label, elementType, props, stroke, text }: {
  label: string
  elementType: string
  props: Record<string, string>
  stroke: string
  text: string
}) {
  const attrs = lines(props['attributes'])
  const methods = lines(elementType === 'umlEnum' ? props['values'] : props['methods'])
  const stereo = STEREO[elementType]
  return (
    <div className="flex h-full w-full flex-col text-[11px]" style={{ color: text }}>
      <div className="px-2 py-1 text-center" style={{ borderBottom: `1px solid ${stroke}` }}>
        {stereo && <div className="text-[9px] italic opacity-70">{stereo}</div>}
        <div className="font-bold">{label}</div>
      </div>
      <div className="min-h-[14px] flex-1 px-2 py-1" style={{ borderBottom: `1px solid ${stroke}` }}>
        {attrs.map((a, i) => <div key={i} className="truncate font-mono text-[10px] leading-snug">{a}</div>)}
      </div>
      <div className="min-h-[14px] flex-1 px-2 py-1">
        {methods.map((m, i) => <div key={i} className="truncate font-mono text-[10px] leading-snug">{m}</div>)}
      </div>
    </div>
  )
}

/** ERD attribute row: "name : type PK" / "userId : int FK". Trailing PK/FK gets a badge. */
function parseAttr(raw: string): { name: string; key?: 'PK' | 'FK' } {
  const m = raw.match(/\b(PK|FK)\b\s*$/i)
  if (m) return { name: raw.slice(0, m.index).trim(), key: m[1].toUpperCase() as 'PK' | 'FK' }
  return { name: raw }
}

export function ErdEntityBody({ label, props, stroke, text, accent }: {
  label: string
  props: Record<string, string>
  stroke: string
  text: string
  accent: string
}) {
  const attrs = lines(props['attributes'])
  return (
    <div className="flex h-full w-full flex-col text-[11px]" style={{ color: text }}>
      <div className="px-2 py-1 text-center font-bold uppercase tracking-wide" style={{ background: accent + '22', borderBottom: `1.5px solid ${stroke}` }}>
        {label}
      </div>
      <div className="flex-1 px-0 py-0.5">
        {attrs.map((a, i) => {
          const { name, key } = parseAttr(a)
          return (
            <div key={i} className="flex items-center gap-1 px-2 py-[1px] font-mono text-[10px] leading-snug">
              {key && <span className="rounded px-1 text-[8px] font-bold" style={{ background: key === 'PK' ? accent : stroke, color: '#fff' }}>{key}</span>}
              <span className={key === 'PK' ? 'font-semibold underline' : ''}>{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function NoteBody({ label, fill, stroke, text, width, height }: {
  label: string
  fill: string
  stroke: string
  text: string
  width: number
  height: number
}) {
  const fold = 14
  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={`M1,1 H${width - fold} L${width - 1},${fold} V${height - 1} H1 Z`} fill={fill} stroke={stroke} strokeWidth="1.3" />
        <path d={`M${width - fold},1 V${fold} H${width - 1} Z`} fill={stroke} opacity="0.25" stroke={stroke} strokeWidth="1" />
      </svg>
      <div className="relative flex h-full w-full items-center justify-center px-3 text-center text-[11px]" style={{ color: text }}>
        {label}
      </div>
    </div>
  )
}
