# Architecture

Graph Model Studio is a single-page app organised around **one shared model**
that both the text editor and the diagram canvas read from and write to.

```
                ┌─────────────────────────────────────────────┐
                │              Zustand model store             │
                │  model · dslSource · views · selection ·     │
                │  history (undo/redo) · prefs · dispatch()    │
                └───────────▲───────────────────────▲──────────┘
                            │                        │
            parseDsl()/serializeModel()      ModelCommand dispatch
                            │                        │
        ┌───────────────────┴────┐     ┌─────────────┴──────────────┐
        │   CodeEditor (Monaco)  │     │   GraphEditor (React Flow)  │
        │   DSL ⇄ model          │     │   nodes/edges ⇄ model       │
        └────────────────────────┘     └────────────────────────────┘
```

## Layers

```
src/
├─ app/                 App shell: resizable layout, title bar, status bar
├─ core/                Framework-agnostic domain logic (no React)
│  ├─ model/            Types (Zod), commands, model reducer helpers
│  ├─ dsl/              Lexer → parser → AST → model, and serializer
│  ├─ notation/         Element/relation registries (C4, ArchiMate, BPMN, …)
│  ├─ layout/           Layered layout, dagre adapter, engine dispatcher
│  └─ export/           JSON · DSL · Mermaid · PlantUML exporters
├─ features/
│  ├─ editor-code/      Monaco wrapper + DSL syntax highlighting
│  ├─ editor-graph/     React Flow canvas, nodes, edges, context menu
│  ├─ explorer/         Tree of views / elements / relations
│  └─ properties-panel/ Inspector for the current selection
├─ store/               Zustand store (the single source of truth)
├─ services/storage/    Save/open providers (browser + Tauri stub)
└─ ui/                  Reusable primitives (Button, Input, Select, ResizeHandle)
```

The dependency rule is one-directional: `features` and `app` depend on `core`
and `store`; `core` depends on nothing app-specific. This keeps the model, DSL,
notation, and layout logic unit-testable in isolation (see `src/tests`).

## State & data flow

- **The store** (`src/store/model-store.ts`) holds the `model`, the current
  `dslSource`, view/selection state, an undo/redo `past`/`future` stack, and UI
  preferences (layout engine, snap, minimap, recent node types).
- **`dispatch(command)`** applies a `ModelCommand` (add/update/delete element,
  relation, or view; apply layout) via Immer, snapshots history, re-serializes
  the DSL, and persists a draft to `localStorage`.
- **Code → model:** the Monaco editor debounces input and calls
  `parseDslAndUpdate`, which re-parses and carries over view positions.
- **Model → code:** any structural command re-runs `serializeModel`, so the DSL
  text always reflects canvas edits.
- **`APPLY_LAYOUT`** (node drags, auto-layout) updates view positions only and is
  intentionally excluded from undo history to avoid flooding it.

## Rendering the diagram

`features/editor-graph/model-to-flow.ts` is the bridge from model to React Flow:

1. `getVisibleElementIds` resolves which elements a view shows (incl. ancestors).
2. `computeNestedLayout` recursively lays out each container level with the
   selected engine (`runLayout`), auto-sizing containers around their children.
   Stored positions win unless a fresh layout is requested (`ignoreStored`).
3. Nodes are emitted parent-before-child (a React Flow requirement) with depth-
   based z-index; edges are built with notation-correct markers referenced from
   `edges/EdgeMarkers.tsx`.

## Layout engines

`core/layout` exposes a small dispatcher:

- **`layered`** — a Sugiyama-lite layout (longest-path layering, barycenter
  ordering) implemented in `auto-layout.ts`. Respects container nesting.
- **`dagre`** — `dagre-layout.ts` adapts `@dagrejs/dagre`, converting its
  centre-based coordinates to the top-left convention used everywhere else.

`runLayout` / `runLayoutSubset` pick the engine; the choice is a user preference
in the store, so it applies to both live rendering and explicit "Layout" actions.

## Notation registry

`core/notation/registry.ts` is the catalogue of every element type (shape, fill,
stroke, icon, default size, layer/group) and relation type (line style, start/end
markers). The graph canvas, the add-node menu, the explorer swatches, and the
properties dropdowns are all driven by this single registry, so adding a new type
is a one-file change.

## Extending

- **New element/relation type** → add it to `core/notation/registry.ts` (and an
  icon to `nodes/NodeIcons.tsx` if desired).
- **New export format** → add an `Exporter` in `core/export/exporter.ts`.
- **New layout engine** → implement `(nodes, edges, options) => positions` and
  wire it into `core/layout/index.ts`.
- **New model operation** → add a `ModelCommand` variant and handle it in
  `applyCommand` in the store.
