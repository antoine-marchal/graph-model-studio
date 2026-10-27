/** Ribbon galleries: shapes (Slides Studio's gallery), live style cards and the table size grid. */
import React, { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { resolveColor, resolveFont } from "../../document/styles";
import { shapeSvg } from "./ObjectView";
import { Icon } from "./icons";
import { Menu, keepFocus, tr } from "./ui";
import { useStudio } from "./store";
import { applyParagraphStyle, type NewObject } from "./actions";
import type { ShapeKind } from "../../document/schema";

const SHAPES: { kind: NewObject; label: string }[] = [
  { kind: "rect", label: tr("Rectangle", "Rectangle") },
  { kind: "roundRect", label: tr("Rectangle arrondi", "Rounded rectangle") },
  { kind: "ellipse", label: tr("Ellipse", "Ellipse") },
  { kind: "triangle", label: tr("Triangle", "Triangle") },
  { kind: "diamond", label: tr("Losange", "Diamond") },
  { kind: "rightArrow", label: tr("Flèche", "Arrow") },
  { kind: "chevron", label: tr("Chevron", "Chevron") },
  { kind: "line", label: tr("Ligne", "Line") },
];

function ShapeIcon({ kind }: { kind: NewObject }) {
  const theme = useStudio((s) => s.sections[0]?.sheet.theme);
  if (!theme) return null;
  const svg = shapeSvg({ type: "shape", shape: kind as ShapeKind, placement: "anchored", box: { x: 0, y: 0, width: 20, height: 14 }, style: { fill: null, lineWidth: 1.1 } }, 20, 14, theme);
  for (const el of svg.querySelectorAll("*")) (el.setAttribute("stroke", "currentColor"), el.setAttribute("fill", "none"), el.setAttribute("stroke-width", "1.5"));
  return <span aria-hidden ref={(el) => el?.replaceChildren(svg)} style={{ display: "inline-grid", color: "currentColor" }} />;
}

export function ShapeGallery({ onPick, trigger }: { onPick: (k: NewObject) => void; trigger: (open: () => void) => ReactNode }) {
  return (
    <Menu testId="shape-gallery" trigger={trigger}>
      {(close) => (
        <div className="shape-gallery">
          <h4>{tr("Formes de base", "Basic shapes")}</h4>
          <div className="shape-grid">
            {SHAPES.map((s) => (
              <button key={s.kind} type="button" className="shape-cell" title={s.label} aria-label={s.label} onMouseDown={keepFocus} onClick={() => (close(), onPick(s.kind))}>
                <ShapeIcon kind={s.kind} />
              </button>
            ))}
          </div>
          <h4>{tr("Texte", "Text")}</h4>
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), onPick("textbox"))}>
            <Icon name="text" /> {tr("Zone de texte", "Text box")}
          </button>
        </div>
      )}
    </Menu>
  );
}

/** Quick style cards (the document's own styles, drawn in their look) plus the full list. */
export function StyleGallery({ editor, current, disabled }: { editor: Editor; current: string; disabled?: boolean }) {
  const sheet = useStudio((s) => s.sections[0]?.sheet);
  if (!sheet) return null;
  const all = [...sheet.styles.values()].filter((s) => s.type === "paragraph");
  const quick = ["Normal", "Heading1", "Heading2", "Heading3", "Heading4", "Title", "Lead", "Quote"].filter((id) => sheet.styles.has(id));
  const card = (id: string, inMenu = false, close?: () => void) => {
    const s = sheet.styles.get(id)!;
    const color = resolveColor(s.run.color, sheet.theme);
    const look: React.CSSProperties = {
      fontFamily: resolveFont(s.run.font, sheet.theme),
      fontWeight: s.run.bold ? 700 : 400,
      fontStyle: s.run.italic ? "italic" : undefined,
      color: color ? `#${color}` : undefined,
      fontSize: Math.min(inMenu ? 17 : 15, Math.max(10, (s.run.size ?? 11) * (inMenu ? 0.8 : 0.72))),
    };
    return (
      <button key={id} type="button" role={inMenu ? "menuitem" : undefined} className={inMenu ? `menu-item ms-style-item${id === current ? " is-current" : ""}` : `ms-style-card${id === current ? " is-active" : ""}`} disabled={disabled} title={s.name} onMouseDown={keepFocus}
        onClick={() => (close?.(), editor.commands.focus(), applyParagraphStyle(id))}>
        <span className="ms-style-sample" style={look}>{inMenu ? s.name : "AaBbCc"}</span>
        {!inMenu && <span className="ms-style-name">{s.name}</span>}
      </button>
    );
  };
  return (
    <div className="ms-style-gallery">
      <div className="ms-style-cards">{quick.map((id) => card(id))}</div>
      <Menu testId="styles-menu" className="ms-styles-menu" trigger={(open) => (
        <button type="button" className="ms-style-more" aria-label={tr("Tous les styles", "All styles")} title={tr("Tous les styles", "All styles")} onMouseDown={keepFocus} onClick={open} disabled={disabled}>
          <Icon name="chevronDown" size={12} />
        </button>
      )}>
        {(close) => <>{all.map((s) => card(s.id, true, close))}</>}
      </Menu>
    </div>
  );
}

/** Word's table size grid: hover to size, click to insert. */
export function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ r: 2, c: 3 });
  return (
    <div className="ms-table-grid" onMouseDown={keepFocus}>
      <div className="ms-table-grid-label">{tr(`Tableau ${hover.c} × ${hover.r}`, `${hover.c} × ${hover.r} table`)}</div>
      <div className="ms-table-cells" role="grid" aria-label={tr("Taille du tableau", "Table size")}>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} role="row" className="ms-table-row">
            {Array.from({ length: 10 }, (_, c) => (
              <button key={c} type="button" role="gridcell" aria-label={`${c + 1} × ${r + 1}`} className={`ms-table-cell${r <= hover.r - 1 && c <= hover.c - 1 ? " is-on" : ""}`} onPointerEnter={() => setHover({ r: r + 1, c: c + 1 })} onFocus={() => setHover({ r: r + 1, c: c + 1 })} onClick={() => onPick(r + 1, c + 1)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
