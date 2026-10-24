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
| Editor | `webview/extensions/StudioNodes.ts` (nodes, marks, VS Code history keys), `webview/studio/pagination.ts`, `ObjectView.ts`, `ObjectLayer.tsx`, `PageLayer.tsx`, `Shell.tsx`, `Ribbon.tsx`, `NavPanel.tsx`, `Inspector.tsx`, `actions.ts`, `store.ts`, `bridge.ts`, `styles/studio.css` |
| Tests | `test/studio-core.test.ts`, `panel-sync.test.ts`, `docx-compile.test.ts`, `docx-import.test.ts`, `studio.browser.ts`, `host/run.mjs` + `host/suite.cjs`, fixture `test/fixtures/report/` |

Reused from Slides Studio (imported, unchanged): `groups.ts` (group paths, layer tree, layer
moves), `geometry.ts#connectorPath`, `units.ts` constants. Its chrome tokens are mirrored in
`studio.css` (see `slides-studio/DESIGN.md`).

## Source format (schema version 1)

Ordinary paragraphs, headings, lists, tables, code, math, diagrams, embeds, directives and raw HTML
stay ordinary Markdown. Enhancements:

**Frontmatter key `markdownStudio`** — written as a span edit: other keys, comments and quoting are
never touched; inside the key, unchanged entries keep their comments.

```yaml
markdownStudio:
  version: 1
  master: corporate            # library id (.markdown-studio/masters/<id>/master.json) or a path
  page: { size: A4, orientation: portrait, margins: { top: 72, left: 68 } }   # pt
  styles: { Lead: { run: { color: C62828 } } }   # local overrides; delete a key = reset to master
  fields: { client: Contoso }  # {{field:client}} in stories, DOCPROPERTY in Word
  headers: { default: { markdown: "{{title}}" } }  # document stories replacing the master's
  objects:
    fig:
      type: image            # image | textbox | shape | connector
      placement: anchored    # anchored (follows the paragraph after its marker) | page | inline
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

**Markers** — one HTML comment per line, invisible in every Markdown renderer. The payload is one
JSON object; `--` is written `--`. A marker that fails to parse stays raw HTML and is
reported; unknown `ms:` kinds are kept and reported.

```markdown
<!-- ms:block {"id":"intro","style":"Lead","keepWithNext":true} -->
Properties of the next block only (style, spacing, indents, keep rules, bookmark id).

<!-- ms:object {"id":"fig"} -->
![Architecture](assets/arch.png)
<!-- ms:endobject -->
(the body is the object's content, stored once; no end marker when the next marker is not
`ms:endobject` = an object without body, e.g. a shape or connector)

<!-- ms:pagebreak -->
<!-- ms:section {"master":"corporate-2","orientation":"landscape","break":"nextPage","headers":"link"} -->
```

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
Word keeps connectors attached. Master background drawings → behind-text drawings in the header
story. Strict mode writes nothing when content would be lost; permissive writes with documented
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
pnpm run test:studio:browser    # built webview against a stub host (pagination, edits, objects, perf)
pnpm run test:rich-editor:browser
pnpm run test:studio:host       # inside VS Code: import, export, no-op open, undo, flush, preflight
npx tsx rich-editor/test/export-fixture.ts rich-editor/test/fixtures/report/report.md out.docx
```

## Follow-ups (not in this version)

Footnotes / citations as Word notes, mail merge, contour wrapping, linked text frames, track
changes interoperability, arbitrary DOCX content import, live preview of newspaper columns,
OMML from LaTeX, embedding fonts, dragging connector ends to re-attach them on the canvas.
