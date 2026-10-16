# Rich editor (Markdown Studio) — developer notes

Sources: `src/` (extension host: custom editor, rich diff panel, directives, custom CSS), `webview/` (React + Tiptap editor), `test/` (conversion tests). Built by `esbuild.mjs` into `../dist/rich-editor`.

```bash
pnpm run build:rich-editor   # or watch:rich-editor
pnpm run test:rich-editor    # conversion cases + full-file round-trip
```

Tiptap packages are pinned through `overrides` in `../pnpm-workspace.yaml`: mixed `@tiptap/core` / `@tiptap/pm` versions break schema and plugin identity. React is aliased to the workspace root copy in `esbuild.mjs` (pnpm otherwise gives `@tiptap/react` its own React and hooks crash).

Manifest paths in these notes (`package.json`) mean `../package.json`.

## Conversion pipeline files (where bugs live)

-   `webview/hooks/useVSCodeSync.ts` — `markdownToHtml` / `htmlToMarkdown`, production DOM-based transforms (DOMParser-backed).
-   `webview/markdown.config.ts` — `normalizeMarkdown` post-processing (task lists, table headers, unescaping, list compaction, etc.).
-   `test/pipeline.ts` — regex-based mirror of the production pipeline used by test scripts (no DOMParser in Node).

When you touch any of these, add/update a test case in `test/test-conversions.ts` in the matching category (A-P).

## Adding a new conversion test

In `test/test-conversions.ts`:

-   Full round-trip: `await roundtripCase(name, input, expectedOutput?)` (omit `expectedOutput` if round-trip is idempotent).
-   Unit test on a helper: `eq(name, actual, expected)`.
-   Boolean assertion: `assert(name, condition, detail?)`.
-   Mark a documented-lossy case with `{ known: true }`; it shows as `○` and doesn't fail the suite.

## Table cell code-span pipes

`` `a|b` `` or `` `a\|b` `` inside a table cell round-trips to `` `a\|b` `` (single backslash, correct GFM escape). Production and the test pipeline agree — there are two coupled invariants keeping this clean:

1. `protectTableCodePipes` consumes `\|` as a single unit (strips the leading `\` alongside the `|`). Otherwise the backslash leaks into HTML and combines with remark-gfm's own escape to emit `\\|`.
2. We do NOT manually escape `|` inside `<td>/<th> <code>` before rehype-remark — remark-gfm handles table-cell pipe escaping natively. Adding our own escape there caused the `\\|` double-escape.

If you're touching either step, run category E tests and keep both invariants aligned between `useVSCodeSync.ts` and `test/pipeline.ts`.

## Math round-trip pipeline

`$...$` (inline) and `$$...$$` (block) are parsed by `remark-math` and converted to `<span data-type="mathInline">` / `<div data-type="mathBlock">` via custom `remark-rehype` handlers (defined as `mathHandlers` in both `useVSCodeSync.ts` and `test/pipeline.ts`).

On the way back (HTML → markdown), `preprocessTiptapHtml` converts math nodes to code placeholders (`<code>BTRMK_MATH:latex</code>` for inline, `<pre><code class="language-btrmk-math-block">` for block). This protects LaTeX content from remark-stringify escaping. `postprocessMarkdown` restores them to `$...$` / `$$...$$`.

Keep the handlers and placeholder logic in sync between `useVSCodeSync.ts` (production, DOMParser) and `test/pipeline.ts` (tests, regex). Run category O tests when touching math.

## Settings storage

Settings live in VS Code's native config (`vscode.workspace.getConfiguration("markdownStudio")`), declared in `package.json`'s `contributes.configuration`. The `markdownStudio.*` namespace was chosen instead of `betterMarkdown.*` because VS Code's Settings UI auto-derives section labels by title-casing the dotted segments — so `betterMarkdown.bullet` would render as "Better Markdown: Bullet" regardless of `configuration.title`. Internal command IDs (`betterMarkdown.toggleEditor` etc.) and the `betterMarkdown.editor` view type are unchanged so existing user keybindings and editor associations still resolve.

Three write paths feed the same store:

-   VS Code Settings UI / `.vscode/settings.json` (any scope)
-   the in-app `SettingsPanel` (writes User scope via `config.update(...)`)
-   programmatic edits

`onDidChangeConfiguration` listeners in `src/provider.ts` and `src/diffPanel.ts` push fresh settings to every open webview as `settingsUpdated`. The schema in `package.json` MUST stay in sync with `BetterMarkdownSettings`, `DEFAULT_SETTINGS`, and `SETTING_KEYS` in `webview/settings.ts` — adding a new setting means updating all four places.

A one-time migration in `src/extension.ts` (`migrateLegacySettings`) copies pre-2.3.5 globalState settings into User-scope config on first activation.

## Themes and custom CSS

`useAppearance` (`webview/hooks/useAppearance.ts`) sets `<body data-theme="<markdownStudio.theme>">` (no attribute for `default`) and injects the user's custom CSS as the last `<style>` in `<head>`.

Every theme defines the same GitHub Primer design tokens (`--fgColor-default`, `--bgColor-muted`, `--prettylights-syntax-*`, ...). `webview/styles/themes/base.css` maps them onto the `--vscode-*` variables `editor.css` already reads (body-level declarations shadow VS Code's values on `<html>`) and patches hardcoded colors. `esbuild.mjs` builds the theme CSS:

-   The theme list is the `markdownStudio.theme` enum in `package.json`.
-   `github-<name>` themes are generated from `node_modules/@primer/primitives/dist/css/functional/themes/<name>.css`. Only tokens referenced as `var(--token)` in `base.css` are extracted, with `var()` chains resolved.
-   Any other theme is a hand-written `webview/styles/themes/<name>.css` (e.g. `claude-light.css`). The build fails if it misses a token `base.css` needs. Optional per-theme extras use `var(--x, fallback)` in `base.css` and are not required.

Adding a theme: add the name to `THEME_LABELS` in `webview/settings.ts` and to the `markdownStudio.theme` enum + `enumDescriptions` in `package.json` (a test enforces the match). For a non-GitHub theme, also add its `.css` file.

Custom CSS is read on the host (`src/customCss.ts`) and posted as `{ type: "customCss", css }` on ready and whenever the file or setting changes.

## Embed round-trip pipeline (GitHub)

A bare GitHub URL on its own line becomes a rich embed in the editor. Remark-gfm parses the URL as an autolink (`<p><a href="url">url</a></p>`); the markdown-to-HTML step then rewrites that paragraph to `<p data-type="githubEmbed" data-url="url">url</p>` which Tiptap parses as a `GitHubEmbed` node. (YouTube embeds were removed in 2.3.10; YouTube URLs stay plain autolinks.) On the way back, the node's renderHTML produces the same shape; rehype-remark drops `data-*` attrs and emits the URL as paragraph text, and `unescapeBareUrls` in `normalizeMarkdown` strips remark-stringify's `https\:` / `\.` safety escapes so the saved markdown is a plain URL (ready to be autolinked again on re-parse).

URL detection lives in `webview/extensions/GitHubEmbed.tsx` (`isGitHubUrl`, `parseGitHubUrl`). The rewrite happens in `useVSCodeSync.ts` (DOMParser) and is mirrored in `test/pipeline.ts` (regex). Run category P tests when touching embeds.

## Frontmatter

`webview/frontmatter.ts` strips the YAML block before conversion and re-prepends it on save. The editor keeps the raw block in `frontmatterRef` and its body in `frontmatter` state (`useEditorState`); `FrontmatterPanel` edits it, "Add Frontmatter" / the `/frontmatter` slash command (`btrmk:addFrontmatter` event) creates one from `defaultFrontmatter`. Frontmatter edits go through `handleUpdate` like editor edits. Tests: category L2.

## Fence meta (code block info string)

` ```gmc id=x view=y ` — everything after the language is the fence _meta_. `remarkRehypeHandlers.code` (conversion-utils) puts it on `<code data-meta>`; code blocks / GMC blocks keep it as the `meta` node attribute (`fenceMetaAttribute`, rendered as `<pre data-meta>`); `preprocessTiptapHtml` folds it into the language class (`language-<lang>BTRMKMETA<encoded>`) because rehype-remark only reads the class, and `restoreFenceMeta` undoes that after `normalizeMarkdown`. `test/pipeline.ts` mirrors it with `encodeMetaHtml`. Tests: category F.

## Graph Model Studio integration

The rich editor is one integration of the Graph Model Studio extension, activated by `integrations/host.js`. It does not vendor the graph runtime: the host points the webview at the extension's own build output, so rebuilding the core updates it.

-   `src/provider.ts` sends `gmcRuntimeUri` (`dist/markdown-preview/runtime.js`) and `gmcEditorUri` / `gmcEditorCssUri` (`dist/webview/assets/*`) in `init`.
-   `package.json` `contributes.configuration[0]` is the Markdown Studio section (the tests and `esbuild.mjs` read the theme enum from it); `[1]` is the GMC / toolkit section.
-   `GmcBlock` renders ` ```gmc ` / ` ```graphmodel ` fences with the Markdown runtime. Commands run through the `runCommand` message, restricted to `TOOLKIT_COMMANDS` and called with the document URI (+ GMC block index), because the custom editor has no active text editor. `markdown-embed.update` runs `integrations/markdown-code-embedder/embedder.js` directly.

## Raw HTML blocks

Block-level HTML (comments, toolkit `<!-- embed:… -->` directives, `<details>`) goes through `remarkRehypeHandlers.html` as `<pre><code class="language-btrmk-raw-html">` → `RawHtmlBlock` node → fenced `btrmk-raw-html` → `restoreRawHtml` (after `normalizeMarkdown`). Inline HTML is still dropped (pre-existing), except `<mark>`. Tests: category R.

Grouping (`remarkGroupDirectives` / `rehypeUnwrapDirectives` in conversion-utils, used by both pipelines and `sourceBlockLines`):

-   Toolkit directive + generated content + end marker → `directiveGroup` → `<div data-type="directive" data-open data-close>` → `DirectiveBlock` card.
-   `<div align="x">` … `</div>` (blank lines around the content) → `alignGroup` → `AlignBlock`. Other standalone `<div>`s pair but stay raw.
-   `<div class="ms-columns" …>` holding `<div class="ms-column" …>` divs (`COLUMNS_OPEN` / `COLUMN_OPEN`, inline flex styles so other renderers show columns) → `columnsGroup` / `columnGroup` → `Columns` / `Column` nodes (slash menu "2 Columns" / "3 Columns").

## Export (HTML / PDF / PNG)

`markdownToolkit.export*` first asks `betterMarkdown.exportSnapshot` for the open rich editor's rendering (`webview/exportSnapshot.ts`): the ProseMirror DOM minus editing chrome, inside shallow copies of its ancestors, with all stylesheets, VS Code theme variables, images and woff2 fonts inlined. No rich editor open, or "embed linked file contents" chosen → the markdown-it renderer in `integrations/markdown-toolkit/source/export.js`. Strip new node-view chrome by adding its selector to `CHROME` (or `data-export-ignore`).

`markdownStudio.exportTheme` = `light` (default): `github-light` (or the user's light theme) on a transparent page, VS Code's color variables dropped, dark Mermaid / GMC diagrams redrawn light. Block frames (directive cards, diagram boxes, column outlines) are always flattened.

DOCX (`integrations/markdown-toolkit/source/docx.js`): Pandoc `markdown` reader (+`gfm_auto_identifiers` so TOC links hit headings) with a Lua filter — columns → one-row "Columns" table, `<div align>` → "Center"/"Right" paragraph styles, `<mark>` → "Highlight <Color>", raw HTML re-read by Pandoc's HTML reader, `> [!NOTE]` labels. The reference DOCX (user template or Pandoc's default) gets those styles added when missing; without a template the default "Table" style also gets a grid.
-   Inline `<mark data-color>` … `</mark>` → `highlight` → `Highlight` mark; written back by `rehypeRemarkHandlers.mark`.
-   A table followed by `<!-- ms-table:cols=…;rows=… -->` gets cell `colwidth` / row `data-height` (column/row resizing); the comment is re-emitted after the table on save.
-   `RawHtmlBlock` hides tool metadata comments (`<!-- key:value -->`, `isMetaComment`).

GMC "interactive" opens `dist/webview` in a `srcdoc` iframe modal (`GmcBlock`). VS Code's webview service worker won't serve files to a nested `about:srcdoc` frame, so the editor fetches the graph JS/CSS (CSP `connect-src`) and inlines them with a nonce'd `acquireVsCodeApi` shim that relays to the editor; saves go through the host `gmcSave` message.

## Rendered diff

`DiffView` rendered mode: `renderedDiff.ts` splits both versions into top-level blocks (same grouping as the editor; frontmatter as a yaml block, link definitions appended to every block), diffs the block lists and pairs similar removed/added blocks (`old`/`new`). Each block goes through `markdownToHtml` and is wrapped in `<div data-type="diff" data-diff=…>`; a read-only editor with `contentExtensions()` (shared with App, `editorExtensions.ts`) + `DiffBlock`/`DiffWords` renders it. Tests: category U.

## Layout, zen, line numbers, outline, block handle, tables

-   Layout settings (`contentWidth`, `fontSize`, `lineHeight`, `fontFamily`, `lineNumbers`, `outlineStyle`) follow the 4-place settings rule; `useAppearance` turns them into `--ms-*` CSS variables on body.
-   Zen: `body.zen-mode` + `ZenFocus` decoration (`zen-here` on the caret's top-level block). Host command `betterMarkdown.toggleZen` (Ctrl/Cmd+.) posts `toggleZen`.
-   Line numbers: `useEditorState` dispatches `btrmk:source` with the latest markdown; `sourceBlockLines` maps top-level mdast nodes to lines; `LineNumbers` overlays them by block order.
-   `BlockHandle`: hover handle over top-level nodes (`view.nodeDOM`), drag via `view.dragging = { slice, move: true }`.
-   `TableFilter` plugin: view-only row-hiding decorations keyed by table position (mapped with assoc -1 so in-place replacements like sort keep their filter); `sortTableTr` rewrites row order. Range selection is prosemirror-tables' `CellSelection` (`.selectedCell`). Tests: category S.
-   Directive insertion: `src/directives.ts` (`betterMarkdown.insertEmbed/insertLink/insertToc/updateEmbeds`), rich editor gets an `insertDirective` message.
