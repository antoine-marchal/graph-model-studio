# Keyboard shortcuts & gestures

`Ctrl` is shown for Windows/Linux; use `Cmd` on macOS.

## Global

| Action | Shortcut |
|--------|----------|
| Save model to file | `Ctrl+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` or `Ctrl+Y` |

> Undo/redo target **model** changes. When the DSL editor is focused, `Ctrl+Z`
> falls through to Monaco's own text undo instead.

## Graph canvas

| Action | Shortcut / gesture |
|--------|--------------------|
| Add node | Right-click canvas, or **＋ Node** toolbar button |
| Rename node inline | Double-click node, or `F2` with one node selected |
| Commit / cancel rename | `Enter` / `Esc` |
| Duplicate selection | `Ctrl+D` |
| Copy / paste nodes | `Ctrl+C` / `Ctrl+V` |
| Delete selection | `Delete` or `Backspace` |
| Multi-select | `Ctrl`/`Cmd`-click nodes |
| Box select | Hold `Shift` and drag |
| Connect nodes | Drag from a node's edge handle to another node |
| Resize a node | Select it, drag the corner/side handles |
| Embed / nest a node | Drag it onto any other node (drag out to un-nest) |
| Pin an edge anchor | Select the edge → set Source/Target anchor in Properties |
| Jump to relationship in DSL | Double-click an edge |
| Pan / zoom | Drag empty canvas / scroll · use the on-canvas controls |

## Add-node menu

| Action | Key |
|--------|-----|
| Filter types | Start typing |
| Move selection | `↑` / `↓` |
| Add highlighted type | `Enter` |
| Close | `Esc` |

## Toolbar (graph)

- **Layout engine** dropdown — Layered or Dagre.
- **⤢ All** / **⤢ Selected** — auto-layout the whole view or just the selection.
- **Fit** — fit the diagram to the viewport.
- **⧉ Duplicate**, **⌗ Snap** (grid), **▭ Map** (minimap), **⤓ PNG** (export).

## Panels

- Drag a **separator** to resize Explorer / DSL / Graph / Properties.
- **Double-click a separator** to collapse that panel.
- Title-bar **▥** / **▤** toggle the Explorer / Properties panels.
- Panel sizes and toggles persist across sessions.

## Building a view

- **＋** in the Explorer's Views section adds a new, *empty* view.
- **Drag elements** from the Explorer onto a view to include them (drag a
  multi-selection to add several at once). The view's badge shows `all` or the
  number of included elements.
- Hover an included element in a custom view and click **−** to remove it.
