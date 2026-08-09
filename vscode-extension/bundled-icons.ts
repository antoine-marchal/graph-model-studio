import { notationRegistry } from '../src/core/notation'

// The desktop app serves these files from its public directory. VS Code
// webviews do not have that public root, and PNG capture cannot reliably fetch
// relative extension resources. Inline the notation glyphs so interactive and
// Markdown previews render and export the same graph as the desktop app.
const bundledIcons = import.meta.glob('../public/icons/archimate/*.png', {
  eager: true,
  import: 'default',
  query: '?inline',
}) as Record<string, string>

const iconsByFileName = new Map(
  Object.entries(bundledIcons).map(([assetPath, dataUrl]) => [assetPath.replace(/^.*[/\\]/, ''), dataUrl]),
)

for (const definition of notationRegistry.getAllElementTypes()) {
  if (!definition.iconSrc) continue
  const fileName = definition.iconSrc.replace(/^.*[/\\]/, '')
  definition.iconSrc = iconsByFileName.get(fileName) ?? definition.iconSrc
}
