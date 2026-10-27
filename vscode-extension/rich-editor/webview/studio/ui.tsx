/**
 * Studio primitives with Slides Studio's markup and classes (its stylesheet is built into the
 * editor CSS): ribbon buttons and groups, popup menus, numeric fields with steppers, inspector
 * sections, segmented controls, the theme palette. One look for both studios.
 */
import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tr } from "../../../slides-studio/packages/core/src/i18n";
import { paletteTokens, resolveColor } from "../../document/styles";
import { Icon, type IconName } from "./icons";
import { studio, useStudio } from "./store";

export { tr };

/** Ribbon / menu buttons never steal the caret from the document. */
export const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/* Units: geometry is stored in pt, shown in cm (French Word). */
export const ptToCm = (pt: number) => Math.round((pt * 2.54 * 100) / 72) / 100;
export const cmToPt = (cm: number) => Math.round(((cm * 72) / 2.54) * 100) / 100;

export function IconButton({ icon, label, onClick, active, disabled, primary, children, testId, className }: { icon: IconName; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; primary?: boolean; children?: ReactNode; testId?: string; className?: string }) {
  return (
    <button
      type="button"
      className={`ibtn${active ? " is-active" : ""}${primary ? " is-primary" : ""}${children ? " has-label" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      data-testid={testId}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

interface BtnProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  title?: string;
  caret?: boolean;
}

/** Large ribbon command: 20px icon over a (two-line max) label, caret glued to the last word. */
export function Big({ icon, label, onClick, active, disabled, testId, title, caret }: BtnProps) {
  return (
    <button type="button" className={`rb-big${active ? " is-active" : ""}`} onMouseDown={keepFocus} onClick={onClick} disabled={disabled} aria-pressed={active} aria-haspopup={caret ? "menu" : undefined} data-testid={testId} title={title ?? label}>
      <Icon name={icon} size={20} />
      <span>
        {label.replace(/\S+$/, "")}
        <span className="nowrap">
          {/\S+$/.exec(label)?.[0]}
          {caret && <Icon name="chevronDown" size={10} className="caret" />}
        </span>
      </span>
    </button>
  );
}

/** Small ribbon command: icon + optional inline label, stacked three per column. */
export function Small({ icon, label, onClick, active, disabled, testId, title, iconOnly, caret }: BtnProps & { iconOnly?: boolean }) {
  return (
    <button type="button" className={`rb-small${active ? " is-active" : ""}${iconOnly ? " icon-only" : ""}`} onMouseDown={keepFocus} onClick={onClick} disabled={disabled} aria-pressed={active} aria-haspopup={caret ? "menu" : undefined} aria-label={label} data-testid={testId} title={title ?? label}>
      <Icon name={icon} />
      {!iconOnly && <span>{label}</span>}
      {caret && <Icon name="chevronDown" size={10} className="caret" />}
    </button>
  );
}

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="rb-group" aria-label={label}>
      <div className="rb-group-body">{children}</div>
      <h3>{label}</h3>
    </section>
  );
}
export const Col = ({ children }: { children: ReactNode }) => <div className="rb-col">{children}</div>;
export const Row = ({ children }: { children: ReactNode }) => <div className="rb-row">{children}</div>;

/** Popup menu in a body portal (never clipped by the scrolling ribbon); flips when it would overflow. */
export function Menu({ trigger, children, testId, className }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; testId?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => ref.current?.contains(t as Node) || menu.current?.contains(t as Node);
    const h = (e: PointerEvent) => !inside(e.target) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const s = (e: Event) => !inside(e.target) && setOpen(false);
    const r = () => setOpen(false);
    window.addEventListener("pointerdown", h);
    window.addEventListener("keydown", k);
    window.addEventListener("scroll", s, true);
    window.addEventListener("resize", r);
    return () => {
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("keydown", k);
      window.removeEventListener("scroll", s, true);
      window.removeEventListener("resize", r);
    };
  }, [open]);
  useLayoutEffect(() => {
    const a = ref.current?.getBoundingClientRect();
    const m = menu.current;
    if (!open || !a || !m) return;
    const top = a.bottom + 6;
    m.style.top = `${top}px`;
    m.style.maxHeight = `${window.innerHeight - top - 8}px`;
    m.style.left = `${Math.max(8, a.left + m.offsetWidth > window.innerWidth - 8 ? a.right - m.offsetWidth : a.left)}px`;
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open &&
        createPortal(
          <div className={`menu${className ? ` ${className}` : ""}`} role="menu" data-testid={testId} ref={menu}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({ icon, label, onClick, close, current, kbd, disabled, testId }: { icon?: IconName; label: ReactNode; onClick: () => void; close: () => void; current?: boolean; kbd?: string; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" role="menuitem" className={`menu-item${current ? " is-current" : ""}`} disabled={disabled} data-testid={testId} onMouseDown={keepFocus} onClick={() => (close(), onClick())}>
      {icon && <Icon name={icon} />} {label}
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Numeric field that commits on Enter / blur, with −/+ buttons and arrow-key stepping. */
export function NumField({ label, value, onCommit, step = 0.1, unit, testId, disabled, className, min }: { label: string; value: number | undefined; onCommit: (v: number) => void; step?: number; unit?: string; testId?: string; disabled?: boolean; className?: string; min?: number }) {
  const [text, setText] = useState(value === undefined ? "" : String(round2(value)));
  useEffect(() => setText(value === undefined ? "" : String(round2(value))), [value]);
  const parsed = Number(text.replace(",", "."));
  const clamp = (v: number) => (min !== undefined ? Math.max(min, v) : v);
  const commit = () => {
    if (text.trim() && Number.isFinite(parsed) && parsed !== value) onCommit(clamp(parsed));
    else setText(value === undefined ? "" : String(round2(value)));
  };
  const bump = (dir: 1 | -1, big = false) => {
    const v = clamp(round2((Number.isFinite(parsed) ? parsed : value ?? 0) + dir * (big ? step * 10 : step)));
    setText(String(v));
    onCommit(v);
  };
  return (
    <label className={`numfield${className ? ` ${className}` : ""}`}>
      <span className="numfield-label">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        data-testid={testId}
        placeholder="—"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            bump(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          }
        }}
      />
      {unit && <span className="numfield-unit">{unit}</span>}
      {!disabled && (
        <span className="numfield-steps">
          {([-1, 1] as const).map((d) => (
            <button key={d} type="button" tabIndex={-1} aria-label={d < 0 ? tr("Diminuer", "Decrease") : tr("Augmenter", "Increase")} onMouseDown={(e) => e.preventDefault()} onClick={(e) => (e.preventDefault(), bump(d, e.shiftKey))}>
              {d < 0 ? "−" : "+"}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}

/** A length field shown in cm, stored in pt. */
export function CmField({ label, pt, onCommit, disabled, testId, min, className }: { label: string; pt: number | undefined; onCommit: (pt: number) => void; disabled?: boolean; testId?: string; min?: number; className?: string }) {
  return <NumField label={label} unit="cm" step={0.1} value={pt === undefined ? undefined : ptToCm(pt)} onCommit={(v) => onCommit(cmToPt(v))} disabled={disabled} testId={testId} min={min} className={className} />;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="insp-section">
      <header>
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Segmented single choice (radiogroup). */
export function Seg<T extends string>({ value, options, onChange, label, disabled }: { value: T | undefined; options: { id: T; label?: string; icon?: IconName; title?: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`ibtn${o.label && o.icon ? " has-label" : ""}${value === o.id ? " is-active" : ""}`} title={o.title ?? o.label} aria-label={o.title ?? o.label} disabled={disabled} onMouseDown={keepFocus} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Identifier in an inspector head; double-click renames (Enter / blur commits, Escape cancels). */
export function EditableId({ value, onRename, title }: { value: string; onRename?: (id: string) => void; title?: string }) {
  const [text, setText] = useState<string | null>(null);
  if (text === null || !onRename)
    return (
      <code className="insp-id" title={onRename ? `${title ?? ""}${title ? " · " : ""}${tr("double-clic pour renommer", "double-click to rename")}` : title} onDoubleClick={() => onRename && setText(value)}>
        {value}
      </code>
    );
  const ok = /^[A-Za-z][\w-]{0,63}$/.test(text);
  const commit = () => {
    setText(null);
    if (ok && text !== value) onRename(text);
  };
  return (
    <input
      className={`input insp-id-input${ok ? "" : " is-invalid"}`}
      value={text}
      autoFocus
      spellCheck={false}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value.replace(/\s/g, "-"))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setText(null);
      }}
    />
  );
}

/** Theme palette (base colors + tints / shades), a free color, default / none. */
export function PaletteGrid({ value, onChange, allowNone, close }: { value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean; close: () => void }) {
  const theme = useStudio((s) => s.sections[0]?.sheet.theme);
  if (!theme) return null;
  const tokens = paletteTokens(theme);
  const base = tokens.filter((t) => t.token.split(".").length === 2);
  const custom = value && !value.startsWith("theme.") && value !== "none" ? `#${value.replace("#", "")}` : "#000000";
  return (
    <div className="palette" onMouseDown={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
      <div className="palette-rows">
        {base.map((b) => {
          const slot = b.token.split(".")[1];
          return (
            <div key={b.token} className="palette-col">
              {tokens
                .filter((t) => t === b || t.token.startsWith(`theme.${slot}.`))
                .map((t) => (
                  <button key={t.token} type="button" className={`palette-chip${t.token === value ? " is-selected" : ""}`} style={{ background: `#${t.hex}` }} title={`${t.token} (#${t.hex})`} aria-label={t.token} onClick={() => (onChange(t.token), close())} />
                ))}
            </div>
          );
        })}
      </div>
      <div className="palette-actions">
        <label className="menu-item palette-custom" title={tr("Couleur hors thème", "Off-theme color")}>
          <input type="color" defaultValue={custom} ref={(n) => void (n && (n.onchange = () => (onChange(n.value.slice(1).toUpperCase()), close())))} />
          {tr("Autre couleur…", "More colors…")}
        </label>
        <button type="button" className="menu-item" onClick={() => (onChange(null), close())}>
          {tr("Automatique", "Automatic")}
        </button>
        {allowNone && (
          <button type="button" className="menu-item" onClick={() => (onChange("none"), close())}>
            {tr("Aucune", "None")}
          </button>
        )}
      </div>
    </div>
  );
}

export function PaletteMenu({ trigger, value, onChange, allowNone, testId }: { trigger: (open: () => void) => ReactNode; value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  return (
    <Menu testId={testId} trigger={trigger}>
      {(close) => <PaletteGrid value={value} onChange={onChange} allowNone={allowNone} close={close} />}
    </Menu>
  );
}

export function hexOf(value: string | null | undefined): string | undefined {
  const theme = studio.get().sections[0]?.sheet.theme;
  return theme ? resolveColor(value ?? undefined, theme) : undefined;
}

export function ColorPicker({ label, value, onChange, allowNone, testId }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  const hex = value === "none" || value === null ? undefined : hexOf(value);
  const shown = value === null || value === "none" ? tr("aucune", "none") : value ?? tr("automatique", "automatic");
  return (
    <PaletteMenu
      testId={testId ? `${testId}-menu` : undefined}
      value={value}
      onChange={onChange}
      allowNone={allowNone}
      trigger={(open) => (
        <button type="button" className="color-field" onClick={open} data-testid={testId} aria-label={`${label} : ${shown}`}>
          <span className="swatch" style={{ background: hex ? `#${hex}` : "transparent" }} data-none={!hex} />
          <span className="color-label">{label}</span>
          <span className="color-token">{shown}</span>
        </button>
      )}
    />
  );
}
