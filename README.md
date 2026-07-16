# Graph Model Studio

A local-first, browser-based **architecture model builder**. Write a concise
text DSL on the left, get a live, fully-editable diagram on the right — and edit
either side; they stay in sync. One model, many views, fifteen notations.

> Code ⇄ Diagram. Everything you type becomes a graph; everything you drag,
> rename, connect, or lay out is written back to the DSL.

The native document format is **Graph Model Code (`.gmc`)**: a human-readable
DSL file containing the model, its views, and the diagram layout.

```
┌──────────┬───────────────────────┬───────────────────────┬─────────────┐
│ Explorer │ DSL (Monaco)          │ Graph (React Flow)    │ Properties  │
│ views    │ model { … }           │   ┌────┐    ┌────┐     │ name        │
│ elements │ a -> b "Uses"         │   │ a  │───▶│ b  │     │ type        │
│ relations│ views { … }           │   └────┘    └────┘     │ direction…  │
└──────────┴───────────────────────┴───────────────────────┴─────────────┘
        ↑ drag the separators to resize · double-click to collapse
```

---

## Highlights

- **Bidirectional editing** — Monaco DSL editor and a React Flow canvas backed by
  one shared model. Type in the DSL or manipulate the canvas; both reconcile.
- **Fifteen notations out of the box** — C4, ArchiMate (full element set across
  all layers), BPMN, Flowchart, UML Use Case, UML Sequence, Tree, Mindmap,
  PERT, Gantt, Git Graph, Ishikawa (fishbone), Quadrant, Timeline, and a
  Generic palette. Notation-correct node shapes and edge markers (filled/hollow
  arrows, diamonds, balls, open circles).
- **Chart notations lay themselves out inside movable frames** — sequence
  (`seqGraph`), git (`gitGraph`), gantt (`ganttGraph`) and timeline
  (`timelineGraph`) are container frames that embed their nodes and draw their
  own decor (lifelines, lanes, axis, spine); drag the frame and the whole chart
  moves. Ishikawa nests `problem → cause → subCause`, quadrant charts plot items
  from `x`/`y`, a `mindmapGraph` lays a mind map out radially, and a `treeGraph`
  renders a collapsible Windows-Explorer file tree (`treeNode`s only; per-node
  `icon` paths; drag a row to reorder or embed; drag from a row's connect dot to
  link a file to any node). Reorder chart children by dragging, or drop grid
  items into cells.
- **UML, ERD and matrix diagrams** — `umlClass`/`umlInterface`/`umlEnum` with
  attribute/method compartments and cardinality on relations; `erdEntity` with
  keyed (PK/FK) attribute rows and crow's-foot relations; and a `gridGraph`
  N×M matrix (e.g. a 5×5 AMDEC) with labelled headers, fixed cell colours and
  drag-into-cell items. Chart-specific fields are all editable from the
  properties panel.
- **PERT charts with critical path** — give tasks a `duration "5"` property and
  connect them with `: dependsOn`; ES/EF, LS/LF and slack are computed per node
  and the critical path is highlighted in red.
- **Gantt charts on a real date scale** — a movable `ganttGraph` frame holds
  the tasks, sections and milestones and draws the timeline axis; tasks use
  `start "2026-08-03" duration "4d"` (or `end`, `"2w"`, `progress "60"`),
  undated tasks chain after their dependencies, and sections group phases into
  bands. Edit start/duration/progress from the properties panel.
- **Nested containers** — drop a node onto a container to reparent it; containers
  auto-size around their children at every depth.
- **Two auto-layout engines** — the built-in layered (Sugiyama-lite) layout and
  [dagre](https://github.com/dagrejs/dagre). Switch live; lay out the whole view
  or just the selection.
- **Resizable, collapsible panels** — drag the separators between Explorer, DSL,
  Graph, and Properties. Double-click a separator to collapse. Sizes persist.
- **Inline editing** — double-click a node (or press `F2`) to rename it on the
  canvas. Properties panel for everything else.
- **Resizable nodes** — select a node and drag its handles; sizes persist.
- **Drag-to-embed** — drop any node onto another to nest it inside; drag it out
  to un-nest. Containers auto-size to fit.
- **Pinned edge anchors** — lock a relationship's endpoint to a node side
  (Top/Bottom/Left/Right) from the Properties panel — handy for decisions and
  gateways. Edge labels always render above the lines and arrow heads.
- **Undo / redo** — full history for every model change (`Ctrl/Cmd+Z` /
  `Ctrl/Cmd+Shift+Z`).
- **Duplicate, copy & paste** nodes, **snap-to-grid**, **minimap toggle**.
- **Export** to JSON, Graph Model Code (`.gmc`), Mermaid, PlantUML, and **PNG**
  of the canvas.
- **Local-first** — your work is auto-saved to the browser draft; open/save model
  files from disk.

---

## Quick start

```bash
pnpm install      # or npm install / yarn
pnpm dev          # start the dev server (Vite)
pnpm build        # type-check + production build
pnpm test         # run the unit tests (Vitest)
```

Open the printed local URL. The app loads with an example C4 model so you can
start exploring immediately.

---

## The 60-second tour

1. **Edit the DSL** (left). The graph updates as you stop typing.
2. **Right-click the canvas** → searchable menu of every node type. Type to
   filter, `↑`/`↓` to navigate, `↵` to add. Recently-used types float to the top.
3. **Double-click a node** to rename it inline. The change is written back to the
   DSL.
4. **Drag a node onto a container** to nest it; drag it out to un-nest.
5. **Connect nodes** by dragging from a node's edge handle to another node.
6. Pick a **layout engine** (Layered / Dagre) in the toolbar and hit **⤢ All**.
7. **Export** from the title bar, or **⤓ PNG** from the graph toolbar.

See [`docs/DSL.md`](docs/DSL.md) for the language, [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md)
for every keybinding, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how
the codebase fits together.

---

## The DSL in one glance

```text
model {
  customer = person "Customer"

  banking = softwareSystem "Banking Platform" {
    web = container "Web Application" { technology "React" }
    api = container "API Gateway"     { technology "Node.js" }
    db  = container "PostgreSQL"        { technology "PostgreSQL" }
  }

  customer -> banking.web "Uses"
  banking.web -> banking.api : sequenceFlow "Calls"
  banking.api -> banking.db  "Reads / writes"
}

views {
  view systemContext {
    include *
    autolayout lr
  }
}
```

- `id = type "Label" { … }` declares an element; nest blocks to nest containers.
- `a -> b "label"` declares a relationship; add `: relationType` to pick a
  notation-specific edge (e.g. `composition`, `sequenceFlow`, `realization`).
- `views { view <id> { include *; autolayout lr } }` declares views.

Full grammar and every element/relation type: [`docs/DSL.md`](docs/DSL.md).

---

## VS Code extension

The `vscode-extension/` subproject imports the GMC parser, model, notation
registry, layout engines, React Flow renderer, graph components, store, and
styles directly from `src/`. The extension provides `.gmc` language support,
an interactive graph editor beside the source document, bidirectional source
synchronization, PNG export, and automatically rendered GMC diagrams in the
built-in VS Code Markdown preview. See [`vscode-extension/README.md`](vscode-extension/README.md)
for the complete feature and usage guide.

---

## Tech stack

| Concern        | Choice |
|----------------|--------|
| UI             | React 18 + TypeScript + Vite |
| Diagram canvas | [@xyflow/react](https://reactflow.dev) (React Flow 12) |
| Code editor    | Monaco (`@monaco-editor/react`) with a custom DSL language |
| State          | Zustand + Immer (single model store, command dispatch) |
| Layout         | Built-in layered layout + `@dagrejs/dagre` |
| Validation     | Zod schemas for the model |
| Styling        | Tailwind CSS with CSS-variable theming (light/dark) |
| Export         | JSON · DSL · Mermaid · PlantUML · PNG (`html-to-image`) |

---

## License

See repository terms. Built as a developer tool for designing and documenting
software architecture models.
