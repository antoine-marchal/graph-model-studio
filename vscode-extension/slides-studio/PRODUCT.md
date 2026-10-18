# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (VS Code webview inside the VS Code desktop app)

## Stack

Imposed by the brief: TypeScript strict, VS Code Extension API, React + Vite webview, Tailwind CSS, Zustand, pnpm monorepo. No external fonts or CDNs (webview Content Security Policy).

## Users

Inferred from the brief: engineers, architects and consultants who write corporate presentations as code in VS Code (Markdown or YAML DSL), versioned in Git, and who must deliver decks that respect a corporate PowerPoint template. French-speaking; UI labels in French.

## Product Purpose

Corporate Slides Studio turns a corporate `.pptx/.potx` template into an enforceable design system, lets users author slides as source files, edit them visually on a WYSIWYG canvas that writes back to the source, and export native, editable PowerPoint files. Success: a deck that passes corporate validation and opens cleanly in PowerPoint, with the source file as the single durable truth.

## Positioning

One canonical document model behind both text and visual editing, with every visual change written back into readable, diffable source — not an HTML mock-up beside a separate exporter.

## Operating Context

Used inside VS Code next to the source editor, often side by side; frequent short edits (move a box, fix a title, recolor with a theme token), followed by export to `.pptx`. Templates are confidential corporate assets and stay on the machine.

## Capabilities and Constraints

- Canonical units are inches; slide canvas renders in CSS at 96 px/in.
- Colors are corporate theme tokens (`theme.accent1`, `theme.dk2.lighter40`…), fonts `theme.heading` / `theme.body`.
- Browser rendering is approximate; PowerPoint reference rendering is available on Windows when PowerPoint is installed.

## Brand Commitments

Only the slides carry the corporate brand (from the imported template). The editor chrome must not imitate or borrow the corporate identity.

## Evidence on Hand

Real template: `assets/corporate/original-template.pptx` (75 layouts). Example decks in `examples/corporate-demo/`.

## Product Principles

- Source is truth: never silently drop a visual edit.
- Corporate rules are visible while editing, not discovered at export.
- Precision tooling: numeric geometry, snapping, keyboard control.
- The slide is the hero; the chrome recedes.

## Accessibility & Inclusion

Keyboard operable controls, visible focus, WCAG AA contrast in both themes.
