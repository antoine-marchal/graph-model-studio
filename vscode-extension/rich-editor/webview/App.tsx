import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { SlashCommand } from "./extensions/SlashCommand";
import { ZenFocus } from "./extensions/ZenFocus";
import { DiffMarks } from "./extensions/DiffMarks";
import { OutlineRail } from "./components/OutlineRail";
import { LineNumbers } from "./components/LineNumbers";
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
import { ToolkitMenu } from "./components/ToolkitMenu";
import { useSettingsPanel } from "./hooks/useSettingsPanel";
import { useAppearance } from "./hooks/useAppearance";
import { matchesBinding, selectWordAtCursor } from "./utils";
import { useEditorState } from "./hooks/useEditorState";
import { useClipboardHandlers } from "./hooks/useClipboardHandlers";
import { useDragDrop } from "./hooks/useDragDrop";
import { vscodeApi } from "./vscode-api";

export function App() {
  const handleUpdateRef = useRef<() => void>(() => {});
  const editorContainerRef = useRef<HTMLDivElement>(null);

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
    extensions: [...contentExtensions(), ZenFocus, SlashCommand, DiffMarks],
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
    addFrontmatter,
  } = useEditorState({ editor, settingsRef, handleUpdateRef, applySettings });

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
    return () => window.removeEventListener("message", handler);
  }, []);

  // Keyboard shortcuts (spans settings + search concerns)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault(); // prevent browser "Save HTML" dialog
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
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
          // Queue after Tiptap's selection transaction settles so the
          // bubble menu plugin has mounted/positioned before we switch
          // it to keyboard-nav mode.
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("btrmk:focusBubbleMenu"));
          });
        } else {
          // Cursor not inside a word — still focus so any follow-up
          // selection drag will show the menu.
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

  const handleSetupChoice = (choice: SetupChoice) => {
    setSetupPromptVisible(false);
    if (choice === "review") setSettingsVisible(true);
    vscodeApi.postMessage({ type: "setupPromptChoice", choice });
  };

  const dismissSetupPrompt = () => {
    setSetupPromptVisible(false);
    // Treat dismissal as "keep defaults" — record consent so the host
    // doesn't re-prompt on the next file open.
    vscodeApi.postMessage({ type: "setupPromptChoice", choice: "keep" });
  };

  if (!editor) return null;

  return (
    <div className="editor-layout">
      <div className={"editor-container" + (dragOver ? " drag-over" : "")} ref={editorContainerRef}>
        <SearchBar
          visible={searchVisible}
          onClose={(activeRange) => {
            setSearchVisible(false);
            if (activeRange && editor) {
              try {
                const pos = editor.view.posAtDOM(
                  activeRange.startContainer,
                  activeRange.startOffset,
                );
                editor.commands.focus();
                editor.commands.setTextSelection(pos);
              } catch {
                editor.commands.focus();
              }
            }
          }}
        />
        {status && <div className="status-bar">{status}</div>}
        <div className="editor-toolbar">
          {readonly && <div className="readonly-badge">Read-only</div>}
          {!readonly && (
            <button
              className={"diff-button" + (diffVisible ? " active" : "")}
              onClick={toggleDiff}
              title="Diff against HEAD"
              aria-label="Toggle git diff view"
            >
              Diff
            </button>
          )}
          {!readonly && <ToolkitMenu />}
          <button
            className="diff-button"
            onClick={() => setZen(true)}
            title="Zen mode (Ctrl+. / ⌘.)"
            aria-label="Enter zen mode"
          >
            Zen
          </button>
          <button
            className="settings-button"
            onClick={() => setSettingsVisible(true)}
            title="Markdown settings"
            aria-label="Open markdown settings"
          >
            ⚙
          </button>
        </div>
        <SettingsPanel
          visible={settingsVisible}
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsVisible(false)}
        />
        <SetupPrompt
          visible={setupPromptVisible}
          onChoice={handleSetupChoice}
          onDismiss={dismissSetupPrompt}
        />
        {diffVisible && diffData && (
          <DiffView
            oldContent={diffData.headContent}
            newContent={currentMarkdown}
            fileName={diffData.fileName}
            baseUri={baseUri.current}
            layout={settings.diffLayout}
            mode={settings.diffMode}
            onClose={() => setDiffVisible(false)}
            onLayoutChange={(layout) =>
              updateSettings({ ...settings, diffLayout: layout })
            }
            onModeChange={(diffMode) =>
              updateSettings({ ...settings, diffMode })
            }
          />
        )}
        {!diffVisible && <StickyHeadings />}
        <div className="toggle-source-row">
          <span
            className="toggle-source"
            onClick={switchToSource}
            role="button"
            tabIndex={0}
          >
            Open in Default Editor
          </span>
          {frontmatter === null && !readonly && (
            <span
              className="toggle-source"
              onClick={addFrontmatter}
              role="button"
              tabIndex={0}
              title="Add a YAML frontmatter block at the top of the file"
            >
              Add Frontmatter
            </span>
          )}
        </div>
        <FrontmatterPanel
          value={frontmatter}
          readonly={readonly}
          onChange={setFrontmatter}
        />
        {settings.lineNumbers && <LineNumbers editor={editor} />}
        <EditorContent editor={editor} />
        {!readonly && <EditorBubbleMenu editor={editor} />}
        {!readonly && !zen && (
          <BlockHandle
            editor={editor}
            containerRef={editorContainerRef}
            gutter={settings.lineNumbers ? 40 : 0}
          />
        )}
        {!diffVisible && <TableFillHandle editor={editor} />}
        <TableControls
          editor={editor}
          containerRef={editorContainerRef}
          verticalAlign={settings.tableVerticalAlign}
          onVerticalAlign={(tableVerticalAlign) => updateSettings({ ...settings, tableVerticalAlign })}
        />
        {!zen && <TableFilterMenu editor={editor} containerRef={editorContainerRef} />}
      </div>
      {settings.outlineStyle === "panel" && (
        <div className="toc-wrapper">
          <TableOfContents />
        </div>
      )}
      {settings.outlineStyle === "rail" && <OutlineRail />}
      {zen && (
        <div className="zen-bar">
          <button onClick={() => setZen(false)}>Exit Zen Mode (Esc)</button>
        </div>
      )}
      <ImageInsertDialog
        visible={imageDialogVisible}
        onClose={() => setImageDialogVisible(false)}
        onUploadFile={uploadImage}
        onInsert={(src) => {
          setImageDialogVisible(false);
          editor?.chain().focus().setImage({ src }).run();
        }}
      />
    </div>
  );
}
