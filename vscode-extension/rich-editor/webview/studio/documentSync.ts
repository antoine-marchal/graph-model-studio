/**
 * Webview side of the versioned edit protocol (src/panelSync.ts). The editor content plus the
 * frontmatter text make the desired source; only its difference with the last acknowledged
 * source is sent, one edit in flight at a time. External updates are merged with unsent local
 * changes when they touch different places; otherwise the local text is kept for recovery and
 * the source wins (an edit is never written over newer text).
 */
import type { Editor } from "@tiptap/core";
import { applyChanges, changesBetween, rebaseChanges } from "../../../shared/edit-sync";
import { extractFrontmatter } from "../frontmatter";
import { readMeta, writeMeta } from "../../document/meta";
import type { StudioMeta } from "../../document/schema";
import { mapLoadedDoc, nodeHtml, planBodyUpdate, serializeBody, sourceBlocks, type NodeRanges } from "./sourceMap";
import { notify, resolveDocument, studio } from "./store";
import { vscodeApi } from "../vscode-api";

export interface SyncDeps {
  editor: Editor;
  toHtml(md: string): Promise<string>;
  toMarkdown(html: string): string;
  /** After content was (re)loaded or replaced from source (tabs, caret…). */
  afterLoad?(): void;
}

export class DocumentSync {
  /** Source the host acknowledged (or sent), with its version. */
  private acked = { text: "", version: 0 };
  private inflight: { id: string; text: string } | null = null;
  private sendAgain = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queuedUpdate: { content: string; version: number } | null = null;
  private waiters: (() => void)[] = [];
  private seq = 0;
  /** Raw frontmatter block (fences included) and the body the editor content corresponds to. */
  fm = "";
  private current: { body: string; map: NodeRanges } = { body: "", map: new Map() };
  readonly = false;
  /** Set once the user interacted: opening a file never rewrites it. */
  touched = false;

  constructor(private deps: SyncDeps) {}

  private get editor() {
    return this.deps.editor;
  }

  /** Initial content from the host. */
  async load(content: string, version: number): Promise<void> {
    this.acked = { text: content, version };
    await this.replaceAll(content);
  }

  private setFrontmatter(fm: string): void {
    this.fm = fm;
    const { meta, readOnly, diagnostics } = readMeta(fm);
    studio.set({ meta, metaReadOnly: readOnly });
    for (const d of diagnostics) notify("warning", d);
    resolveDocument();
  }

  private async replaceAll(content: string): Promise<void> {
    const { content: body, frontmatter } = extractFrontmatter(content);
    this.setFrontmatter(frontmatter);
    const html = await this.deps.toHtml(body);
    this.editor.commands.setContent(html, { emitUpdate: false });
    this.deps.afterLoad?.();
    this.current = { body, map: mapLoadedDoc(this.editor.state.doc, sourceBlocks(body)) };
  }

  /** Desired source for the current editor content. */
  private serialize(): string {
    const { schema, doc } = this.editor.state;
    const out = serializeBody(doc, this.current.body, this.current.map, (node) => this.deps.toMarkdown(nodeHtml(schema, node)));
    this.current = { body: out.text, map: out.map };
    return this.fm + out.text;
  }

  /** Editor changed: send after a short pause (typing stays smooth). */
  schedule(delay = 300): void {
    if (this.readonly || !this.touched) return;
    studio.set({ sync: "pending" });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.send();
    }, delay);
  }

  private send(): void {
    if (this.readonly) return;
    if (this.inflight) {
      this.sendAgain = true;
      return;
    }
    let text: string;
    try {
      text = this.serialize();
    } catch (err) {
      notify("error", `Could not save: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    window.dispatchEvent(new CustomEvent("btrmk:source", { detail: text }));
    if (text === this.acked.text) {
      this.settle();
      return;
    }
    const id = `e${++this.seq}`;
    this.inflight = { id, text };
    studio.set({ sync: "sending" });
    vscodeApi.postMessage({ type: "edit", id, baseVersion: this.acked.version, changes: changesBetween(this.acked.text, text) });
  }

  private settle(): void {
    if (this.inflight || this.timer || this.sendAgain) return;
    studio.set((s) => ({ sync: s.sync === "conflict" ? "conflict" : this.readonly ? "readonly" : "saved" }));
    for (const w of this.waiters.splice(0)) w();
  }

  onAck(id: string, version: number): void {
    if (this.inflight?.id !== id) return;
    this.acked = { text: this.inflight.text, version };
    this.inflight = null;
    this.afterReply();
  }

  onRejected(id: string, reason: string): void {
    if (this.inflight?.id !== id) return;
    const lost = this.inflight.text;
    this.inflight = null;
    this.sendAgain = false;
    studio.set({ sync: "conflict" });
    notify("error", `Edit not written: ${reason}`, lost);
    this.afterReply();
  }

  private afterReply(): void {
    const queued = this.queuedUpdate;
    this.queuedUpdate = null;
    if (queued) void this.onUpdate(queued.content, queued.version);
    if (this.sendAgain) {
      this.sendAgain = false;
      this.send();
    }
    this.settle();
  }

  /** The source changed elsewhere (other panel, text editor, undo, git…). */
  async onUpdate(content: string, version: number): Promise<void> {
    if (this.inflight) {
      this.queuedUpdate = { content, version };
      return;
    }
    if (this.editor.view.composing) {
      // Never replace text under an IME composition: apply once it ends.
      this.editor.view.dom.addEventListener("compositionend", () => void this.onUpdate(content, version), { once: true });
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const local = this.serialize();
    let target = content;
    if (local !== this.acked.text) {
      const mine = changesBetween(this.acked.text, local);
      const rebased = rebaseChanges(this.acked.text, content, mine);
      if (rebased) target = applyChanges(content, rebased);
      else notify("warning", "The source changed where you were editing: the source version was kept. Your text is available to copy.", local);
    }
    this.acked = { text: content, version };
    await this.applySource(local, target);
    if (target !== content) this.schedule(0);
    window.dispatchEvent(new CustomEvent("btrmk:source", { detail: target }));
    this.settle();
  }

  /** Turn the editor content (serialized as `local`) into `target`, touching only changed blocks. */
  private async applySource(local: string, target: string): Promise<void> {
    if (local === target) return;
    const { content: newBody, frontmatter } = extractFrontmatter(target);
    if (frontmatter !== this.fm) this.setFrontmatter(frontmatter);
    if (this.current.body === newBody) return;
    const doc = this.editor.state.doc;
    const plan = await planBodyUpdate(doc, this.editor.schema, this.current.body, this.current.map, newBody, this.deps.toHtml).catch(() => null);
    if (!plan || this.editor.state.doc !== doc) {
      await this.replaceAllKeepingSelection(target);
      return;
    }
    const tr = this.editor.state.tr.replaceWith(plan.from, plan.to, plan.content);
    tr.setMeta("addToHistory", false).setMeta("preventUpdate", true).setMeta("msSourceUpdate", true);
    this.editor.view.dispatch(tr);
    this.current = { body: newBody, map: plan.map(this.editor.state.doc) };
    this.deps.afterLoad?.();
  }

  private async replaceAllKeepingSelection(content: string): Promise<void> {
    const { from, to } = this.editor.state.selection;
    const focused = this.editor.isFocused;
    await this.replaceAll(content);
    const max = this.editor.state.doc.content.size;
    this.editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
    if (focused) this.editor.commands.focus();
  }

  /** Pending edit sent and acknowledged (save, export, source switch, layout commands). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.send();
    } else if (this.touched && !this.inflight && !this.readonly) this.send();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.settle();
      setTimeout(resolve, 3000);
    });
  }

  /** Change the document meta (layout, objects, styles…) — one edit, flushed now. */
  updateMeta(change: (meta: StudioMeta) => StudioMeta | null): void {
    if (this.readonly || studio.get().metaReadOnly) {
      notify("warning", "Layout is read-only for this document.");
      return;
    }
    const current: StudioMeta = structuredClone(studio.get().meta ?? { version: 1 });
    const next = change(current);
    let fm = writeMeta(this.fm, next);
    if (!this.fm && fm && !/^\r?\n/.test(this.current.body)) fm += fm.includes("\r\n") ? "\r\n" : "\n";
    this.fm = fm;
    studio.set({ meta: next });
    resolveDocument();
    this.touched = true;
    this.schedule(0);
  }

  /** Raw YAML frontmatter edits (frontmatter panel). */
  setRawFrontmatter(fm: string): void {
    this.setFrontmatter(fm);
    this.touched = true;
    this.schedule();
  }

  /** 1-based source line of a top-level node (source lens), when it maps to the source. */
  lineOf(node: import("@tiptap/pm/model").Node): number | undefined {
    const r = this.current.map.get(node);
    if (!r) return undefined;
    return (this.fm + this.current.body.slice(0, r.start)).split("\n").length;
  }

  /** Source the editor currently represents (for the diff view and the gutter). */
  source(): string {
    return this.serialize();
  }
}
