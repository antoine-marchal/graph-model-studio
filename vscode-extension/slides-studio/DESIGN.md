# Design — Corporate Slides Studio editor

Direction chosen by the user: **"Studio type Figma"** — a neutral, self-owned studio chrome (not inherited from the VS Code color theme), following only the theme *kind* (light/dark) so it never clashes with the workbench.

## World

A quiet precision instrument. Graphite panels around a recessed canvas well; the corporate slide is the only saturated object on screen. One accent — "selection blue" — marks selection, focus and the primary action. Everything else is neutral steps.

## Tokens (CSS custom properties, `webview/src/styles.css`)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg-panel` | `#1e1f22` | `#f7f7f8` | side panels, toolbar |
| `--bg-well` | `#141517` | `#e7e8eb` | canvas well |
| `--bg-raised` | `#2a2c30` | `#ffffff` | inputs, menus |
| `--line` | `#2f3136` | `#dcdde1` | 1px dividers |
| `--fg` | `#e8e9ec` | `#1b1c1f` | primary text |
| `--fg-muted` | `#9a9da5` | `#5d6068` | labels |
| `--accent` | `#4d8dff` | `#1f6bff` | selection, focus, primary |
| `--warn` / `--error` | `#e5a93a` / `#ff6b6b` | `#a86400` / `#c62828` | diagnostics |

Type: platform UI sans (`system-ui`, Segoe UI), 12px base, 11px labels in small caps tracking 0.04em, tabular numerals for all geometry fields. Radius 6px controls, 8px menus. Shadows only on floating menus (0 8px 24px rgb(0 0 0 / .28)).

## Layout

PowerPoint-like Normal view, in the same studio tokens:

- Title bar 38px on `--bg-chrome`: quick access (save, undo, redo) left, file name and revision chips centered, `Visuel | Source` switch and the primary *Exporter .pptx* right.
- Ribbon: tabs 30px (Accueil, Insertion, Révision, Affichage, plus the contextual accent-colored *Format* / *Diagramme* tab when something is selected), body 92px of labelled groups. Large commands are 66px wide (20px icon over a balanced label), small ones 22px rows. Double-click a tab or use the chevron to collapse.
- `thumbnails 200px | canvas well over notes 92px | Format pane 280px`; the Format pane swaps for the Comments pane. Status bar 26px: slide position, sync, diagnostics, Notes and Comments toggles, zoom slider + fit.
- Thumbnails hide below 1000px, the right pane below 720px.

Review semantics: `--diff-add` (green), `--diff-mod` (violet, distinct from the amber warnings) and `--diff-del` (red) mark changes as 2px outlines with a label tag on the canvas, chips under thumbnails, hatched ghosts for deleted slides and elements. Review threads are accent speech-bubble pins numbered in document order.

## Components

- Icon buttons 28px, authored 16px SVG icons, 1.5px stroke.
- Inspector sections with 11px uppercase headings, two-column numeric fields (X/Y, L/H) with unit suffix "in".
- Inner margins: box-model editor — compact fields (label kept for screen readers) on the four sides of a miniature frame whose dashed inner edge previews the insets; the center link toggle (accent when on) makes one field set all four. Unit and "back to template" reset sit in the section header.
- Color swatches: 12 theme slots, each with 6 tints/shades row; tokens shown by name on hover/aria-label.
- Selection: 1.5px accent outline, 8 square handles (white fill, accent stroke), constant screen size; snapping guides in magenta `#ff3dbb`.
- Placeholder ghosts: dashed 1px `--fg-muted` outlines labeled with the placeholder key.

## Motion

120–180ms ease-out for hover/press and panel state; no entrance choreography.
