import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { ChevronDown, ChevronRight, FileOutput, ImageDown, Maximize2, PanelRight, Save, X } from "lucide-react";
import { gmcEmbedDirective, gmcViewNames, setFenceOption } from "../conversion-utils";
import { fenceMetaAttribute } from "./CodeBlockView";
import { vscodeApi } from "../vscode-api";
import { setImageOverride } from "./ImageView";

/**
 * ```gmc / ```graphmodel fences rendered as Graph Model Studio diagrams.
 *
 * Rendering reuses the Graph Model Studio Markdown-preview runtime (built
 * into dist/markdown-preview): it turns every `.gmc-markdown-diagram`
 * figure in the document into a PNG. The host sends its webview URI in the
 * init message. Fence attributes (id=, view=, theme=, width=, height=) live in
 * the code block's `meta` and round-trip with the markdown.
 */

const GMC_LANGS = ["gmc", "graphmodel"];

export const GMC_STARTER = `model {
  user = person "User"
  app = softwareSystem "Application"
  user -> app "Uses"
}

views {
  view context {
    include *
    autolayout lr
  }
}`;

let runtimeUri = "";
const graphEditor = { js: "", css: "", version: "" };
/** For hosts without the editor's init message (the diff panel). */
export function setGmcRuntimeUri(uri: string): void {
  runtimeUri = uri;
}

window.addEventListener("message", (e) => {
  if (e.data?.type === "init" && typeof e.data.gmcRuntimeUri === "string") {
    runtimeUri = e.data.gmcRuntimeUri;
    graphEditor.js = e.data.gmcEditorUri ?? "";
    graphEditor.css = e.data.gmcEditorCssUri ?? "";
    graphEditor.version = e.data.gmcVersion ?? "";
  }
});

/**
 * The Graph Model Studio interactive editor (dist/webview) in a
 * full-window modal. It is a webview app, so it runs in an iframe whose
 * `acquireVsCodeApi` shim relays its messages here: `render` in, edits
 * (`sourceChanged`) straight into the GMC block, saves through the host.
 */
//
// VS Code's webview service worker only serves resources to the webview
// document itself (it looks the webview up from the requesting client's URL,
// and an `about:srcdoc` frame has none), so the frame cannot load files: the
// editor fetches the graph app's JS / CSS and inlines them. `<base>` keeps
// the app's relative asset URLs well-formed.
const FRAME_SHIM =
  "(function(){var s;var send=function(m){parent.postMessage({__gmcFrame:m},'*')};" +
  "window.acquireVsCodeApi=function(){return{postMessage:send,getState:function(){return s},setState:function(v){s=v}}};" +
  "window.addEventListener('error',function(e){send({type:'frameError',message:String((e.error&&e.error.message)||e.message||'load error')})});" +
  "window.addEventListener('unhandledrejection',function(e){send({type:'frameError',message:String((e.reason&&e.reason.message)||e.reason)})});" +
  "document.addEventListener('securitypolicyviolation',function(e){send({type:'frameError',message:'Blocked by CSP: '+e.blockedURI+' ('+e.violatedDirective+')'})});" +
  "document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();send({type:'saveShortcut'})}},true);})();";

let graphEditorFiles: Promise<{ js: string; css: string }> | null = null;

function loadGraphEditorFiles(): Promise<{ js: string; css: string }> {
  if (!graphEditorFiles) {
    const text = (url: string) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${r.status} loading ${url.split("/").pop()}`);
        return r.text();
      });
    graphEditorFiles = Promise.all([text(graphEditor.js), text(graphEditor.css)]).then(([js, css]) => ({ js, css }));
    graphEditorFiles.catch(() => (graphEditorFiles = null));
  }
  return graphEditorFiles;
}

function ownNonce(): string {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[nonce]"));
  return (scripts.find((s) => /webview\.js/.test(s.src)) ?? scripts[0])?.nonce ?? "";
}

export function graphEditorSrcdoc(files: { js: string; css: string }, nonce: string, base: string): string {
  const css = files.css.replace(/<\/style/gi, "<\\/style");
  const js = files.js.replace(/<\/script/gi, "<\\/script");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">` +
    `<style>${css}</style><style>html,body,#root{height:100%;margin:0}</style>` +
    `<script nonce="${nonce}">${FRAME_SHIM}</script></head>` +
    `<body><div id="root"></div><script nonce="${nonce}" type="module">${js}</script></body></html>`
  );
}

interface GraphEditorModalProps {
  source: string;
  name: string;
  view?: string;
  theme: "light" | "dark";
  onChange(source: string): void;
  onClose(): void;
  onOpenBeside(): void;
  /** Editing a file (embed card): header Save button and Ctrl+S. */
  onSave?(): void;
  hint?: string;
}

export function GraphEditorModal({ source, name, view, theme, onChange, onClose, onOpenBeside, onSave, hint }: GraphEditorModalProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState("");
  useEffect(() => {
    if (!graphEditor.js) return;
    let live = true;
    loadGraphEditorFiles()
      .then((files) => {
        if (live) setSrcdoc(graphEditorSrcdoc(files, ownNonce(), graphEditor.js.replace(/[^/]*$/, "")));
      })
      .catch((err) => live && setFailure(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, []);
  const initial = useRef({ source, name, view, theme });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setFailure((f) => f || "The graph editor did not start."), 8000);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    const post = (m: unknown) => frameRef.current?.contentWindow?.postMessage(m, "*");
    const receive = (e: MessageEvent) => {
      if (e.data?.type === "gmcSaveResult") {
        post({ type: "saveResult", requestId: e.data.requestId, saved: e.data.saved, error: e.data.error });
        return;
      }
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const m = e.data?.__gmcFrame;
      if (!m) return;
      if (m.type === "frameError") {
        setFailure((f) => f || String(m.message));
      } else if (m.type === "ready") {
        setReady(true);
        setFailure("");
        post({
          type: "render",
          renderId: "modal",
          editable: true,
          version: graphEditor.version,
          ...initial.current,
          target: { uri: "markdown-studio", kind: "markdown" },
        });
      } else if (m.type === "sourceChanged" && typeof m.source === "string") {
        onChangeRef.current(m.source);
      } else if (m.type === "saveShortcut") {
        onSaveRef.current?.();
      } else if (m.type === "saveText" || m.type === "saveBinary") {
        vscodeApi.postMessage({ type: "gmcSave", kind: m.type, requestId: m.requestId, content: m.content, options: m.options });
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("message", receive);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  return createPortal(
    <div className="gmc-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmc-modal" role="dialog" aria-label={`Graph editor: ${name}`}>
        <div className="gmc-modal-header">
          <span className="gmc-block-label">GMC</span>
          <span className="gmc-modal-title">{name}</span>
          <span className="gmc-modal-hint">{hint ?? "Changes are written to the block as you edit"}</span>
          {onSave && (
            <button type="button" className="mermaid-block-toggle" onClick={onSave} title="Save the .gmc file and refresh the embed (Ctrl+S)">
              <Save size={12} />
              <span>save</span>
            </button>
          )}
          <button type="button" className="mermaid-block-toggle" onClick={onOpenBeside} title="Open the graph editor in a VS Code tab beside">
            <PanelRight size={12} />
            <span>beside</span>
          </button>
          <button type="button" className="mermaid-block-toggle" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        {failure && !ready && (
          <div className="gmc-modal-error">
            <span>Could not load the graph editor here: {failure}</span>
            <button type="button" className="mermaid-block-toggle" onClick={onOpenBeside}>
              <PanelRight size={12} />
              <span>open beside instead</span>
            </button>
          </div>
        )}
        {graphEditor.js ? (
          srcdoc ? (
            <iframe ref={frameRef} className="gmc-modal-frame" srcDoc={srcdoc} title="Graph Model Studio" />
          ) : (
            <div className="mermaid-block-loading gmc-modal-loading">Loading the graph editor…</div>
          )
        ) : (
          <div className="mermaid-block-error">The interactive graph editor is available in VS Code only.</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface GmcRuntime {
  scheduleRender(): void;
  renderPng(options: { source: string; view?: string; theme?: string; width?: number; height?: number }): Promise<string>;
}

// Host asks this webview to rasterize a `.gmc` image embed (refresh from the
// rich editor) so the graph panel never has to open; `src` is the PNG's
// webview URI, shown from memory until the rewritten file is reloaded.
window.addEventListener("message", (e) => {
  if (e.data?.type !== "gmcRenderPng") return;
  const { requestId, source, view, theme, width, height, src } = e.data;
  loadRuntime()
    .then((runtime) => runtime.renderPng({ source, view, theme, width, height }))
    .then(
      (dataUrl) => {
        if (typeof src === "string") setImageOverride(src, dataUrl);
        vscodeApi.postMessage({ type: "gmcRenderPngResult", requestId, dataUrl });
      },
      (err) => vscodeApi.postMessage({ type: "gmcRenderPngResult", requestId, error: err instanceof Error ? err.message : String(err) }),
    );
});
/** PNG data URL of a GMC model (export re-renders dark diagrams light). */
export function renderGmcPng(options: { source: string; view?: string; theme?: string; width?: number; height?: number }): Promise<string> {
  return loadRuntime().then((runtime) => runtime.renderPng(options));
}

let runtimePromise: Promise<GmcRuntime> | null = null;

function loadRuntime(): Promise<GmcRuntime> {
  const existing = (window as any).GraphModelStudioMarkdownPreview;
  if (existing?.scheduleRender) return Promise.resolve(existing);
  if (!runtimePromise) {
    runtimePromise = new Promise((resolve, reject) => {
      if (!runtimeUri) {
        reject(new Error("Diagram rendering is available in VS Code only."));
        return;
      }
      const script = document.createElement("script");
      script.src = runtimeUri;
      script.async = true;
      script.onload = () => resolve((window as any).GraphModelStudioMarkdownPreview);
      script.onerror = () => reject(new Error("Could not load the Graph Model Studio renderer."));
      document.head.append(script);
    });
    runtimePromise.catch(() => (runtimePromise = null));
  }
  return runtimePromise;
}

/** `id=a view="b c"` → { id: "a", view: "b c" } (same rules as the host). */
export function parseFenceOptions(meta: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const m of meta.matchAll(/([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*'|\S+)/g)) {
    values[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

export function detectTheme(): "light" | "dark" {
  const body = document.body;
  const theme = body.dataset.theme;
  if (theme) return theme.includes("dark") ? "dark" : "light";
  return body.classList.contains("vscode-light") ||
    body.classList.contains("vscode-high-contrast-light")
    ? "light"
    : "dark";
}

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Fence options as fields (like the embed card): id, view (the model's
 * views), theme, width, height. Unknown options in the meta are kept.
 */
export function GmcOptions({ meta, views, editable, onChange }: {
  meta: string;
  views: string[];
  editable: boolean;
  onChange(meta: string): void;
}) {
  const options = parseFenceOptions(meta);
  const set = (key: string, value: string) => onChange(setFenceOption(meta, key, value.trim() || null));
  const viewList = options.view && !views.includes(options.view) ? [...views, options.view] : views;
  const text = (key: string, placeholder: string, width: number) => (
    <label className="directive-param">
      {key}
      <input
        className="directive-file directive-param-input"
        style={{ minWidth: width }}
        value={options[key] ?? ""}
        placeholder={placeholder}
        spellCheck={false}
        readOnly={!editable}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  return (
    <>
      {text("id", "diagram", 70)}
      <label className="directive-param">
        view
        <select
          className="directive-param-select"
          value={options.view ?? ""}
          disabled={!editable}
          onChange={(e) => set("view", e.target.value)}
        >
          <option value="">default</option>
          {viewList.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="directive-param">
        theme
        <select
          className="directive-param-select"
          value={options.theme ?? ""}
          disabled={!editable}
          onChange={(e) => set("theme", e.target.value)}
        >
          <option value="">auto</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </label>
      {text("width", "auto", 44)}
      {text("height", "auto", 44)}
    </>
  );
}

function GmcBlockView({ node, editor, getPos, updateAttributes }: any) {
  const source = node.textContent as string;
  const meta = (node.attrs.meta as string) || "";
  const options = parseFenceOptions(meta);
  const previewRef = useRef<HTMLDivElement>(null);
  const [sourceOpen, setSourceOpen] = useState(!source.trim());
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const host = previewRef.current;
    if (!host || !source.trim()) return;
    const timer = setTimeout(() => {
      const figure = document.createElement("figure");
      figure.className = "gmc-markdown-diagram";
      figure.dataset.gmcSource = toBase64(source);
      figure.dataset.gmcId = options.id || "diagram";
      figure.dataset.gmcView = options.view || "";
      figure.dataset.gmcTheme =
        options.theme === "light" || options.theme === "dark" ? options.theme : detectTheme();
      figure.dataset.gmcWidth = options.width || "";
      figure.dataset.gmcHeight = options.height || "";
      figure.innerHTML = '<div class="gmc-markdown-loading">Rendering diagram…</div>';
      host.replaceChildren(figure);
      loadRuntime()
        .then((runtime) => {
          setError("");
          // A new render pass cancels the in-flight one, which leaves its
          // figure marked rendered but still loading — re-queue those.
          document
            .querySelectorAll<HTMLElement>('.gmc-markdown-diagram[data-gmc-rendered="true"]')
            .forEach((f) => {
              if (f.querySelector(".gmc-markdown-loading")) delete f.dataset.gmcRendered;
            });
          runtime.scheduleRender();
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 400);
    return () => clearTimeout(timer);
  }, [source, meta]);

  // Index among GMC fences in document order — matches the host's
  // scanGmcMarkdownBlocks so commands target the right fence.
  const blockIndex = (): number => {
    const pos = typeof getPos === "function" ? getPos() : -1;
    let index = 0;
    let found = -1;
    editor.state.doc.descendants((n: any, p: number) => {
      if (n.type.name !== "gmcBlock") return true;
      if (p === pos) found = index;
      index++;
      return false;
    });
    return found;
  };

  const closeModal = useCallback(() => setModalOpen(false), []);
  const replaceSource = (next: string) => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    const current = pos === undefined ? null : editor.state.doc.nodeAt(pos);
    if (pos === undefined || !current || current.type.name !== "gmcBlock" || current.textContent === next) return;
    const content = next ? editor.schema.text(next) : [];
    editor.view.dispatch(editor.state.tr.replaceWith(pos + 1, pos + current.nodeSize - 1, content));
  };

  // Move the source to a new .gmc file (host save dialog) and replace this
  // block with an embed directive for it, keeping view= / theme=.
  const extractToFile = () => {
    const requestId = `gmc-extract-${Date.now()}`;
    const receive = (e: MessageEvent) => {
      if (e.data?.type !== "gmcExtractResult" || e.data.requestId !== requestId) return;
      window.removeEventListener("message", receive);
      if (typeof e.data.file !== "string") return;
      const pos = typeof getPos === "function" ? getPos() : undefined;
      const current = pos === undefined ? null : editor.state.doc.nodeAt(pos);
      if (pos === undefined || !current || current.type.name !== "gmcBlock") return;
      const directive = editor.schema.nodes.directiveBlock.create({
        open: gmcEmbedDirective(e.data.file, options.view, options.theme),
        close: "",
      });
      editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + current.nodeSize, directive));
      // Let the edit reach the document, then have the toolkit render it.
      setTimeout(() => vscodeApi.postMessage({ type: "runCommand", command: "markdown-embed.update" }), 1200);
    };
    window.addEventListener("message", receive);
    vscodeApi.postMessage({ type: "gmcExtract", requestId, source, name: `${options.id || "diagram"}.gmc` });
  };

  const run = (command: string) => {
    const index = blockIndex();
    if (index >= 0) vscodeApi.postMessage({ type: "runCommand", command, blockIndex: index });
  };

  return (
    <NodeViewWrapper className="mermaid-block-wrapper gmc-block-wrapper">
      <div className="mermaid-block-toolbar gmc-block-toolbar" contentEditable={false}>
        <span className="gmc-block-label">GMC</span>
        <GmcOptions
          meta={meta}
          views={gmcViewNames(source)}
          editable={editor.isEditable}
          onChange={(next) => updateAttributes({ meta: next })}
        />
        <span className="directive-spacer" />
        {editor.isEditable && (
          <button
            type="button"
            className="mermaid-block-toggle"
            onClick={() => setModalOpen(true)}
            title="Open the interactive graph editor (changes sync back)"
          >
            <Maximize2 size={12} />
            <span>interactive</span>
          </button>
        )}
        {editor.isEditable && (
          <button
            type="button"
            className="mermaid-block-toggle"
            onClick={extractToFile}
            title="Move this diagram to a new .gmc file and embed it here (view and theme kept)"
          >
            <FileOutput size={12} />
            <span>to file</span>
          </button>
        )}
        <button
          type="button"
          className="mermaid-block-toggle"
          onClick={() => run("gmc.exportMarkdownDiagram")}
          title="Export this diagram as PNG"
        >
          <ImageDown size={12} />
          <span>png</span>
        </button>
        <button
          type="button"
          className="mermaid-block-toggle"
          onClick={() => setSourceOpen((v) => !v)}
          aria-expanded={sourceOpen}
          title={sourceOpen ? "Hide source" : "Show source"}
        >
          {sourceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>source</span>
        </button>
      </div>
      <pre className={`mermaid-block-source${sourceOpen ? "" : " collapsed"}`}>
        <NodeViewContent as="code" className={`language-${node.attrs.language}`} />
      </pre>
      <div className="mermaid-block-preview gmc-block-preview" contentEditable={false}>
        {!source.trim() ? (
          <div className="mermaid-block-empty">Enter a GMC model above</div>
        ) : error ? (
          <div className="mermaid-block-error">{error}</div>
        ) : null}
        <div ref={previewRef} className="gmc-block-rendered" hidden={!source.trim() || !!error} />
      </div>
      {modalOpen && (
        <GraphEditorModal
          source={source}
          name={options.id || "diagram"}
          view={options.view}
          theme={options.theme === "light" || options.theme === "dark" ? options.theme : detectTheme()}
          onChange={replaceSource}
          onClose={closeModal}
          onOpenBeside={() => {
            setModalOpen(false);
            run("gmc.openPreview");
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const GmcBlock = Node.create({
  name: "gmcBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  // Above CodeBlockLowlight (100) so gmc fences are claimed here.
  priority: 1000,

  addAttributes() {
    return {
      language: {
        default: "gmc",
        parseHTML: (el: HTMLElement) =>
          el.querySelector("code")?.className.match(/language-(gmc|graphmodel)\b/)?.[1] ?? "gmc",
        renderHTML: () => ({}),
      },
      meta: fenceMetaAttribute,
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (el: any) => {
          const code = el instanceof HTMLElement ? el.querySelector("code") : null;
          return code && GMC_LANGS.some((l) => code.classList.contains(`language-${l}`))
            ? null
            : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["pre", HTMLAttributes, ["code", { class: `language-${node.attrs.language}` }, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GmcBlockView);
  },
});
