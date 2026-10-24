/**
 * One rich editor panel ↔ its TextDocument. The TextDocument stays the authority (dirty state,
 * save, undo); the panel sends versioned edits:
 *
 *   webview → { type: "edit", id, baseVersion, changes }   replacements in the text of baseVersion
 *   host    → { type: "ack", id, version } | { type: "rejected", id, reason, conflict }
 *   host    → { type: "update", content, version }          any change the panel did not make
 *
 * Writes to one document are serialized across panels. An edit based on an older version is
 * rebased when it does not touch the region changed meanwhile, else rejected (never written over
 * newer text); the webview keeps the rejected text for recovery.
 */
import * as vscode from "vscode";
import { applyChanges, rebaseChanges, validChanges, type TextChange } from "../../shared/edit-sync";

const queues = new Map<string, Promise<unknown>>();

/** Run `task` after every queued write to `uri` (any panel), in order. */
export function enqueue<T>(uri: vscode.Uri, task: () => Promise<T>): Promise<T> {
  const key = uri.toString();
  const run = (queues.get(key) ?? Promise.resolve()).then(task, task);
  queues.set(key, run.catch(() => undefined));
  return run;
}

export class PanelSync {
  /** Text and version the webview has (last sent or acknowledged). */
  private synced: { text: string; version: number };
  /** Text our own in-flight WorkspaceEdit will produce (its change event is not an update). */
  private applying: string | undefined;
  /** Recent texts the webview may still base an in-flight edit on, by version. */
  private history = new Map<number, string>();

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly post: (msg: unknown) => void,
    private readonly readonly: boolean,
  ) {
    this.synced = { text: document.getText(), version: document.version };
    this.history.set(document.version, this.synced.text);
  }

  private setSynced(text: string, version: number): void {
    this.synced = { text, version };
    this.history.set(version, text);
    for (const v of this.history.keys()) if (this.history.size > 8) this.history.delete(v);
  }

  snapshot(): { content: string; version: number } {
    this.setSynced(this.document.getText(), this.document.version);
    return { content: this.synced.text, version: this.synced.version };
  }

  edit(msg: { id?: unknown; baseVersion?: unknown; changes?: unknown }): Promise<void> {
    const id = String(msg.id ?? "");
    return enqueue(this.document.uri, async () => {
      // After a rejection the panel reloads from the authoritative text it is sent here.
      const reject = (reason: string, conflict: boolean) => {
        this.post({ type: "rejected", id, reason, conflict });
        this.sendUpdate(true);
      };
      if (this.readonly) return reject("This revision is read-only.", false);
      const base = typeof msg.baseVersion === "number" ? this.history.get(msg.baseVersion) : undefined;
      if (base === undefined) return reject("The editor was too far behind the document; it has been reloaded.", true);
      if (!validChanges(msg.changes, base.length)) return reject("Malformed edit.", false);
      const current = this.document.getText();
      const rebasing = current !== base;
      let changes: TextChange[] = msg.changes;
      if (rebasing) {
        const rebased = rebaseChanges(base, current, changes);
        if (!rebased) {
          return reject("The source changed in the same place meanwhile; your edit was not written.", true);
        }
        changes = rebased;
      }
      if (!changes.length) {
        this.post({ type: "ack", id, version: this.document.version });
        return;
      }
      const expected = applyChanges(current, changes);
      const edit = new vscode.WorkspaceEdit();
      for (const c of changes) edit.replace(this.document.uri, new vscode.Range(this.document.positionAt(c.start), this.document.positionAt(c.end)), c.text);
      this.applying = expected;
      let ok = false;
      try {
        ok = await vscode.workspace.applyEdit(edit);
      } finally {
        this.applying = undefined;
      }
      if (!ok) {
        return reject("VS Code refused the edit (the file may be read-only or locked).", false);
      }
      const text = this.document.getText();
      this.setSynced(text, this.document.version);
      this.post({ type: "ack", id, version: this.document.version });
      // Rebased onto someone else's change, or a save participant touched it: send the merged text.
      if (text !== expected || rebasing) this.post({ type: "update", content: text, version: this.document.version });
    });
  }

  /** Document change: forwarded unless it is our own in-flight edit. */
  onDidChange(): void {
    if (this.applying !== undefined && this.document.getText() === this.applying) return;
    this.sendUpdate();
  }

  private sendUpdate(force = false): void {
    const text = this.document.getText();
    if (!force && text === this.synced.text && this.document.version === this.synced.version) return;
    this.setSynced(text, this.document.version);
    this.post({ type: "update", content: text, version: this.document.version });
  }
}
