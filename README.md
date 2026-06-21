# Graph Model Studio

A local-first, browser-based **architecture model builder**. Write a concise
text DSL on the left, get a live, fully-editable diagram on the right — and edit
either side; they stay in sync. One model, many views, five notations.

> Code ⇄ Diagram. Everything you type becomes a graph; everything you drag,
> rename, connect, or lay out is written back to the DSL.

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
- **Five notations out of the box** — C4, ArchiMate (full element set across all
  layers), BPMN, Flowchart, and a Generic palette. Notation-correct node shapes
  and edge markers (filled/hollow arrows, diamonds, balls, open circles).
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
- **Export** to JSON, DSL (`.gmc`), Mermaid, PlantUML, and **PNG** of the canvas.
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
