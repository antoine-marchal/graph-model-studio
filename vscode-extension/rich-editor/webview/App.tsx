import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { SlashCommand } from "./extensions/SlashCommand";
import { ZenFocus } from "./extensions/ZenFocus";
import { DiffMarks } from "./extensions/DiffMarks";
import { OutlineRail } from "./components/OutlineRail";
import { LineNumbers } from "./components/LineNumbers";
import { ReviewBar, ReviewLayer, ReviewThreads } from "./components/ReviewThreads";
import { useReview } from "./hooks/useReview";
import { BlockHandle } from "./components/BlockHandle";
import { TableFilterMenu } from "./components/TableFilterMenu";
import { sliceToTsv, tsvToTableSlice } from "./extensions/TableFilter";
import { contentExtensions } from "./editorExtensions";
import "./exportSnapshot";
import { CellSelection } from "@tiptap/pm/tables";
import { StickyHeadings } from "./components/StickyHeadings";
import { TableOfContents } from "./components/TableOfContents";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { EditorBubbleMenu } from "./components/EditorBubbleMenu";
import { SetupPrompt, type SetupChoice } from "./components/SetupPrompt";
import { DiffView } from "./components/DiffView";
import { TableControls } from "./components/TableControls";
import { TableFillHandle } from "./components/TableFillHandle";
import { ImageInsertDialog } from "./components/ImageInsertDialog";
import { FrontmatterPanel } from "./components/FrontmatterPanel";
import { useSettingsPanel } from "./hooks/useSettingsPanel";
import { useAppearance } from "./hooks/useAppearance";
import { matchesBinding, selectWordAtCursor } from "./utils";
import { useEditorState } from "./hooks/useEditorState";
import { useClipboardHandlers } from "./hooks/useClipboardHandlers";
import { useDragDrop } from "./hooks/useDragDrop";
import { vscodeApi } from "./vscode-api";
import { HostHistory } from "./extensions/StudioNodes";
import { Pagination } from "./studio/pagination";
import { StudioIntegrity, bindActions } from "./studio/actions";
import { BlockFrame } from "./studio/blockFrame";
import { Shell, hostRedo, hostUndo } from "./studio/Shell";
import { PageLayer, Ruler, StyleSheetCss, setZoom, manualZoom } from "./studio/PageLayer";
import { openContextMenu } from "./studio/ContextMenu";
import { BlockHandles, LineNumberGutter } from "./studio/Gutter";
import { ObjectLayer } from "./studio/ObjectLayer";
import { PAPER, studio, useStudio } from "./studio/store";
import { ToolkitMenu } from "./components/ToolkitMenu";
import type { DocumentSync } from "./studio/documentSync";
import "./studio/bridge";

/** Room beside the page for the vertical ruler, line numbers and block handles (px, each side). */
const gutterWidth = () => {
  const s = studio.get();
  return 16 + (s.showRulers ? 24 : 0) + (s.showLineNumbers ? 32 : 0) + (s.showBlockHandles ? 8 : 0);
};

export function App() {
  const handleUpdateRef = useRef<() => void>(() => {});
  // The editor container is the scroller (sticky headings, outline, search and line numbers rely on it).
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = editorContainerRef;
  const syncRef = useRef<DocumentSync | null>(null);

  const {
    settings,
    settingsRef,
    settingsVisible,
    setSettingsVisible,
    updateSettings,
    applySettings,
  } = useSettingsPanel(handleUpdateRef);
  useAppearance(settings);

  const editor = useEditor({
    extensions: [
      ...contentExtensions({ history: false }),
      ZenFocus,
      SlashCommand,
      DiffMarks,
      ReviewThreads,
      HostHistory.configure({ onUndo: hostUndo, onRedo: hostRedo }),
      ...(PAPER ? [Pagination, BlockFrame] : []),
      StudioIntegrity,
    ],
    editorProps: {
      attributes: { class: "tiptap-editor" },
      // Excel-like ranges: a copied cell selection goes out as TSV (its
      // HTML keeps the table shape for pasting back here); TSV / multi-line
      // text pasted into a cell fills cells instead of one paragraph.
      clipboardTextSerializer: (slice, view) =>
        (view.state.selection instanceof CellSelection && sliceToTsv(slice)) ||
        slice.content.textBetween(0, slice.content.size, "\n\n"),
      clipboardTextParser: (text, $context, _plain, view) => {
        for (let d = $context.depth; d > 0; d--) {
          const role = $context.node(d).type.spec.tableRole;
          if (role === "cell" || role === "header_cell") {
            return tsvToTableSlice(view.state.schema, text) as any;
          }
        }
        return null as any;
      },
    },
  });

  const {
    status,
    readonly,
    searchVisible,
    setSearchVisible,
    diffVisible,
    setDiffVisible,
    diffData,
    imageDialogVisible,
    setImageDialogVisible,
    baseUri,
    docFolderPath,
    uploadImage,
    currentMarkdown,
    switchToSource,
    toggleDiff,
    frontmatter,
    setFrontmatter,
  } = useEditorState({ editor, settingsRef, handleUpdateRef, applySettings, syncRef });
  const review = useReview(editor);
  const pageView = useStudio((s) => s.pageView);
  const zoom = useStudio((s) => s.zoom);
  const layout = useStudio((s) => s.layout);
  const showRulers = useStudio((s) => s.showRulers);
  const showBlockHandles = useStudio((s) => s.showBlockHandles);
  const showLineNumbers = useStudio((s) => s.showLineNumbers);

  // Auto-scroll while dragging near the top/bottom edge, page view included (wheel events don't
  // fire during a native drag: blocks by their grip, pictures, selected text). dragover repeats
  // ~every 50ms even when still.
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;
    const EDGE = 80;
    const onDragOver = (e: DragEvent) => {
      const r = container.getBoundingClientRect();
      const up = e.clientY - r.top;
      const down = r.bottom - e.clientY;
      if (up < EDGE) container.scrollTop -= Math.ceil((EDGE - up) / 2);
      else if (down < EDGE) container.scrollTop += Math.ceil((EDGE - down) / 2);
    };
    container.addEventListener("dragover", onDragOver);
    return () => container.removeEventListener("dragover", onDragOver);
  }, [editor]);

  useEffect(() => {
    if (editor && syncRef.current) bindActions(editor, syncRef.current);
  }, [editor, syncRef.current]);

  useClipboardHandlers(editor, baseUri, docFolderPath, settingsRef, uploadImage);
  const { dragOver } = useDragDrop(editor, uploadImage, editorContainerRef);

  // Zen mode (after nuza): chrome hidden, every block but the current one
  // dimmed. Toggled by Ctrl/Cmd+. (VS Code keybinding → "toggleZen"
  // message), the toolbar button, or Escape to leave.
  const [zen, setZen] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("zen-mode", zen);
  }, [zen]);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "toggleZen") setZen((z) => !z);
    };
    window.addEventListener("message", handler);
    const diff = () => toggleDiff();
    const find = () => setSearchVisible(true);
    const source = () => switchToSource();
    const zenOn = () => setZen((z) => !z);
    window.addEventListener("ms:toggleDiff", diff);
    window.addEventListener("ms:find", find);
    window.addEventListener("ms:source", source);
    window.addEventListener("ms:zen", zenOn);
    return () => {
      window.removeEventListener("message", handler);
      window.removeEventListener("ms:toggleDiff", diff);
      window.removeEventListener("ms:find", find);
      window.removeEventListener("ms:source", source);
      window.removeEventListener("ms:zen", zenOn);
    };
  }, [toggleDiff, setSearchVisible, switchToSource]);

  // Keyboard shortcuts (spans settings + search concerns)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchVisible(true);
      } else if (e.key === "Escape") {
        setSettingsVisible(false);
        setZen(false);
      } else if (
        editor &&
        matchesBinding(e, settingsRef.current.bubbleMenuShortcut)
      ) {
        // Open bubble menu on a collapsed cursor by selecting the word
        // around the caret. If the selection is already non-empty the
        // menu is already anchored; swallow the event either way so the
        // binding doesn't fall through to VS Code (e.g. Mod+/ toggle
        // comment in the host).
        e.preventDefault();
        const selected = selectWordAtCursor(editor);
        if (selected || !editor.state.selection.empty) {
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("btrmk:focusBubbleMenu"));
          });
        } else {
          editor.commands.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSearchVisible, setSettingsVisible, editor, settingsRef]);

  // Host-driven settings open (e.g. first-run consent → "Review settings")
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "openSettings") setSettingsVisible(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setSettingsVisible]);

  // First-run setup prompt: host posts `showSetupPrompt`, we render the
  // modal and post the user's choice back so the host can apply settings.
  const [setupPromptVisible, setSetupPromptVisible] = useState(false);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "showSetupPrompt") setSetupPromptVisible(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Current page (caret / viewport), word count, fit width, scroll to page.
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const words = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ", " ");
        let title = "";
        editor.state.doc.forEach((n) => {
          if (!title && n.type.name === "heading") title = n.textContent;
        });
        studio.set({ words: (text.match(/\S+/g) ?? []).length, title: title || studio.get().fileName.replace(/\.(md|paper)$/i, "") });
      }, 400);
    };
    const page = () => {
      const l = studio.get().layout;
      if (!l) return;
      try {
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        const root = editor.view.dom.getBoundingClientRect();
        const y = (coords.top - root.top) / (studio.get().zoom || 1);
        const index = l.pages.findIndex((p) => y < p.top + p.height + 14);
        studio.set({ currentPage: Math.max(1, index + 1 || l.pages.length) });
      } catch {
        // Position not rendered yet.
      }
    };
    editor.on("update", words);
    editor.on("selectionUpdate", page);
    words();
    const fit = (e: Event) => {
      const l = studio.get().layout;
      const el = scrollRef.current;
      if (!l || !el) return;
      const page = l.pages[Math.max(0, studio.get().currentPage - 1)] ?? l.pages[0];
      const byWidth = (el.clientWidth - 2 * gutterWidth()) / l.width;
      setZoom((e as CustomEvent<string>).detail === "page" && page ? Math.min(byWidth, (el.clientHeight - 64) / page.height) : byWidth);
      if ((e as CustomEvent<string>).detail === "page" && page) requestAnimationFrame(() => el.scrollTo({ top: page.top * studio.get().zoom }));
    };
    const toPage = (e: Event) => {
      const l = studio.get().layout;
      const p = l?.pages[(e as CustomEvent<number>).detail];
      if (p && scrollRef.current) scrollRef.current.scrollTo({ top: p.top * (studio.get().zoom || 1), behavior: "smooth" });
    };
    window.addEventListener("ms:fit", fit);
    window.addEventListener("ms:scrollToPage", toPage);
    return () => {
      editor.off("update", words);
      editor.off("selectionUpdate", page);
      window.removeEventListener("ms:fit", fit);
      window.removeEventListener("ms:scrollToPage", toPage);
    };
  }, [editor]);

  // Narrow panels: fit the page width until the user picks a zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fitIfNeeded = () => {
      const l = studio.get().layout;
      if (!l || manualZoom) return;
      const fit = Math.min(1, (el.clientWidth - 2 * gutterWidth()) / l.width);
      if (Math.abs(fit - studio.get().zoom) > 0.01) setZoom(fit);
    };
    const ro = new ResizeObserver(fitIfNeeded);
    ro.observe(el);
    fitIfNeeded();
    return () => ro.disconnect();
  }, [layout?.width, showRulers, showLineNumbers, showBlockHandles]);

  // Ctrl+wheel zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !PAPER) return;
      e.preventDefault();
      setZoom(studio.get().zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), true);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const handleSetupChoice = (choice: SetupChoice) => {
    setSetupPromptVisible(false);
    if (choice === "review") setSettingsVisible(true);
    vscodeApi.postMessage({ type: "setupPromptChoice", choice });
  };

  const dismissSetupPrompt = () => {
    setSetupPromptVisible(false);
    vscodeApi.postMessage({ type: "setupPromptChoice", choice: "keep" });
  };

  if (!editor) return null;
  const paged = pageView && !diffVisible;

  const searchBar = (
    <SearchBar
      visible={searchVisible}
      onClose={(activeRange) => {
        setSearchVisible(false);
        if (activeRange && editor) {
          try {
            const pos = editor.view.posAtDOM(activeRange.startContainer, activeRange.startOffset);
            editor.commands.focus();
            editor.commands.setTextSelection(pos);
          } catch {
            editor.commands.focus();
          }
        }
      }}
    />
  );
  const diffView = diffVisible && diffData && (
    <DiffView
      oldContent={diffData.headContent}
      newContent={currentMarkdown}
      fileName={diffData.fileName}
      baseUri={baseUri.current}
      layout={settings.diffLayout}
      mode={settings.diffMode}
      onClose={() => setDiffVisible(false)}
      onLayoutChange={(layout) => updateSettings({ ...settings, diffLayout: layout })}
      onModeChange={(diffMode) => updateSettings({ ...settings, diffMode })}
    />
  );
  const zenBar = zen && (
    <div className="zen-bar">
      <button onClick={() => setZen(false)}>Exit Zen Mode (Esc)</button>
    </div>
  );
  const imageDialog = (
    <ImageInsertDialog
      visible={imageDialogVisible}
      onClose={() => setImageDialogVisible(false)}
      onUploadFile={uploadImage}
      onInsert={(src) => {
        setImageDialogVisible(false);
        editor?.chain().focus().setImage({ src }).run();
      }}
    />
  );
  const tableTools = (
    <>
      {!diffVisible && <TableFillHandle editor={editor} />}
      <TableControls editor={editor} containerRef={editorContainerRef} verticalAlign={settings.tableVerticalAlign} onVerticalAlign={(tableVerticalAlign) => updateSettings({ ...settings, tableVerticalAlign })} />
      {!zen && <TableFilterMenu editor={editor} containerRef={editorContainerRef} />}
    </>
  );
  const outline = (
    <>
      {settings.outlineStyle === "panel" && (
        <div className="toc-wrapper">
          <TableOfContents />
        </div>
      )}
      {settings.outlineStyle === "rail" && <OutlineRail />}
    </>
  );

  // .md: the continuous Markdown editor (toolbar, sticky headings, outline) — no ribbon, no pages.
  if (!PAPER) {
    return (
      <div className={"editor-layout ms-continuous ms-plain" + (review.enabled ? " has-review" : "")}>
        <div className={"editor-container" + (dragOver ? " drag-over" : "")} ref={editorContainerRef}>
          {searchBar}
          {status && <div className="status-bar">{status}</div>}
          <div className="editor-toolbar">
            {review.enabled && <ReviewBar review={review} />}
            {readonly && <div className="readonly-badge">Read-only</div>}
            {!readonly && (
              <button className={"diff-button" + (diffVisible ? " active" : "")} onClick={toggleDiff} title="Diff against HEAD" aria-label="Toggle git diff view">
                Diff
              </button>
            )}
            {!readonly && <ToolkitMenu />}
            <button className="diff-button" onClick={() => setZen(true)} title="Zen mode (Ctrl+. / ⌘.)" aria-label="Enter zen mode">
              Zen
            </button>
            <button className="settings-button" onClick={() => setSettingsVisible(true)} title="Markdown settings" aria-label="Open markdown settings">
              ⚙
            </button>
          </div>
          <SettingsPanel visible={settingsVisible} settings={settings} onChange={updateSettings} onClose={() => setSettingsVisible(false)} />
          <SetupPrompt visible={setupPromptVisible} onChoice={handleSetupChoice} onDismiss={dismissSetupPrompt} />
          {diffView}
          {!diffVisible && <StickyHeadings />}
          <div className="toggle-source-row">
            <span className="toggle-source" onClick={switchToSource} role="button" tabIndex={0}>
              Open in Default Editor
            </span>
            {frontmatter === null && !readonly && (
              <span className="toggle-source" onClick={() => window.dispatchEvent(new Event("btrmk:addFrontmatter"))} role="button" tabIndex={0} title="Add a YAML frontmatter block at the top of the file">
                Add Frontmatter
              </span>
            )}
          </div>
          <FrontmatterPanel value={frontmatter} readonly={readonly} onChange={setFrontmatter} />
          {(settings.lineNumbers || review.enabled) && (
            <LineNumbers editor={editor} markdown={review.enabled ? review.source : undefined} review={review.enabled ? review : undefined} />
          )}
          <EditorContent editor={editor} />
          {review.enabled && <ReviewLayer editor={editor} review={review} />}
          {!readonly && <EditorBubbleMenu editor={editor} />}
          {!readonly && !zen && <BlockHandle editor={editor} containerRef={editorContainerRef} gutter={settings.lineNumbers ? 40 : 0} />}
          {tableTools}
        </div>
        {outline}
        {zenBar}
        {imageDialog}
      </div>
    );
  }

  return (
    <Shell editor={editor} readonly={readonly} onSource={switchToSource}>
      <StyleSheetCss />
      <div className={"editor-layout" + (review.enabled ? " has-review" : "") + (paged ? " ms-paged" : " ms-continuous")}>
        <div className={"editor-container" + (dragOver ? " drag-over" : "")} ref={editorContainerRef} onContextMenu={paged ? (e) => openContextMenu(editor, e.nativeEvent) : undefined}>
          {searchBar}
          {status && <div className="status-bar">{status}</div>}
          {review.enabled && <div className="ms-review-strip"><ReviewBar review={review} /></div>}
          <SettingsPanel visible={settingsVisible} settings={settings} onChange={updateSettings} onClose={() => setSettingsVisible(false)} />
          <SetupPrompt visible={setupPromptVisible} onChoice={handleSetupChoice} onDismiss={dismissSetupPrompt} />
          {diffView}
          {!diffVisible && !paged && <StickyHeadings />}
          <FrontmatterPanel value={frontmatter} readonly={readonly} onChange={setFrontmatter} />
          {paged && showRulers && <Ruler editor={editor} />}
            <div className="ms-paper-sizer" style={paged && layout ? { height: layout.height * zoom + 48, width: layout.width * zoom } : undefined}>
              {paged && showRulers && <Ruler editor={editor} vertical />}
              <div className="ms-paper" style={paged ? { transform: `scale(${zoom})`, width: layout?.width } : undefined}>
                {paged && <PageLayer editor={editor} />}
                {paged && showLineNumbers && <LineNumberGutter editor={editor} />}
                {(settings.lineNumbers || review.enabled) && !paged && (
                  <LineNumbers editor={editor} markdown={review.enabled ? review.source : undefined} review={review.enabled ? review : undefined} />
                )}
                <EditorContent editor={editor} />
                <ObjectLayer editor={editor} />
                {paged && showBlockHandles && !readonly && !zen && <BlockHandles editor={editor} />}
                {review.enabled && <ReviewLayer editor={editor} review={review} />}
              </div>
            </div>
          {!readonly && <EditorBubbleMenu editor={editor} />}
          {!readonly && !zen && !paged && zoom === 1 && <BlockHandle editor={editor} containerRef={editorContainerRef} gutter={settings.lineNumbers && !paged ? 40 : 0} />}
          {tableTools}
        </div>
        {!paged && outline}
        {zenBar}
        {imageDialog}
      </div>
    </Shell>
  );
}
