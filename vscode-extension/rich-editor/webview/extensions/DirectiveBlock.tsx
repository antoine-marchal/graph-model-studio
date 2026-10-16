import React, { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileInput,
  Link2,
  ListTree,
  Lock,
  LockOpen,
  RefreshCw,
} from "lucide-react";
import { vscodeApi } from "../vscode-api";
import { parseDirective, setDirectiveAttr, type DirectiveKind as Kind } from "../conversion-utils";

/**
 * A toolkit directive and its generated content as one card:
 * `<!-- embed:file="…" -->` / `<!-- link:file="…" -->` / `<!-- embed:toc -->`
 * (the `open` attr), the content the toolkit wrote, and its end marker
 * (`close`, empty until first generated). Grouped by remarkGroupDirectives,
 * split back by rehypeUnwrapDirectives.
 */

const LABEL: Record<Kind, string> = { embed: "Embed", link: "Link", toc: "Table of contents" };
const ICON: Record<Kind, React.ReactNode> = {
  embed: <FileInput size={13} />,
  link: <Link2 size={13} />,
  toc: <ListTree size={13} />,
};

function DirectiveBlockView({ node, editor, updateAttributes }: any) {
  const open = node.attrs.open as string;
  const { kind, attrs } = parseDirective(open);
  const [collapsed, setCollapsed] = useState(false);
  const locked = attrs.lock === "true";
  const generated = !!node.attrs.close;
  const editable = editor.isEditable;
  const gmc = kind === "embed" && /\.(gmc|graphmodel)$/i.test(attrs.file ?? "");
  const extra = Object.entries(attrs).filter(
    ([k]) => k !== "file" && k !== "lock" && !(gmc && (k === "view" || k === "theme")),
  );
  // View names of the embedded .gmc (read by the host) for the dropdown.
  const [views, setViews] = useState<string[] | null>(null);
  useEffect(() => {
    if (!gmc || !attrs.file) return;
    const requestId = `gmc-views-${Math.random().toString(36).slice(2)}`;
    const receive = (e: MessageEvent) => {
      if (e.data?.type !== "gmcViewsResult" || e.data.requestId !== requestId) return;
      window.removeEventListener("message", receive);
      setViews(Array.isArray(e.data.views) ? e.data.views : []);
    };
    window.addEventListener("message", receive);
    vscodeApi.postMessage({ type: "gmcViews", requestId, file: attrs.file });
    return () => window.removeEventListener("message", receive);
  }, [gmc, attrs.file, node.attrs.close]);
  const viewOptions = views && attrs.view && !views.includes(attrs.view) ? [...views, attrs.view] : views;

  const setAttr = (name: string, value: string) =>
    updateAttributes({ open: setDirectiveAttr(open, name, value.trim() ? value.trim() : null) });

  const button = (title: string, icon: React.ReactNode, onClick: () => void, label?: string) => (
    <button type="button" className="directive-btn" title={title} aria-label={title} onClick={onClick}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );

  return (
    <NodeViewWrapper className={`directive-block directive-${kind}${locked ? " locked" : ""}`}>
      <div className="directive-header" contentEditable={false}>
        <span className="directive-kind">
          {ICON[kind]}
          {LABEL[kind]}
        </span>
        {kind !== "toc" && (
          <input
            className="directive-file"
            value={attrs.file ?? ""}
            placeholder="./path/to/file"
            spellCheck={false}
            aria-label="Source file"
            readOnly={!editable}
            onChange={(e) => updateAttributes({ open: setDirectiveAttr(open, "file", e.target.value) })}
          />
        )}
        {gmc && (
          <>
            <label className="directive-param">
              view
              {viewOptions && viewOptions.length > 0 ? (
                <select
                  className="directive-param-select"
                  value={attrs.view ?? ""}
                  disabled={!editable}
                  onChange={(e) => setAttr("view", e.target.value)}
                >
                  <option value="">default</option>
                  {viewOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="directive-file directive-param-input"
                  value={attrs.view ?? ""}
                  placeholder="default"
                  spellCheck={false}
                  readOnly={!editable}
                  onChange={(e) => setAttr("view", e.target.value)}
                />
              )}
            </label>
            <label className="directive-param">
              theme
              <select
                className="directive-param-select"
                value={attrs.theme ?? ""}
                disabled={!editable}
                onChange={(e) => setAttr("theme", e.target.value)}
              >
                <option value="">auto</option>
                <option value="light">light</option>
                <option value="dark">dark</option>
              </select>
            </label>
          </>
        )}
        {extra.map(([k, v]) => (
          <span key={k} className="directive-chip" title={`${k}="${v}"`}>
            {k}={v}
          </span>
        ))}
        <span className="directive-spacer" />
        {kind !== "toc" && attrs.file &&
          button("Open source file", <ExternalLink size={12} />, () =>
            vscodeApi.postMessage({ type: "openLink", href: attrs.file }),
          )}
        {editable &&
          button(
            locked ? "Locked — content is kept as is. Click to unlock." : "Lock (stop regenerating this content)",
            locked ? <Lock size={12} /> : <LockOpen size={12} />,
            () => updateAttributes({ open: setDirectiveAttr(open, "lock", locked ? null : "true") }),
          )}
        {editable && !locked &&
          button("Regenerate embeds and tables of contents", <RefreshCw size={12} />, () =>
            vscodeApi.postMessage({ type: "runCommand", command: "markdown-embed.update" }),
            "refresh",
          )}
        {button(
          collapsed ? "Show content" : "Hide content",
          collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />,
          () => setCollapsed((c) => !c),
        )}
      </div>
      {!generated && (
        <div className="directive-empty" contentEditable={false}>
          Not generated yet — save or refresh to fill it in.
        </div>
      )}
      <NodeViewContent className={`directive-content${collapsed ? " collapsed" : ""}`} />
    </NodeViewWrapper>
  );
}

export const DirectiveBlock = Node.create({
  name: "directiveBlock",
  group: "block",
  content: "block*",
  defining: true,
  isolating: true,
  draggable: true,
  priority: 1000,

  addAttributes() {
    return {
      open: {
        default: "<!-- embed:toc -->",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-open") ?? "",
        renderHTML: (a: any) => ({ "data-open": a.open }),
      },
      close: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-close") ?? "",
        renderHTML: (a: any) => ({ "data-close": a.close }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="directive"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "directive" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DirectiveBlockView);
  },
});
