/**
 * Inspector › Table design (`.paper`): fill, text color, bold and borders (color, style, width,
 * which edges) for the whole table or the selected cell range (Excel-style ranges in the table's
 * group, document/tableLook.ts). One change = one edit.
 */
import React, { useState } from "react";
import type { Editor } from "@tiptap/core";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { formatRange, type BorderEdges, type BorderStyle, type CellLook, type CellRange } from "../../document/tableLook";
import { parseBlockProps } from "../extensions/StudioNodes";
import { setBlockProps } from "./actions";
import { useEditorDerived } from "./hooks";
import { ColorPicker, NumField, Section, Seg, hexOf, tr } from "./ui";

interface Scope {
  range: CellRange;
  rows: number;
  cols: number;
  table: CellLook;
  cells: Record<string, CellLook>;
}

function scopeOf(editor: Editor): Scope | null {
  const sel = editor.state.selection;
  const $from = sel.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name !== "table") continue;
    const start = $from.start(d);
    const map = TableMap.get(node);
    let rect;
    if (sel instanceof CellSelection) rect = map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start);
    else {
      let cd = $from.depth;
      while (cd > d && !/cell/i.test(String($from.node(cd).type.spec.tableRole ?? ""))) cd--;
      if (cd === d) return null;
      rect = map.findCell($from.before(cd) - start);
    }
    const props = parseBlockProps(node.attrs.msBlock);
    return {
      range: { r1: rect.top, c1: rect.left, r2: rect.bottom - 1, c2: rect.right - 1 },
      rows: map.height,
      cols: map.width,
      table: props.table ?? {},
      cells: props.cells ?? {},
    };
  }
  return null;
}

/** Drop undefined keys; an empty look is no look. */
const clean = (look: CellLook): CellLook | undefined => {
  const out = Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined && v !== null && v !== "")) as CellLook;
  return Object.keys(out).length ? out : undefined;
};
const color = (v: string | null | undefined) => (!v ? undefined : v === "none" ? "none" : `#${hexOf(v) ?? v.replace("#", "")}`);

const STYLES: { id: BorderStyle; title: string }[] = [
  { id: "solid", title: tr("Plein", "Solid") },
  { id: "dashed", title: tr("Tirets", "Dashed") },
  { id: "dotted", title: tr("Pointillés", "Dotted") },
  { id: "double", title: tr("Double", "Double") },
  { id: "none", title: tr("Aucune bordure", "No border") },
];

/** The line itself as the choice (drawn, so it reads at a glance). */
function LineSample({ style }: { style: BorderStyle }) {
  const line = (y: number) => <line x1="2" x2="26" y1={y} y2={y} stroke="currentColor" strokeWidth="1.5" strokeDasharray={style === "dashed" ? "5 3" : style === "dotted" ? "1.5 2.5" : undefined} strokeLinecap={style === "dotted" ? "round" : "butt"} />;
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
      {style === "none" ? <><line x1="2" x2="26" y1="6" y2="6" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.45" /><line x1="9" x2="19" y1="1.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" /></> : style === "double" ? <>{line(4)}{line(8)}</> : line(6)}
    </svg>
  );
}

function LineStyles({ value, disabled, onChange }: { value?: BorderStyle; disabled: boolean; onChange: (v: BorderStyle) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={tr("Style de trait", "Line style")}>
      {STYLES.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`ibtn ms-line-sample${value === o.id ? " is-active" : ""}`} title={o.title} aria-label={o.title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(o.id)}>
          <LineSample style={o.id} />
        </button>
      ))}
    </div>
  );
}
const EDGES: { id: BorderEdges; label: string; title: string }[] = [
  { id: "all", label: tr("Toutes", "All"), title: tr("Toutes les bordures", "All borders") },
  { id: "outside", label: tr("Ext.", "Outside"), title: tr("Bordures extérieures", "Outside borders") },
  { id: "inside", label: tr("Int.", "Inside"), title: tr("Bordures intérieures", "Inside borders") },
  { id: "top", label: tr("Haut", "Top"), title: tr("Bordure supérieure", "Top border") },
  { id: "bottom", label: tr("Bas", "Bottom"), title: tr("Bordure inférieure", "Bottom border") },
];

export function TableLookSection({ editor, readonly, align }: { editor: Editor; readonly: boolean; align?: string }) {
  const scope = useEditorDerived(editor, scopeOf);
  const [target, setTarget] = useState<"table" | "cells">("cells");
  if (!scope) return null;
  const key = formatRange(scope.range);
  const whole = scope.range.r1 === 0 && scope.range.c1 === 0 && scope.range.r2 === scope.rows - 1 && scope.range.c2 === scope.cols - 1;
  const onTable = target === "table" || whole;
  const look: CellLook = onTable ? scope.table : scope.cells[key] ?? {};
  const write = (next: CellLook | undefined) => {
    if (onTable) return setBlockProps({ table: next });
    const cells = { ...scope.cells };
    if (next) cells[key] = next;
    else delete cells[key];
    setBlockProps({ cells: Object.keys(cells).length ? cells : undefined });
  };
  const set = (patch: Partial<CellLook>) => write(clean({ ...look, ...patch }));
  const header = () => {
    const cells = { ...scope.cells, [formatRange({ r1: 0, c1: 0, r2: 0, c2: scope.cols - 1 })]: { fill: "#1F4E79", color: "#FFFFFF", bold: true } };
    setBlockProps({ cells });
  };
  return (
    <Section title={tr("Tableau", "Table")}>
      <Seg label={tr("Position du tableau", "Table alignment")} value={align === "center" || align === "right" ? align : "left"} disabled={readonly} onChange={(v) => setBlockProps({ align: v === "left" ? undefined : v })}
        options={[{ id: "left", icon: "alignLeft", title: tr("Tableau à gauche", "Table on the left") }, { id: "center", icon: "alignCenter", title: tr("Tableau centré", "Centered table") }, { id: "right", icon: "alignRight", title: tr("Tableau à droite", "Table on the right") }]} />
      <div className="insp-sub">{tr("Cellules", "Cells")}</div>
      <Seg label={tr("Appliquer à", "Apply to")} value={onTable ? "table" : "cells"} disabled={readonly || whole} onChange={setTarget}
        options={[{ id: "table", label: tr("Tableau entier", "Whole table") }, { id: "cells", label: whole ? tr("Tableau entier", "Whole table") : tr(`Cellules ${key}`, `Cells ${key}`) }]} />
      <ColorPicker label={tr("Trame de fond", "Shading")} value={look.fill} allowNone onChange={(v) => set({ fill: color(v) })} testId="table-fill" />
      <ColorPicker label={tr("Couleur du texte", "Text color")} value={look.color} onChange={(v) => set({ color: color(v) })} testId="table-color" />
      <label className="check"><input type="checkbox" checked={!!look.bold} disabled={readonly} onChange={(e) => set({ bold: e.target.checked || undefined })} /> {tr("Gras", "Bold")}</label>
      <div className="insp-sub">{tr("Bordures", "Borders")}</div>
      <LineStyles value={look.borderStyle} disabled={readonly} onChange={(borderStyle) => set({ borderStyle })} />
      <ColorPicker label={tr("Couleur du trait", "Line color")} value={look.borderColor} onChange={(v) => set({ borderColor: color(v) })} testId="table-border-color" />
      <NumField label={tr("Épaisseur", "Width")} unit="pt" step={0.25} min={0.25} value={look.borderWidth} disabled={readonly} onCommit={(borderWidth) => set({ borderWidth })} />
      <Seg label={tr("Bordures concernées", "Which borders")} value={look.edges ?? (look.borderStyle || look.borderColor || look.borderWidth ? "all" : undefined)} disabled={readonly} onChange={(edges) => set({ edges })} options={EDGES} />
      <div className="insp-actions">
        <button type="button" className="btn" disabled={readonly} onClick={header}>{tr("Ligne d’en-tête", "Header row")}</button>
        <button type="button" className="btn" disabled={readonly || !clean(look)} onClick={() => write(undefined)}>{tr("Effacer", "Clear")}</button>
      </div>
    </Section>
  );
}
