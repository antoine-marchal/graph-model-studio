import { useEffect } from "react";
import type { BetterMarkdownSettings } from "../settings";

const CUSTOM_CSS_ID = "markdown-studio-custom-css";

/**
 * Apply the selected theme and the user's custom stylesheet.
 *
 * Theme: sets `<body data-theme>` (absent for "default"); theme CSS
 * (webview/styles/themes/*) scopes its overrides to that attribute.
 * Declaring `--vscode-*` variables on body shadows the values VS Code
 * injects on `<html>`, so every existing `var(--vscode-*)` rule picks up
 * the theme for free.
 *
 * Custom CSS: the host posts `{ type: "customCss", css }` after init and
 * whenever the file or setting changes. Injected as the last `<style>` in
 * `<head>` so it wins ties against the bundled stylesheet and theme.
 */
export function useAppearance(settings: BetterMarkdownSettings): void {
  const { theme, contentWidth, fontSize, lineHeight, fontFamily, tableVerticalAlign } = settings;
  useEffect(() => {
    if (theme === "default") delete document.body.dataset.theme;
    else document.body.dataset.theme = theme;
  }, [theme]);

  // Reading column (nuza-style): editor.css reads these variables.
  useEffect(() => {
    const s = document.body.style;
    s.setProperty("--ms-content-width", `${contentWidth}px`);
    s.setProperty("--ms-font-size", `${fontSize}px`);
    s.setProperty("--ms-line-height", String(lineHeight));
    if (fontFamily.trim()) s.setProperty("--ms-font-family", fontFamily);
    else s.removeProperty("--ms-font-family");
    s.setProperty("--ms-table-valign", tableVerticalAlign);
  }, [contentWidth, fontSize, lineHeight, fontFamily, tableVerticalAlign]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "customCss") return;
      let style = document.getElementById(CUSTOM_CSS_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = CUSTOM_CSS_ID;
        document.head.appendChild(style);
      }
      style.textContent = e.data.css || "";
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
}
