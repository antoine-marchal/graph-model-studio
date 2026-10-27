# Markdown Studio — document studio

Word-like authoring of `.md` files in the `betterMarkdown.editor` custom editor: paginated paper,
named styles, sections, headers / footers, masters imported from corporate Word templates,
positioned objects with layers, and native DOCX export without Pandoc. Markdown stays the only
source; everything else is derived.

## Where the code lives

| Area | Files |
| --- | --- |
| Document semantics (no DOM; host, webview and tests share it) | `document/schema.ts` (types, page resolution), `markers.ts` (marker grammar), `meta.ts` (frontmatter span edits), `remarkStudio.ts` (mdast grouping), `model.ts` (source → semantics), `styles.ts` (style sheet + provenance), `masters.ts` (starters, sections, story linkage), `paginate.ts` (pagination algorithm), `units.ts` |
| Versioned edits | `../shared/edit-sync.ts` (rebase), `src/panelSync.ts` (host), `webview/studio/documentSync.ts` (webview), `webview/studio/sourceMap.ts` (block-level source reuse) |
| Host | `src/provider.ts` (messages, flush, undo / save), `src/masterLibrary.ts`, `src/exportDocx.ts`, `src/docx/compile.ts`, `src/docx/importTemplate.ts`, `src/extension.ts` (commands) |
| Editor | `webview/extensions/StudioNodes.ts` (nodes, marks, VS Code history keys), `webview/studio/pagination.ts`, `ObjectView.ts`, `ObjectLayer.tsx`, `PageLayer.tsx` (paper, master canvas, rulers), `Shell.tsx`, `Ribbon.tsx`, `galleries.tsx`, `NavPanel.tsx`, `Inspector.tsx`, `ContextMenu.tsx`, `ui.tsx` / `icons.tsx` (Slides Studio controls and icons), `hooks.ts` (`useEditorDerived`), `commands.ts`, `actions.ts`, `store.ts`, `bridge.ts`, `styles/studio.css` |
| Tests | `test/studio-core.test.ts`, `panel-sync.test.ts`, `docx-compile.test.ts`, `docx-import.test.ts`, `studio.browser.ts`, `host/run.mjs` + `host/suite.cjs`, fixture `test/fixtures/report/`; `studio.profile.ts` (CPU profile + React commits while typing) |

Reused from Slides Studio (imported, unchanged): `groups.ts` (group paths, layer tree, layer
moves), `geometry.ts#connectorPath`, `units.ts` constants, `i18n.ts#tr`, the icon set, and the
chrome stylesheet itself: `esbuild.mjs` bundles `slides-studio/.../webview/src/styles.css` (minus
Tailwind and its page-level rules) before `studio.css`, so both studios share one look
(`slides-studio/DESIGN.md`). UI strings are French / English through `tr()`, from `<html lang>`.

## Interaction model (Slides Studio, Word flavour)

* **Chrome.** Title bar (quick access, Visual / Source, Export .docx split button), ribbon tabs
  Home / Insert / Layout / References / Design / Review / View plus the contextual *Object format*
  (or *Master format*) tab, navigator (Outline / Pages), inspector (Format / Styles / Layers /
  Check), status bar (page, section, words, sync dot, issues, zoom). Units shown in cm, stored in pt.
* **No boxes on the paper.** Blocks (code, diagrams, embeds, equations) render as document content;
  their tools appear only while selected or focused. Their settings live in the inspector and the
  context menu.
* **Context menus** everywhere (Slides Studio's engine: clipboard quick bar, submenus, full
  keyboard): selected text, the block under the pointer, objects, the page, headers / footers,
  master objects, outline headings, layer rows.
* **Any block can float.** Position › Floating (moves with text) or Fixed (on the page) wraps the
  block in an `msObject` with a borderless text frame at its current place; pictures become picture
  objects. Back in line (ribbon, context menu or inspector) restores the editable block. A selected
  block (diagram, image, table…) is its own block for the ribbon Position menu; a selected GMC
  diagram shows its fence options (id, view, theme, size), *Edit diagram* and *Model code* in the
  inspector — a click selects it, a double-click opens the diagram editor.
* **Objects: select, edit, move.** A click selects the object (frame and handles). A double-click
  (or Enter from the menu) edits its text: the caret goes into the object's own paragraphs, the
  pointer selects text without moving the object, and ribbon / inspector formats apply there.
  Escape leaves the text to the object, Escape again to the document. Dragging tracks paper
  coordinates, so the page may scroll under the pointer (wheel, or auto-scroll near the canvas
  edges) at any zoom. A drop anchors to the block at that point that *starts on the drop page* (an
  offset from a paragraph begun on an earlier page would span a page break and move again at
  every pagination pass); the move and its re-anchoring are one edit (one undo step), and the
  object stays selected.
* **Masters on the canvas.** Design › Edit master (or the page menu) dims the body and makes the
  master's objects selectable, movable and resizable on any page (one master change on release);
  right-click adds text boxes, shapes or placeholders where the page was clicked; a double-click
  edits a master box's text (a placeholder's prompt) in place, one master change. Each master object
  is Floating, Fixed (geometry locked) or a Placeholder exported as the matching Word field. A
  placeholder is any key the documents fill in (presets: title, subtitle, author, client, reference,
  or *Other text…*); its geometry, style and prompt belong to the master, the typed value to the
  document (the `::: <key>` group, its key listed in `placeholders`, shared by every page that
  shows that placeholder) — typing it never
  changes the master. Date, page and page count are automatic fields, not placeholders to type. A
  built-in master is saved as a library copy applied to the document. In VS Code the *Corporate
  masters* activity-bar container shows *Presentation masters* (Slides Studio) and *Document
  masters* (Markdown Studio) side by side.
* **Headers and footers.** Double-click edits the story's Markdown in place; mouse selection stays
  in it, ribbon Bold / Italic wrap the selection (other character formats do not apply to stories
  and never fall through to the body); the paragraph style gallery and the alignment buttons apply
  to the whole story (`blocks.header`, a master story's `block`). Ctrl+Enter saves, Escape cancels,
  both return to the text. A document story's text is its `::: header` / `::: footer` group.
* **Rulers.** Horizontal and vertical rulers for the current page: drag margin edges (document,
  section or master page) and the paragraph's first-line / left / right indents; the value shows
  while dragging, one edit on release (Alt: no snapping to 0.25 cm).

**Typing performance.** Every React commit while the caret is in the contenteditable makes React
rescan the selection across the whole document, so React work per keystroke is kept off: Tiptap's
"position changed" node-view update (a new `getPos` for every code block, diagram and equation
below the caret, one commit per keystroke) is absorbed without rendering
(`extensions/nodeViewPositions.ts`); the chrome never re-renders per keystroke:
editor-derived values go through `useEditorDerived` (recomputed per frame, compared by value,
positions that shift while typing are left out), page sheets are memoized, the object layer
redraws only when frames or connectors depend on the layout, and review / table-filter listeners
are attached only while those features are visible.

## Source format (schema version 2)

Ordinary paragraphs, headings, lists, tables, code, math, diagrams, embeds, directives and raw HTML
stay ordinary Markdown. Everything else is described in the frontmatter, keyed by id; the body
only holds the content of those ids in `::: id` groups (Slides Studio's syntax). Enhancements:

**Frontmatter key `markdownStudio`** — written as a span edit: other keys, comments and quoting are
never touched; inside the key, unchanged entries keep their comments.

```yaml
markdownStudio:
  version: 2
  master: corporate            # library id (.markdown-studio/masters/<id>/master.json) or a path
  page: { size: A4, orientation: portrait, margins: { top: 72, left: 68 } }   # pt
  styles: { Lead: { run: { color: C62828 } } }   # local overrides; delete a key = reset to master
  placeholders: [ client ]     # master placeholders this document fills: text in `::: client`
  fields: { reference: R-12 }  # older placeholder values / {{field:x}} values (still read)
  headers: { default: { id: header } }   # document stories replacing the master's: text in `::: header`
  blocks:                      # properties of the `::: id` block groups (and of stories), by id
    intro: { style: Lead, align: center, keepWithNext: true }
    header: { align: right }
  breaks:                      # page / section breaks at their empty `::: id` group
    pagebreak: { page: true }
    landscape: { master: corporate-2, orientation: landscape, break: nextPage, headers: link }
  objects:
    fig:
      type: image            # image | textbox | shape | connector
      placement: anchored    # anchored (follows the paragraph after its group) | page | inline
      relativeTo: margin     # page objects: margin | page frame
      box: { x: 300, y: 0, width: 160, height: 100 }   # pt; anchored: from column / anchor paragraph
      wrap: square           # square | topBottom | none (anchored only)
      plane: front           # front | behind
      z: 2
      locked: { geometry: true, content: false }   # editor locks, not Word protection
      hidden: false          # omitted from DOCX unless markdownStudio.docx.hiddenObjects = include
      group: cards/card-1    # nested group path
      from: { id: a, side: right }   # connectors
      to: { id: b }
  export: { mode: strict }
```

**`::: id` groups** — a fence line `::: id` opens a group, `:::` closes the innermost one (code
blocks excepted); the content needs no blank lines around it. What the group is comes from the
frontmatter: `objects.<id>` → that object's content (an object without content: `::: id` then
`:::`); `breaks.<id>` → a page break (`page: true`) or a section break (its properties), an
empty group; a story's `id` or a key of `placeholders` → that text (never in the text flow); anything else
→ a block group whose blocks take `blocks.<id>` (style, alignment, spacing, indents, keep rules; the
id is the Word bookmark). Styling a paragraph in the editor gives it a group (id from the style name:
`caption`, `caption-2`…); consecutive blocks of one group share its fences.

```markdown
::: header
ACME — {{title}}
:::

::: client
Contoso
:::

::: intro
Properties of these blocks: `blocks.intro`.
:::

::: fig
![Architecture](assets/arch.png)
:::

::: pagebreak
:::

::: landscape
:::
```

The body has no `<!-- ms:… -->` comments. Files written by version 1 (`<!-- ms:block {…} -->`,
`<!-- ms:object {…} -->` … `<!-- ms:endobject -->`, `<!-- ms:pagebreak -->`, `<!-- ms:section {…} -->`, stories' `markdown:`, placeholder `fields`) are
still read; their blocks are rewritten as groups on the next save, a marker left with no block to
style is dropped.

**Inline formatting** — `<span style="color:#C62828;font-size:12pt;font-family:Georgia" data-ms-style="Emphasis">…</span>`
(only color, background-color, font-size, font-family are kept). Highlights keep the existing
`<mark data-color>`.

**Masters** — `.markdown-studio/masters/<id>/master.json` (+ `assets/`, `source/<template>`,
`import-report.json`): page setup, theme colors / fonts, named styles with `basedOn`, numbering
formats, first / default / even header and footer stories (`{{page}}`, `{{pages}}`, `{{title}}`,
`{{field:x}}`), recurring drawings (`background`, story `objects`), fields, constraints,
provenance. Ids are folder names and never change on rename. Built-in starters: Body, Cover,
Chapter opener, Letterhead, Landscape appendix (read-only; Customize / Duplicate copies them).

## Architecture decisions

**Authority.** The VS Code `TextDocument` owns text, dirty state, save and undo. Nothing is
stored beside the Markdown; pages, page boxes, measured geometry and thumbnails are derived.

**Edits.** The webview serializes the desired source and sends only its difference with the last
acknowledged text: `{ type: "edit", id, baseVersion, changes }` → `ack` / `rejected` / `update`.
One edit in flight per panel; host writes to one document are serialized across panels. An edit
based on an older version is rebased onto the current text when it touches a different region,
otherwise rejected (never written over newer text); the webview keeps the rejected text for
"Copy my version". External updates are merged with unsent local typing the same way. Save,
export, source switch and undo first flush (host `flushRequest` → webview `flushed`).

**Source preservation.** Every top-level ProseMirror node is tied, by node identity, to the
source range it was parsed from (`data-ms-blk` stamps at load). Saving reuses the exact text of
every unchanged block and the original whitespace between blocks; only new or changed blocks go
through HTML → Markdown. Incoming source changes replace only the blocks they touch, so the caret,
node views and scroll stay elsewhere. Opening a document never writes.

**Undo policy.** One history: VS Code's. ProseMirror history is disabled in the editor;
Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y flush the pending edit and run VS Code's undo / redo. Typing is
grouped by the 300 ms send debounce; a drag, a resize, a rotation or a burst of keyboard nudges is
one edit; ribbon / inspector commands are one edit each. Master edits go to the master's own
`master.json` document, so document undo never reverts master work and vice versa.

**Pagination.** One ProseMirror view (continuous selection, caret moves, copy / paste, IME and
undo across pages). Blocks are measured in content coordinates (DOM y minus the page spacers
above); `document/paginate.ts` breaks pages between blocks, between lines inside paragraphs (lists
and code too) or between table rows, with keep-with-next chains, keep-together, page-break-before,
widow / orphan control and repeated table header rows. Each break is a spacer widget (page bottom
margin + gap + next page top margin); a header row break also inserts a non-editable clone of the
header rows. A block taller than a page is placed once at a page top and reported (no endless
pushing); images and diagrams are capped to the page content height. Passes are debounced, never
run during IME composition, rerun on resize / font / image loads, stop when nothing changes and
after four passes without a document change. Zoom is a CSS transform: it never changes geometry
or pagination. Sections change the page frame and the column width of their blocks.

**Objects.** An object's body lives in the document (`msObject` node right before its anchor
paragraph), so text boxes are edited in place and undo / selection stay unified; it is drawn
absolutely positioned. Anchored objects follow their paragraph; page objects sit on the page (or
margin frame) where their anchor paragraph lands — Word keeps a story anchor too. Square /
top-and-bottom wrap reserve the object's area with a float and `shape-outside` in the anchor
paragraph. Layers are front / behind planes with z-order; z-order never moves paragraphs.
Connectors attach to object ids and follow their targets; missing ends are diagnosed. Copy /
paste / duplicate get unique ids and their own descriptors. Deleting an object removes its
descriptor; deleting its paragraph moves the anchor to the next block, with a notice.

**Masters and sections.** Style resolution: defaults → each master of the family (`basedOn`) →
document overrides, with per-property provenance, cycle detection and Reset to master. Section
stories follow Word: a section with its own master uses that master's stories unless
`headers: link`; a section without a master links to the previous one.

**DOCX.** `src/docx/compile.ts` compiles parsed semantics plus resolved masters with
`docx@9.9.0` (pinned; `docx/shapes` for shapes, text boxes, groups and connectors), with no
webview needed. Ordinary text → paragraphs with named styles (built-ins under Word's own names),
lists → numbering, tables with repeated header rows, sections (size, orientation, margins,
title page, columns, page numbering), header / footer stories with PAGE / NUMPAGES / TITLE /
DOCPROPERTY fields, bookmarks and internal / external hyperlinks, TOC field. Objects → anchored
pictures / shapes / text boxes; objects joined by connectors (or grouped) → one drawing group so
Word keeps connectors attached. Master background drawings → drawings in the header story;
master text boxes keep their text and placeholders become TITLE / DATE / PAGE / NUMPAGES /
DOCPROPERTY fields. Strict mode writes nothing when content would be lost; permissive writes with documented
fallbacks. Every export returns a report (native counts, fallbacks, unsupported, missing, fonts,
fidelity limits).

**Template import.** `src/docx/importTemplate.ts` reads OOXML parts directly (JSZip +
fast-xml-parser): document defaults, styles with `basedOn`, theme colors / fonts, numbering
(lists the template uses first), every section's properties (paragraph-level and final),
first / even / default header and footer stories with fields and pictures, link-to-previous,
even / odd setting. Masters come from section designs, never from pages; sample body content is
reported, never turned into furniture. Untrusted input: size, entry count, expansion and
compression-ratio limits, no path traversal, DOCTYPE refused (no entity expansion), macros never
executed, external relationships listed but never fetched, embedded fonts not extracted.

## Support matrix

| Feature | Editor | DOCX export | Template import |
| --- | --- | --- | --- |
| Paragraphs, headings, named paragraph / character styles | yes | native styles | supported (basedOn, defaults) |
| Direct formatting (align, spacing, indents, keep rules, font, size, colors) | yes | native | supported |
| Lists, numbering, checklists | yes | native numbering (checkbox glyphs) | flattened to bullet / format lists |
| Tables, repeated header rows | yes, split by rows | native, header repeats | table style borders / header fill only |
| Images inline / anchored / page-relative, alt text | yes | native pictures (PNG, JPEG, GIF, BMP) | story pictures (PNG, JPEG, GIF, BMP) |
| Text boxes, shapes, groups, connectors | yes | native (`wps` / `wpg`) | simple story shapes; other drawings reported |
| Square / top-and-bottom wrap, behind / in front | yes | native | — |
| Sections, orientation, margins, page-number restart | yes | native | supported |
| Newspaper columns | one-column preview | native `w:cols` | supported |
| Headers / footers first / even / default, linkage | yes | native stories + fields | supported |
| Fields page / pages / title / document fields | filled in preview | real Word fields (update in Word) | PAGE, NUMPAGES, TITLE, DOCPROPERTY |
| TOC directive | existing TOC block | Word TOC field (prefilled) | — |
| Math | KaTeX | linear Office Math (fallback, reported) | — |
| GMC / Mermaid diagrams | live | pictures (GMC via render panel, Mermaid via an open editor) else source code (reported) | — |
| Side-by-side `ms-columns` containers | yes | borderless layout table (reported) | — |
| Raw HTML blocks, footnotes | kept verbatim | text / plain paragraphs (reported) | — |
| Macros, external links, embedded fonts, VML watermarks, content controls | — | — | reported, not imported |

Fidelity limits (stated in every report): Word computes its own line and page breaks; page fields
and the TOC show cached values until Word updates fields; fonts are not embedded. The editor's
pagination is the browser's layout of the same styles — page counts are approximate, explicit
breaks are exact.

## Migration notes

* `markdownToolkit.exportDocx` keeps its id and now runs the built-in compiler
  (`markdownStudio.exportDocx`); Pandoc and the Lua filter are gone
  (`integrations/markdown-toolkit/source/docx.js` and its test were removed).
* `markdownToolkit.pandoc.path` is deprecated and ignored. `markdownToolkit.pandoc.referenceDoc`
  is deprecated: after an export, a document with no master is offered "Import as master" for the
  configured reference document.
* New settings: `markdownStudio.pageView` (paper view, default on),
  `markdownStudio.docx.mode` (`permissive` | `strict`), `markdownStudio.docx.hiddenObjects`
  (`omit` | `include`).
* New commands: Export editable DOCX, Import Word template as master, Manage document masters,
  Run corporate preflight.
* Webview protocol: the whole-document `{ type: "edit", content }` message is replaced by
  versioned replacements (above). Host integrations that post edits must use the new shape.
* The editor now uses VS Code's undo history (Ctrl+Z inside the editor runs VS Code's undo).

## Verification

```bash
pnpm run test:studio            # core, panel sync, DOCX compile, template import (node --test)
pnpm run test:rich-editor       # conversion / round-trip suite
pnpm run build:rich-editor
pnpm run test:studio:browser    # built webview against a stub host (pagination, edits, objects, context menu,
                                # floating blocks, rulers, master canvas, perf; regressions: moves
                                # across pages at 75 % / 150 % while scrolling, text box / shape
                                # editing, footer formatting, GMC float round trip, H1–H6, master
                                # placeholders, continuous view)
node rich-editor/esbuild.mjs --dev && npx tsx rich-editor/test/studio.profile.ts   # CPU + React commits
pnpm run test:rich-editor:browser
pnpm run test:studio:host       # inside VS Code: import, export, no-op open, undo, flush, preflight
npx tsx rich-editor/test/export-fixture.ts rich-editor/test/fixtures/report/report.md out.docx
```

## Follow-ups (not in this version)

Footnotes / citations as Word notes, mail merge, contour wrapping, linked text frames, track
changes interoperability, arbitrary DOCX content import, live preview of newspaper columns,
OMML from LaTeX, embedding fonts, dragging connector ends to re-attach them on the canvas.
