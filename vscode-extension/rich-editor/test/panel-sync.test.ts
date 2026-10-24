// Host side of the versioned edit protocol (src/panelSync.ts) against a mocked VS Code document:
// two panels, an external change during an in-flight edit (rebased), overlapping changes
// (rejected, never written over newer text), a refused WorkspaceEdit, read-only revisions.
// Run: node --import tsx --test rich-editor/test/panel-sync.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

// Minimal vscode API: one text document, WorkspaceEdit replacements applied by applyEdit.
const listeners: (() => void)[] = [];
let refuse = false;
class Range {
  constructor(public start: number, public end: number) {}
}
class WorkspaceEdit {
  edits: { range: Range; text: string }[] = [];
  replace(_uri: unknown, range: Range, text: string) {
    this.edits.push({ range, text });
  }
}
const doc = {
  uri: { toString: () => "file:///doc.md" },
  text: "" as string,
  version: 1,
  getText() {
    return this.text;
  },
  positionAt(offset: number) {
    return offset;
  },
};
const vscodeMock = {
  Range: class extends Range {
    constructor(a: number, b: number) {
      super(a, b);
    }
  },
  WorkspaceEdit,
  workspace: {
    async applyEdit(edit: WorkspaceEdit) {
      if (refuse) return false;
      const sorted = [...edit.edits].sort((a, b) => b.range.start - a.range.start);
      for (const e of sorted) doc.text = doc.text.slice(0, e.range.start) + e.text + doc.text.slice(e.range.end as number);
      doc.version++;
      for (const l of listeners) l();
      return true;
    },
  },
};
const load = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  return request === "vscode" ? vscodeMock : load.call(this, request, ...rest);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PanelSync } = require("../src/panelSync") as typeof import("../src/panelSync");

function panel(readonly = false) {
  const out: any[] = [];
  const sync = new PanelSync(doc as any, (m) => out.push(m), readonly);
  listeners.push(() => sync.onDidChange());
  return { sync, out, last: (type: string) => [...out].reverse().find((m) => m.type === type) };
}

/** An external change (text editor, git…) as VS Code reports it. */
function external(text: string) {
  doc.text = text;
  doc.version++;
  for (const l of listeners) l();
}

test("edits, rebase over an external change, conflicts, refused edits, read-only", async () => {
  doc.text = "alpha beta gamma\n";
  doc.version = 1;
  const a = panel();
  const b = panel();
  const ra = panel(true);
  const base = a.sync.snapshot();
  b.sync.snapshot();
  ra.sync.snapshot();

  // A edits; B (another panel of the same document) is told, A is not echoed.
  await a.sync.edit({ id: "1", baseVersion: base.version, changes: [{ start: 0, end: 5, text: "ALPHA" }] });
  assert.equal(doc.text, "ALPHA beta gamma\n");
  assert.equal(a.last("ack")?.id, "1");
  assert.equal(a.out.filter((m) => m.type === "update").length, 0, "no echo to the author");
  assert.equal(b.last("update")?.content, "ALPHA beta gamma\n");

  // External change while A's next edit (based on the previous version) is in flight: rebased.
  const v = a.last("ack").version;
  external("ALPHA beta gamma\nexternal line\n");
  await a.sync.edit({ id: "2", baseVersion: v, changes: [{ start: 6, end: 10, text: "BETA" }] });
  assert.equal(doc.text, "ALPHA BETA gamma\nexternal line\n");
  assert.equal(a.last("ack")?.id, "2");
  assert.equal(a.last("update")?.content, doc.text, "merged text sent back");

  // Overlapping change: rejected, nothing written, authoritative text sent.
  const v2 = a.last("ack").version;
  external("ALPHA BETA GAMMA!\nexternal line\n");
  const before = doc.text;
  await a.sync.edit({ id: "3", baseVersion: v2, changes: [{ start: 11, end: 16, text: "delta" }] });
  assert.equal(doc.text, before, "never written over newer text");
  assert.equal(a.last("rejected")?.id, "3");
  assert.equal(a.last("rejected")?.conflict, true);
  assert.equal(a.last("update")?.content, before);

  // VS Code refuses the edit (read-only file…): rejected with a reason.
  refuse = true;
  await a.sync.edit({ id: "4", baseVersion: a.last("update").version, changes: [{ start: 0, end: 0, text: "x" }] });
  refuse = false;
  assert.match(a.last("rejected")?.reason, /refused/);
  assert.equal(doc.text, before);

  // Malformed changes and read-only revisions never write.
  await a.sync.edit({ id: "5", baseVersion: a.last("update").version, changes: [{ start: 5, end: 2, text: "x" }] });
  assert.match(a.last("rejected")?.reason, /Malformed/);
  await ra.sync.edit({ id: "6", baseVersion: doc.version, changes: [{ start: 0, end: 0, text: "x" }] });
  assert.match(ra.last("rejected")?.reason, /read-only/);
  assert.equal(doc.text, before);

  // Concurrent edits from two panels are serialized and both land.
  const vb = b.last("update").version;
  const va = a.last("update").version;
  await Promise.all([
    a.sync.edit({ id: "7", baseVersion: va, changes: [{ start: 0, end: 0, text: "[A]" }] }),
    b.sync.edit({ id: "8", baseVersion: vb, changes: [{ start: doc.getText().length, end: doc.getText().length, text: "[B]\n" }] }),
  ]);
  const final = doc.getText();
  assert.ok(final.startsWith("[A]ALPHA") && final.endsWith("[B]\n"), final);
});
