import React from "react";
import {
  DEFAULT_SETTINGS,
  LAYOUT_LIMITS,
  THEMES,
  THEME_LABELS,
  type BetterMarkdownSettings,
  type ThemeName,
} from "../settings";

interface SettingsPanelProps {
  visible: boolean;
  settings: BetterMarkdownSettings;
  onChange: (next: BetterMarkdownSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({
  visible,
  settings,
  onChange,
  onClose,
}: SettingsPanelProps) {
  if (!visible) return null;

  const set = <K extends keyof BetterMarkdownSettings>(
    key: K,
    value: BetterMarkdownSettings[K],
  ) => onChange({ ...settings, [key]: value });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Markdown Settings</h2>
          <button
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="settings-body">
          <section>
            <h3>Appearance</h3>

            <Row label="Theme">
              <select
                className="settings-input"
                value={settings.theme}
                onChange={(e) => set("theme", e.target.value as ThemeName)}
              >
                {THEMES.map((name) => (
                  <option key={name} value={name}>
                    {THEME_LABELS[name]}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Custom CSS file">
              <input
                type="text"
                className="settings-input"
                value={settings.customCss}
                placeholder="~/markdown-studio.css"
                onChange={(e) => set("customCss", e.target.value)}
              />
            </Row>
            <div className="settings-hint">
              Absolute, <code>~/...</code>, or workspace-relative path. Applied
              on top of the theme and reloaded on save. Target{" "}
              <code>body[data-theme="github-dark"]</code> to style one theme
              only, or <code>body:not([data-theme])</code> for Default.
            </div>
          </section>

          <section>
            <h3>Layout</h3>

            <Row label={`Text width (${settings.contentWidth}px)`}>
              <input
                type="range"
                className="settings-range"
                min={LAYOUT_LIMITS.contentWidth.min}
                max={LAYOUT_LIMITS.contentWidth.max}
                step={LAYOUT_LIMITS.contentWidth.step}
                value={settings.contentWidth}
                onChange={(e) => set("contentWidth", Number(e.target.value))}
              />
            </Row>

            <Row label={`Font size (${settings.fontSize}px)`}>
              <input
                type="range"
                className="settings-range"
                min={LAYOUT_LIMITS.fontSize.min}
                max={LAYOUT_LIMITS.fontSize.max}
                step={LAYOUT_LIMITS.fontSize.step}
                value={settings.fontSize}
                onChange={(e) => set("fontSize", Number(e.target.value))}
              />
            </Row>

            <Row label={`Line height (${settings.lineHeight.toFixed(2)})`}>
              <input
                type="range"
                className="settings-range"
                min={LAYOUT_LIMITS.lineHeight.min}
                max={LAYOUT_LIMITS.lineHeight.max}
                step={LAYOUT_LIMITS.lineHeight.step}
                value={settings.lineHeight}
                onChange={(e) => set("lineHeight", Number(Number(e.target.value).toFixed(2)))}
              />
            </Row>

            <Row label="Font family">
              <input
                type="text"
                className="settings-input"
                value={settings.fontFamily}
                placeholder="(theme font) e.g. Inter, Georgia, serif"
                onChange={(e) => set("fontFamily", e.target.value)}
              />
            </Row>

            <Row label="Outline">
              <Segmented
                value={settings.outlineStyle}
                options={[
                  { value: "rail", label: "Rail" },
                  { value: "panel", label: "Panel" },
                  { value: "off", label: "Off" },
                ]}
                onChange={(v) => set("outlineStyle", v as "rail" | "panel" | "off")}
              />
            </Row>

            <Row label="Table cells (vertical)">
              <Segmented
                value={settings.tableVerticalAlign}
                options={[
                  { value: "top", label: "Top" },
                  { value: "middle", label: "Middle" },
                  { value: "bottom", label: "Bottom" },
                ]}
                onChange={(v) => set("tableVerticalAlign", v as "top" | "middle" | "bottom")}
              />
            </Row>

            <Toggle
              label="Line numbers"
              description="Markdown source line of each block, in the left margin."
              checked={settings.lineNumbers}
              onChange={(v) => set("lineNumbers", v)}
            />
            <Toggle
              label="Indent heading sections"
              description="Indent each heading and its content by its depth in the heading hierarchy (display only)."
              checked={settings.indentHeadings}
              onChange={(v) => set("indentHeadings", v)}
            />
            <div className="settings-hint">
              Zen mode: <code>Ctrl+.</code> (<code>⌘.</code>) or the Zen button; Esc leaves.
            </div>
          </section>

          <section>
            <h3>Table of contents</h3>

            <Toggle
              label="Heading above tables of contents"
              description="Generated TOCs start with a heading. Per block: the TOC card's heading checkbox."
              checked={settings.tocHeading}
              onChange={(v) => set("tocHeading", v)}
            />
            <Row label="Heading text">
              <input
                type="text"
                className="settings-input"
                value={settings.tocHeadingText}
                placeholder="Table of content"
                disabled={!settings.tocHeading}
                onChange={(e) => set("tocHeadingText", e.target.value)}
              />
            </Row>
            <div className="settings-hint">
              Applied when tables of contents are regenerated (refresh or save).
            </div>
          </section>

          <section>
            <h3>Export (HTML / PDF / PNG)</h3>

            <Row label="Colors">
              <Segmented
                value={settings.exportTheme}
                options={[
                  { value: "light", label: "Light, no background" },
                  { value: "editor", label: "As in the editor" },
                ]}
                onChange={(v) => set("exportTheme", v as "light" | "editor")}
              />
            </Row>
          </section>

          <section>
            <h3>Assets</h3>

            <Row label="Folder for assets">
              <input
                type="text"
                className="settings-input"
                value={settings.assetsFolder}
                placeholder="(next to the document) e.g. assets"
                onChange={(e) => set("assetsFolder", e.target.value)}
              />
            </Row>
            <div className="settings-hint">
              Where new .gmc files (GMC block "to file") and pasted or dropped images are saved: relative to the document, <code>{"${workspaceFolder}/…"}</code>, or absolute.
            </div>
          </section>

          <section>
            <h3>Saving</h3>

            <Toggle
              label="Auto-save on modify"
              description="Save the file automatically a moment after every change in the rich editor."
              checked={settings.saveOnEdit}
              onChange={(v) => set("saveOnEdit", v)}
            />
          </section>

          <section>
            <h3>Serialization</h3>

            <Row label="Bullet marker">
              <Segmented
                value={settings.bullet}
                options={[
                  { value: "-", label: "- dash" },
                  { value: "*", label: "* star" },
                  { value: "+", label: "+ plus" },
                ]}
                onChange={(v) => set("bullet", v as "-" | "*" | "+")}
              />
            </Row>

            <Row label="Italic marker">
              <Segmented
                value={settings.emphasis}
                options={[
                  { value: "_", label: "_italic_" },
                  { value: "*", label: "*italic*" },
                ]}
                onChange={(v) => set("emphasis", v as "_" | "*")}
              />
            </Row>

            <Row label="Bold marker">
              <Segmented
                value={settings.strong}
                options={[
                  { value: "**", label: "**bold**" },
                  { value: "__", label: "__bold__" },
                ]}
                onChange={(v) => set("strong", v as "**" | "__")}
              />
            </Row>

            <Row label="Horizontal rule">
              <Segmented
                value={settings.rule}
                options={[
                  { value: "-", label: "---" },
                  { value: "*", label: "***" },
                  { value: "_", label: "___" },
                ]}
                onChange={(v) => set("rule", v as "-" | "*" | "_")}
              />
            </Row>

            <Row label="List indent">
              <Segmented
                value={settings.listItemIndent}
                options={[
                  { value: "one", label: "1 space" },
                  { value: "tab", label: "tab" },
                  { value: "mixed", label: "mixed" },
                ]}
                onChange={(v) =>
                  set("listItemIndent", v as "one" | "tab" | "mixed")
                }
              />
            </Row>
          </section>

          <section>
            <h3>Shortcuts</h3>

            <Row label="Open bubble menu (expands to word at cursor)">
              <input
                type="text"
                className="settings-input"
                value={settings.bubbleMenuShortcut}
                placeholder="Mod+/"
                onChange={(e) =>
                  set("bubbleMenuShortcut", e.target.value)
                }
              />
            </Row>
            <div className="settings-hint">
              Format: modifiers joined with <code>+</code>. <code>Mod</code>{" "}
              = ⌘ on macOS, Ctrl elsewhere. Examples: <code>Mod+/</code>,{" "}
              <code>Ctrl+Shift+B</code>, <code>Alt+P</code>. Leave blank to
              disable.
            </div>
          </section>

          <section>
            <h3>Code blocks</h3>

            <Row label="Default language label">
              <input
                type="text"
                className="settings-input"
                value={settings.defaultCodeBlockLang}
                placeholder="(leave empty for bare ```)"
                onChange={(e) => set("defaultCodeBlockLang", e.target.value)}
              />
            </Row>
          </section>

          <section>
            <h3>Diff view</h3>

            <Row label="Default mode">
              <Segmented
                value={settings.diffMode}
                options={[
                  { value: "source", label: "Source" },
                  { value: "rendered", label: "Rendered" },
                ]}
                onChange={(v) => set("diffMode", v as "source" | "rendered")}
              />
            </Row>

            <Row label="Source layout">
              <Segmented
                value={settings.diffLayout}
                options={[
                  { value: "unified", label: "Unified" },
                  { value: "side-by-side", label: "Side-by-side" },
                ]}
                onChange={(v) =>
                  set("diffLayout", v as "unified" | "side-by-side")
                }
              />
            </Row>
          </section>

          <section>
            <h3>Normalization (toggle to disable)</h3>

            <Toggle
              label="Compact lists (remove blank lines between items)"
              checked={settings.compactLists}
              onChange={(v) => set("compactLists", v)}
            />
            <Toggle
              label="Unescape \~, \*, \_, \[ added by remark-stringify"
              checked={settings.unescapeSpecialChars}
              onChange={(v) => set("unescapeSpecialChars", v)}
            />
            <Toggle
              label="Renumber ordered lists (1. 2. 3. …)"
              checked={settings.renumberOrderedLists}
              onChange={(v) => set("renumberOrderedLists", v)}
            />
            <Toggle
              label="Rewrite shellscript → bash"
              checked={settings.shellscriptToBash}
              onChange={(v) => set("shellscriptToBash", v)}
            />
            <Toggle
              label="Rebuild table headers (from empty-header-row output)"
              checked={settings.fixTableHeaders}
              onChange={(v) => set("fixTableHeaders", v)}
            />
            <Toggle
              label="Dedupe image alt text line (![alt](x)\\nalt → ![alt](x))"
              checked={settings.dedupImageAltText}
              onChange={(v) => set("dedupImageAltText", v)}
            />
          </section>
        </div>

        <div className="settings-footer">
          <button
            className="settings-reset"
            onClick={() => onChange(DEFAULT_SETTINGS)}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={
            "settings-segment" + (opt.value === value ? " active" : "")
          }
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {description && (
          <span className="settings-toggle-description">{description}</span>
        )}
      </span>
    </label>
  );
}
