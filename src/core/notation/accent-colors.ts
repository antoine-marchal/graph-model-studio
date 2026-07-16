export const ACCENT_PALETTE = [
  '#2563EB', '#0891B2', '#059669', '#65A30D', '#D97706',
  '#DC2626', '#DB2777', '#7C3AED', '#4F46E5', '#475569',
] as const

export interface AccentColors {
  primary: string
  secondary: string
  tertiary: string
  container: string
  foreground: string
}

export function normalizeHexColor(value: string | undefined): string | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(value?.trim() ?? '')
  return match ? `#${match[1].toUpperCase()}` : undefined
}

function mix(hex: string, target: number, amount: number): string {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16))
  return `#${rgb.map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function contrastTextColor(value: string): string {
  const color = normalizeHexColor(value) ?? '#FFFFFF'
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
  const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  return luminance > 0.42 ? '#111827' : '#FFFFFF'
}

/** Secondary and tertiary accents are deterministic darker/lighter companions. */
export function deriveAccentColors(value: string): AccentColors {
  const primary = normalizeHexColor(value) ?? ACCENT_PALETTE[0]
  const tertiary = mix(primary, 255, 0.82)
  const container = mix(primary, 255, 0.94)
  return {
    primary,
    secondary: mix(primary, 0, 0.24),
    tertiary,
    container,
    foreground: contrastTextColor(tertiary),
  }
}
