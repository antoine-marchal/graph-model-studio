import type { IconKind } from '@/core/notation'
import { NodeIcon, ICON_KINDS } from './NodeIcons'

/** treeNode `icon` values: `glyph:<name>` (bundled bitmap or built-in diagram
 *  glyph), a typed emoji/symbol, or else an image path/URL. */
export const GLYPH_PREFIX = 'glyph:'

// Bundled bitmap glyphs, keyed by file name without extension. The desktop app
// emits them as separate files; the VS Code builds inline them (see
// `assetsInlineLimit` in the Vite configs) so webview PNG export can embed them.
const BITMAP_GLYPHS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../assets/glyphs/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.png'.length), url]),
)

const PATH_LIKE = /[/\\.:]/
/** True when `icon` is an emoji or symbol to draw as text rather than an image. */
export function isCharIcon(icon: string): boolean {
  return [...icon].length <= 8 && !PATH_LIKE.test(icon) && /\p{Extended_Pictographic}|[←-⯿]/u.test(icon)
}

/** Render a non-path tree icon (glyph or typed emoji); null for image paths. */
export function TreeIconChar({ icon, color, size = 14 }: { icon: string; color: string; size?: number }) {
  const name = icon.startsWith(GLYPH_PREFIX) ? icon.slice(GLYPH_PREFIX.length) : undefined
  if (name && BITMAP_GLYPHS[name]) return <img src={BITMAP_GLYPHS[name]} alt="" width={size} height={size} draggable={false} className="shrink-0 object-contain" />
  if (name) return <span className="shrink-0"><NodeIcon kind={name as IconKind} color={color} size={size} /></span>
  if (!isCharIcon(icon)) return null
  return <span className="shrink-0 text-center leading-none" style={{ width: size, fontSize: size - 1, color }}>{icon}</span>
}

/** Searchable words from a glyph name: `I_DELRMRobotSystem_32` → "del rm robot system". */
export function glyphWords(name: string): string {
  return name
    .replace(/^I_/, '')
    .replace(/(_?0?32(x32)?|_icon)$/i, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim()
}

export interface GlyphEntry { icon: string; words: string }

let glyphs: GlyphEntry[] | undefined
/** Every pickable glyph: bundled bitmaps first, then the diagram glyphs. */
export function glyphCatalog(): GlyphEntry[] {
  glyphs ??= [...Object.keys(BITMAP_GLYPHS).sort((a, b) => glyphWords(a).localeCompare(glyphWords(b))), ...ICON_KINDS]
    .map(name => ({ icon: GLYPH_PREFIX + name, words: glyphWords(name) }))
  return glyphs
}

/** Glyphs whose words contain every term of `query` (any order). */
export function searchGlyphs(query: string): GlyphEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return glyphCatalog().filter(entry => terms.every(term => entry.words.includes(term)))
}
