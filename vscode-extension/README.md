# Graph Model Studio for VS Code

Graph Model Studio brings the desktop studio's GMC language tooling and visual
modeler into Visual Studio Code. Open a `.gmc` document beside an interactive
graph, edit visually through the canvas and Inspector, embed diagrams in
Markdown, and export publication-ready PNG images without switching tools.

The extension uses the same parser, serializer, notation registry, layout
engines, nodes, edges, graph renderer, Explorer, Inspector, and theme system as
the Graph Model Studio application.

## Highlights

- GMC syntax highlighting, diagnostics, completion suggestions, hover details,
  document symbols, and go-to-definition.
- Interactive graph preview with pan, zoom, minimap, snapping, automatic
  layout, curved or orthogonal routing, view tabs, and PNG export.
- Live graph-to-source synchronization. Moving, creating, renaming, styling,
  reconnecting, or deleting graph content updates the corresponding `.gmc`
  editor buffer through normal VS Code edits.
- The original Inspector for element, relation, view, notation-specific,
  cardinality, color, layout, and custom-property editing.
- The original Explorer for navigating model elements, relations, and views.
  It starts collapsed and can be opened from the graph header.
- Persistent light/dark graph theme selection.
- The synchronized Graph Model Studio/extension version is visible in the
  interactive viewer header.
- Native Markdown preview integration: `gmc` and `graphmodel` fenced blocks are
  rendered automatically as PNG images whenever VS Code displays the Markdown
  preview.
- Single-diagram and batch PNG export for Markdown documents.
- External file embeds with line/region selection, locking, stale indicators,
  diagnostics, completion, hover, source navigation, and workspace updates.
- Native `.gmc`/`.graphmodel` embeds and recursive Markdown-file embeds.
- Rich HTML paste-to-Markdown plus copy-Markdown-as-rich-HTML.

## Opening the interactive graph

Open a `.gmc` file and run **GMC: Open Graph Preview to the Side** from the
Command Palette or use the preview button in the editor title bar.

The graph preview is a visual editor, not a read-only image:

- Select a node or relation to edit it in the Inspector.
- Drag nodes to persist their positions in the active GMC view.
- Create and reconnect relationships using graph handles.
- Use the graph toolbar to change routing, snapping, minimap visibility, and
  layout engine or to run layout commands.
- Switch model views using the tabs in the graph header.
- Toggle the Explorer, theme, and Inspector from the graph header.
- Resize either side panel by dragging its divider. Double-click a divider to
  collapse that panel.

Visual changes update the open VS Code text buffer. The document remains under
VS Code's normal undo, dirty-state, save, Auto Save, format, and source-control
behavior; the extension does not silently write the file to disk.

## GMC in Markdown

Use a fenced block with the `gmc` or `graphmodel` language identifier:

````markdown
```gmc id=system-context view=context theme=dark width=1600 height=1000
model {
  user = person "User"
  app = softwareSystem "Application"
  user -> app "Uses"
}

views {
  view context {
    include *
    autolayout lr
  }
}
```
````

Open VS Code's built-in Markdown preview or preview-to-the-side view. Each GMC
fence is parsed and rendered offscreen with Graph Model Studio, captured as a
PNG, and inserted into the preview automatically. The generated preview PNG is
kept in memory, so viewing Markdown does not create or modify workspace files.
Use an export command when you want a permanent PNG file.

Supported fence attributes:

| Attribute | Purpose | Default |
|---|---|---|
| `id` | Stable diagram name and exported filename | `diagram-N` |
| `view` | View ID or view name to render | First declared view |
| `theme` | Optional `light` or `dark` override | Theme selected in the interactive graph viewer |
| `width` | Offscreen render width in pixels | `1600` |
| `height` | Offscreen render height in pixels | `1000` |

Place the cursor inside a GMC fence before running a single-diagram preview or
export command. Graph changes made from the interactive preview replace only
that fence's content and leave the surrounding Markdown untouched.

## PNG export

**GMC: Export Diagram as PNG** exports the active `.gmc` document or the GMC
fence under the cursor. The graph's PNG toolbar provides the same export from
inside the interactive preview.

**GMC: Export Markdown Diagram as PNG** exports the fenced diagram under the
cursor and prompts for a destination.

**GMC: Export All Markdown Diagrams as PNG** renders every GMC fence in the
active Markdown document. Files are written to:

```text
.gmc/<markdown-file-name>/<diagram-id>.png
```

Export uses the selected view, fence attributes, graph theme, notation colors,
node dimensions, and stored layout positions. Output is automatically cropped
to the graph content and rendered at high pixel density with a transparent
background.

## Language intelligence

For `.gmc` documents and GMC fences inside Markdown, the extension provides:

- Parser diagnostics with source locations.
- Completion suggestions for GMC blocks, element types, relation types,
  properties, view declarations, and model identifiers.
- Hover information for declared elements and views.
- Go-to-definition for model references.
- Document symbols for elements and views.
- Dedicated syntax highlighting for `.gmc` and injected highlighting in
  Markdown fences.

## External code and Markdown embeds

Insert an embed directive in a Markdown document, then run **Update Code
Embeds** (or use the CodeLens above the directive):

```markdown
<!-- embed:file="./model.gmc" -->
```

Use `link:file` to generate a hyperlink instead of including file contents:

```markdown
<!-- link:file="./chapter.md" indent="2" -->
```

Saving generates the link and a `<!-- link:end -->` marker. `indent` adds spaces
before the generated link; indentation before the directive is also preserved.
Labels use the first heading after optional YAML front matter, falling back to
the filename stem. Export can retain links or expand their contents; when
expanded, `indent` shifts Markdown heading levels like a regular embed.
Replace old `embed:file="..." mode="link"` directives with `link:file="..."`
and change their closing marker to `link:end`; remove `mode`.


Generated embed content is inserted directly without an additional visible
`Source: filename` link. Source navigation remains available from CodeLens.

The generated fence uses `gmc`, so it is rendered by the GMC Markdown preview.
The original embed options are supported, including `line="1-20"`,
`region="name"`, `lock="true"`, `indent="1"`, `new="3,5-7"`,
`withLineNumbers="true"`, and `strip-comments="false"`.

For code embeds, `indent="N"` adds `N` leading spaces. For embedded Markdown,
it increases ATX heading depth instead: `# Chapter` becomes `## Chapter` when
`indent="1"`. Headings inside fenced code blocks are left unchanged.

Embedding a `.md` or `.markdown` file inserts Markdown directly rather than
placing it inside a code fence. Embed directives inside that file are resolved
recursively relative to their containing Markdown file. Circular includes are
detected and rejected instead of recursing indefinitely.

### Generated table of contents

Add this marker where the table of contents should appear:

```markdown
<!-- embed:toc -->
```

**Update Code Embeds**, the TOC CodeLens, and saving the Markdown document all
regenerate the TOC. Headings inside fenced code blocks are ignored, duplicate
heading anchors are numbered consistently, and nested heading levels become
nested lists. Optional attributes include `min-level="2"`, `max-level="4"`,
or `depth="3"`; `lock="true"` prevents updates.

## Paste as Markdown

Rich HTML copied from browsers, Word, Google Docs, Notion, and similar tools is
converted automatically when pasted into Markdown. Conversion is skipped in
fenced code, inline code, math blocks, plain-text-only clipboard data, and VS
Code editor copies. GFM tables, task lists, strikethrough, code language hints,
and common Office/Google Docs cleanup are supported.

Excel and other spreadsheet tables are normalized to GFM pipe tables and
aligned automatically. Run **Markdown Toolkit: Format Markdown Table** or use
`Ctrl+Alt+T` (`Cmd+Alt+T` on macOS) to reformat the table under the cursor or
all tables in a selection.

Use **Paste as Markdown: Copy as HTML** to copy a Markdown selection (or file
from the Explorer) with both rich HTML and plain Markdown clipboard formats.

## Commands

Configure `slides.executablePath` and `slides.themePath` in VS Code settings. `slides.themePath` accepts a theme folder or ZIP. VSIX contains neither executable nor theme.

| Command | Description |
|---|---|
| **Slides: Preview** | Builds active Markdown with configured `presentation-md.exe` and theme, then opens light Slidev preview beside editor. Toolbar exports HTML, PDF, PPTX, or editable PPTX. |
| **Slides: Export Standalone HTML** | Saves current generated Slidev preview as portable HTML. |
| **Slides: Export PDF** | Builds active Markdown as PDF. |
| **Slides: Export PPTX** | Builds active Markdown as image-based PowerPoint. |
| **Slides: Export Editable PPTX** | Builds active Markdown as PowerPoint with editable supported elements. |
| **GMC: Open Graph Preview to the Side** | Opens the synchronized interactive graph for a `.gmc` document or the GMC Markdown fence under the cursor. |
| **GMC: Export Diagram as PNG** | Exports the active GMC diagram to a chosen PNG file. |
| **GMC: Export Markdown Diagram as PNG** | Exports the GMC fence under the cursor. |
| **GMC: Export All Markdown Diagrams as PNG** | Batch-renders all GMC fences in the active Markdown document. |
| **Update Code Embeds** | Refreshes embeds in the active Markdown document. |
| **Update All Embeds in Workspace** | Refreshes all Markdown embeds in the workspace. |
| **Copy Embed Tag** | Copies an embed directive for the selected source file, lines, or region. |
| **Paste as Markdown: Copy as HTML** | Copies Markdown as rich HTML and plain text. |
| **Markdown Toolkit: Format Markdown Table** | Aligns the selected Markdown tables or the table under the cursor. |
| **Markdown Toolkit: Export Preview as HTML** | Exports styled Markdown with GMC diagrams embedded as images. |
| **Markdown Toolkit: Export Preview as PDF** | Exports through a local Chromium, Edge, or Chrome headless browser. |
| **Markdown Toolkit: Export Preview as PNG** | Captures the styled preview using the configured PNG viewport. |
| **Markdown Toolkit: Export Preview...** | Preview-title button that opens the HTML/PDF/PNG/DOCX format picker. |
| **Markdown Toolkit: Export as DOCX with Pandoc** | Generates DOCX and lets you select an optional reference DOCX template. |

## Settings

| Setting | Default | Description |
|---|---:|---|
| `gmc.preview.autoOpen` | `false` | Automatically opens the interactive graph when a GMC document becomes active. |
| `gmc.export.width` | `1600` | Default PNG render width, from 320 to 8192 pixels. |
| `gmc.export.height` | `1000` | Default PNG render height, from 240 to 8192 pixels. |
| `gmc.export.theme` | `auto` | PNG theme: `auto`, `light`, or `dark`. Fence attributes can override it. |
| `markdownEmbedder.autoUpdate` | `false` | Refresh embeds when a referenced source file is saved. |
| `markdownEmbedder.collapseGeneratedContent` | `true` | Automatically fold generated content between embed directives. |

Named regions such as `<!-- embed:example --> … <!-- embed:example:end -->`
are recognized as foldable blocks and collapse automatically after updates.
| `pasteAsMarkdown.enabled` | `true` | Convert rich HTML clipboard content when pasting into Markdown. |
| `pasteAsMarkdown.copyAsHtmlOnCopy` | `false` | Override copy in Markdown to provide rich HTML as well as plain text. |
| `markdownToolkit.export.browserPath` | empty | Optional Chromium/Chrome/Edge executable for PDF and PNG export. |
| `markdownToolkit.export.pngWidth` | `1440` | PNG export viewport width. |
| `markdownToolkit.export.pngHeight` | `10000` | PNG export capture height (increase for very long documents). |
| `markdownToolkit.pandoc.path` | empty | Optional path to the Pandoc executable. |
| `markdownToolkit.pandoc.referenceDoc` | empty | Optional default reference DOCX template offered during export. |

PDF and PNG export require Edge, Chrome, or Chromium. DOCX export requires
[Pandoc](https://pandoc.org/). GMC fences are rendered to PNG before Pandoc is
run, and the Markdown document directory is included in Pandoc's resource path
so relative images remain available.

The theme button in the interactive graph stores an explicit extension-level
theme preference. That choice survives document refreshes, reopened previews,
and VS Code restarts. Automatic Markdown PNG generation uses the same selected
theme; an explicit `theme=` fence attribute overrides it for that diagram only.

## File support

- `.gmc` and `.graphmodel` files use the GMC language mode.
- Markdown supports fenced blocks labeled `gmc` or `graphmodel`.
- Relative assets referenced by a model resolve from the source document's
  location when supported by the underlying notation renderer.

## Troubleshooting

- If a Markdown diagram shows an error instead of an image, inspect the GMC
  fence diagnostics and confirm the requested `view` exists.
- If an interactive Markdown preview opens the wrong diagram, place the cursor
  inside the desired GMC fence before running the command.
- Large diagrams can take a moment to rasterize in Markdown because each block
  is parsed, laid out, and captured independently.
- Reload the VS Code window after upgrading the extension if an already-open
  Markdown preview still uses an older preview script.
