import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Maximize2,
  RefreshCw,
} from "lucide-react";
import { vscodeApi } from "../vscode-api";
import { parseDirective, setDirectiveAttr, type DirectiveKind as Kind } from "../conversion-utils";
import { detectTheme } from "./GmcBlock";
import { GraphEditorModal } from "./GraphEditorModal";

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
    ([k]) => k !== "file" && k !== "lock" && !(gmc && (k === "view" || k === "theme")) && !(kind === "toc" && k === "heading" && attrs.heading === "false"),
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
  // Interactive graph editor on the embedded .gmc file: the host reads it,
  // saves (button / Ctrl+S / closing with changes) write it back and
  // regenerate the embeds, which re-renders the PNG.
  const [graph, setGraph] = useState<{ file: string; source: string } | null>(null);
  const latest = useRef<string | null>(null);
  const openGraph = () => {
    const file = attrs.file;
    const requestId = `gmc-read-${Math.random().toString(36).slice(2)}`;
    const receive = (e: MessageEvent) => {
      if (e.data?.type !== "gmcReadFileResult" || e.data.requestId !== requestId) return;
      window.removeEventListener("message", receive);
      if (typeof e.data.source !== "string") return;
      latest.current = null;
      setGraph({ file, source: e.data.source });
    };
    window.addEventListener("message", receive);
    vscodeApi.postMessage({ type: "gmcReadFile", requestId, file });
  };
  const saveGraph = useCallback(() => {
    if (!graph || latest.current === null) return;
    vscodeApi.postMessage({ type: "gmcWriteFile", file: graph.file, source: latest.current });
    latest.current = null;
  }, [graph]);
  const closeGraph = useCallback(() => {
    saveGraph();
    setGraph(null);
  }, [saveGraph]);

  // Same as Slides Studio: double-click the rendered diagram to edit the .gmc file interactively.
  // Native listener: the picture is its own node view, rendered through a React portal.
  const headerRef = useRef<HTMLDivElement>(null);
  const openGraphRef = useRef(openGraph);
  openGraphRef.current = openGraph;
  useEffect(() => {
    const block = headerRef.current?.closest(".directive-block");
    if (!gmc || !editable || !block) return;
    const onDoubleClick = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".directive-content") || !t.closest(".image-block, img")) return;
      e.preventDefault();
      openGraphRef.current();
    };
    block.addEventListener("dblclick", onDoubleClick);
    return () => block.removeEventListener("dblclick", onDoubleClick);
  }, [gmc, editable]);

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
      <div ref={headerRef} className="directive-header" contentEditable={false}>
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
        {kind === "toc" && (
          <label className="directive-param" title="Heading above the table of contents (text: Markdown settings → Table of contents)">
            <input
              type="checkbox"
              checked={!/^(false|no|off|0)$/i.test(attrs.heading ?? "")}
              disabled={!editable}
              onChange={(e) => updateAttributes({ open: setDirectiveAttr(open, "heading", e.target.checked ? null : "false") })}
            />
            heading
          </label>
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
        {gmc && editable &&
          button("Edit the .gmc file in the interactive graph editor", <Maximize2 size={12} />, openGraph, "interactive")}
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
      {graph && (
        <GraphEditorModal
          source={graph.source}
          name={graph.file.split("/").pop() ?? graph.file}
          view={attrs.view}
          theme={attrs.theme === "light" || attrs.theme === "dark" ? attrs.theme : detectTheme()}
          hint="Save (Ctrl+S) writes the file and refreshes the embed"
          onChange={(source) => (latest.current = source)}
          onSave={saveGraph}
          onClose={closeGraph}
          onOpenBeside={() => {
            closeGraph();
            vscodeApi.postMessage({ type: "openLink", href: graph.file });
          }}
        />
      )}
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
