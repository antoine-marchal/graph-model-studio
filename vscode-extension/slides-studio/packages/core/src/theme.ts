import type { CorporateMaster, LayoutDef } from './schema.js';

export const THEME_SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const;
export const PALETTE_VARIANTS = ['lighter80', 'lighter60', 'lighter40', 'lighter25', 'darker25', 'darker50'] as const;

export type ThemeLike = Pick<CorporateMaster, 'theme'>;

const normHex = (hex: string): string => hex.replace(/^#/, '').toUpperCase();

/** Resolve a color value (theme token or hex) to `RRGGBB`, or `null` for `none`/unknown tokens. */
export function resolveColor(value: string | undefined, master: ThemeLike): string | null {
  if (!value || value === 'none') return null;
  if (!value.startsWith('theme.')) return normHex(value);
  const [, slot, variant] = value.split('.');
  if (!slot) return null;
  if (variant) return master.theme.palette[slot]?.[variant]?.toUpperCase() ?? null;
  return master.theme.colors[slot]?.toUpperCase() ?? null;
}

export const isThemeToken = (value: string | undefined): boolean => !!value && value.startsWith('theme.');

/** All tokens of the corporate palette, in display order (base colors then tints/shades). */
export function paletteTokens(master: ThemeLike): { token: string; hex: string }[] {
  const out: { token: string; hex: string }[] = [];
  for (const slot of THEME_SLOTS) {
    const hex = master.theme.colors[slot];
    if (hex) out.push({ token: `theme.${slot}`, hex: hex.toUpperCase() });
  }
  for (const slot of THEME_SLOTS) {
    for (const v of PALETTE_VARIANTS) {
      const hex = master.theme.palette[slot]?.[v];
      if (hex) out.push({ token: `theme.${slot}.${v}`, hex: hex.toUpperCase() });
    }
  }
  return out;
}

/** Find the theme token matching a literal hex color, preferring base slots. */
export function tokenForHex(hex: string, master: ThemeLike): string | null {
  const h = normHex(hex);
  return paletteTokens(master).find((t) => t.hex === h)?.token ?? null;
}

/** Resolve `theme.heading` / `theme.body` (or a literal family) to a font family. */
export function resolveFont(value: string | undefined, master: ThemeLike): string | undefined {
  if (!value) return undefined;
  if (value === 'theme.heading') return master.theme.fonts.heading;
  if (value === 'theme.body') return master.theme.fonts.body;
  return value;
}

/** Find a layout by id or alias. */
export function findLayout(master: Pick<CorporateMaster, 'layouts'>, ref: string): LayoutDef | undefined {
  return master.layouts.find((l) => l.id === ref) ?? master.layouts.find((l) => l.aliases.includes(ref));
}
