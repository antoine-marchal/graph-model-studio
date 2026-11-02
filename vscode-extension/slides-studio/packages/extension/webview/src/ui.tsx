import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { paletteTokens, round4, tr } from '@corporate-slides/core';
import { PPI } from '@corporate-slides/renderer';
import { Icon, type IconName } from './icons';
import { useEditor } from './store';

/* Shared controls (buttons, menus, fields, palette) used by the panels, ribbon, format and table editors. */

export function IconButton({ icon, label, onClick, active, disabled, primary, children, testId }: { icon: IconName; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; primary?: boolean; children?: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      className={`ibtn${active ? ' is-active' : ''}${primary ? ' is-primary' : ''}${children ? ' has-label' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

/**
 * Popup menu rendered in a body portal with fixed positioning, so scrolling/clipping containers
 * (the ribbon scrolls horizontally) never cut it. Flips to right-aligned when it would overflow.
 */
export function Menu({ trigger, children, testId }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => ref.current?.contains(t as Node) || menu.current?.contains(t as Node);
    const h = (e: PointerEvent) => !inside(e.target) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const s = (e: Event) => !inside(e.target) && setOpen(false);
    const r = () => setOpen(false);
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    window.addEventListener('scroll', s, true);
    window.addEventListener('resize', r);
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', k);
      window.removeEventListener('scroll', s, true);
      window.removeEventListener('resize', r);
    };
  }, [open]);
  useLayoutEffect(() => {
    const a = ref.current?.getBoundingClientRect(), m = menu.current;
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
          <div className="menu" role="menu" data-testid={testId} ref={menu}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Numeric field that commits on Enter/blur, with −/+ buttons and arrow-key stepping. */
export function NumField({ label, value, onCommit, step = 0.05, unit, testId, disabled, className }: { label: string; value: number | undefined; onCommit: (v: number) => void; step?: number; unit?: string; testId?: string; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(round4(value)));
  useEffect(() => setText(value === undefined ? '' : String(round4(value))), [value]);
  const parsed = Number(text.replace(',', '.'));
  const commit = () => {
    if (text.trim() && Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    else setText(value === undefined ? '' : String(round4(value)));
  };
  const bump = (dir: 1 | -1, big = false) => {
    const v = round4((Number.isFinite(parsed) ? parsed : (value ?? 0)) + dir * (big ? step * 10 : step));
    setText(String(v));
    onCommit(v);
  };
  return (
    <label className={`numfield${className ? ` ${className}` : ''}`}>
      <span className="numfield-label">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
      {unit && <span className="numfield-unit">{unit}</span>}
      {!disabled && (
        <span className="numfield-steps">
          {([-1, 1] as const).map((d) => (
            <button key={d} type="button" tabIndex={-1} aria-label={d < 0 ? tr('Diminuer', 'Decrease') : tr('Augmenter', 'Increase')} data-testid={testId && `${testId}-${d < 0 ? 'dec' : 'inc'}`} onMouseDown={(e) => e.preventDefault()} onClick={(e) => (e.preventDefault(), bump(d, e.shiftKey))}>
              {d < 0 ? '−' : '+'}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Identifier shown in an inspector head; double-click to rename (Enter / blur commits, Escape cancels). */
export function EditableId({ value, onRename, title, testId }: { value: string; onRename?: (id: string) => void; title?: string; testId?: string }) {
  const [text, setText] = useState<string | null>(null);
  if (text === null || !onRename)
    return (
      <code className="insp-id" title={onRename ? `${title ?? ''}${title ? ' · ' : ''}${tr('double-clic pour renommer', 'double-click to rename')}` : title} data-testid={testId} onDoubleClick={() => onRename && setText(value)}>
        {value}
      </code>
    );
  const ok = ID_RE.test(text);
  const commit = () => {
    setText(null);
    if (ok && text !== value) onRename(text);
  };
  return (
    <input
      className={`input insp-id-input${ok ? '' : ' is-invalid'}`}
      value={text}
      autoFocus
      spellCheck={false}
      data-testid={testId && `${testId}-input`}
      title={ok ? undefined : tr('Lettres, chiffres, _ et - (64 max)', 'Letters, digits, _ and - (64 max)')}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value.replace(/\s/g, '-'))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setText(null);
      }}
    />
  );
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

/** Scales a full-size slide render into a fixed-width thumbnail. */
export function Thumb({ width, children }: { width: number; children: ReactNode }) {
  const master = useEditor((s) => s.master);
  const W = (master?.dimensions.width ?? 13.33) * PPI;
  const H = (master?.dimensions.height ?? 7.5) * PPI;
  const k = width / W;
  return (
    <div className="thumb" style={{ width, height: H * k }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: '0 0', width: W, height: H, pointerEvents: 'none' }}>{children}</div>
    </div>
  );
}

/** Corporate palette popup (theme tokens with tints/shades) plus a free color; shared by inspector and table toolbar. */
export function PaletteMenu({ trigger, value, onChange, allowNone, testId }: { trigger: (open: () => void) => ReactNode; value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  return (
    <Menu testId={testId} trigger={trigger}>
      {(close) => <PaletteGrid value={value} onChange={onChange} allowNone={allowNone} testId={testId} close={close} />}
    </Menu>
  );
}

/** The palette itself (chips, free color, default / none), embeddable in any popup. */
export function PaletteGrid({ value, onChange, allowNone, testId, close }: { value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string; close: () => void }) {
  const master = useEditor((s) => s.master)!;
  const tokens = paletteTokens(master);
  const base = tokens.filter((t) => t.token.split('.').length === 2);
  const custom = value && !value.startsWith('theme.') && value !== 'none' ? `#${value.replace('#', '')}` : '#000000';
  return (
        <div className="palette" onMouseDown={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
          <div className="palette-rows">
            {base.map((b) => {
              const slot = b.token.split('.')[1]!;
              const variants = tokens.filter((t) => t.token.startsWith(`theme.${slot}.`));
              return (
                <div key={b.token} className="palette-col">
                  {[b, ...variants].map((t) => (
                    <button
                      key={t.token}
                      type="button"
                      className={`palette-chip${t.token === value ? ' is-selected' : ''}`}
                      style={{ background: `#${t.hex}` }}
                      title={`${t.token} (#${t.hex})`}
                      aria-label={t.token}
                      data-token={t.token}
                      onClick={() => {
                        onChange(t.token);
                        close();
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="palette-actions">
            <label className="menu-item palette-custom" title={tr('Couleur hors charte : signalée par la validation', 'Off-brand color: flagged by validation')}>
              {/* Native `change` (picker closed), not React's per-drag `input`: one mutation per choice. */}
              <input type="color" defaultValue={custom} ref={(n) => void (n && (n.onchange = () => (onChange(n.value.toUpperCase()), close())))} data-testid={testId ? `${testId}-custom` : undefined} />
              {tr('Autre couleur…', 'More colors…')}
            </label>
            <button type="button" className="menu-item" onClick={() => (onChange(null), close())}>{tr('Valeur par défaut', 'Default')}</button>
            {allowNone && <button type="button" className="menu-item" onClick={() => (onChange('none'), close())}>{tr('Aucune', 'None')}</button>}
          </div>
        </div>
  );
}

export function ColorPicker({ label, value, onChange, allowNone, testId }: { label: string; value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean; testId?: string }) {
  const master = useEditor((s) => s.master)!;
  const current = value ? paletteTokens(master).find((t) => t.token === value) : undefined;
  const hexValue = current?.hex ?? (value && !value.startsWith('theme.') && value !== 'none' ? value.replace('#', '') : undefined);
  return (
    <PaletteMenu
      testId={testId ? `${testId}-menu` : undefined}
      value={value}
      onChange={onChange}
      allowNone={allowNone}
      trigger={(open) => (
        <button type="button" className="color-field" onClick={open} data-testid={testId} aria-label={`${label} : ${value ?? tr('par défaut', 'default')}`}>
          <span className="swatch" style={{ background: value === 'none' ? 'transparent' : hexValue ? `#${hexValue}` : 'transparent' }} data-none={value === 'none' || !hexValue} />
          <span className="color-label">{label}</span>
          <span className="color-token">{value ?? tr('défaut', 'default')}</span>
        </button>
      )}
    />
  );
}
