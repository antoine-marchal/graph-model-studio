/** Studio ↔ extension host requests (masters, preflight, export) and host-initiated requests. */
import { vscodeApi } from "../vscode-api";
import { notify, resolveDocument, studio } from "./store";
import type { MasterDef } from "../../document/schema";

let seq = 0;
const pending = new Map<string, (msg: any) => void>();

export function request<T = any>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<T> {
  const requestId = `ms-${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (pending.delete(requestId), reject(new Error(`${type} timed out`))), timeoutMs);
    pending.set(requestId, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg);
    });
    vscodeApi.postMessage({ type, requestId, ...payload });
  });
}

function applyMasters(msg: any): void {
  if (!Array.isArray(msg.masters)) return;
  studio.set({ masters: msg.masters, entries: msg.entries ?? [], assetBases: msg.assetBases ?? {} });
  resolveDocument();
}

export const refreshMasters = () => request("masters").then(applyMasters, (e) => notify("error", e.message));

export async function masterAction(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  try {
    const msg = await request("masterAction", { action, ...payload }, 600_000);
    applyMasters(msg);
    return msg.result;
  } catch (e) {
    notify("error", e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

export const saveMaster = (master: MasterDef) => masterAction("save", { master });

export async function runPreflight(): Promise<void> {
  try {
    const msg = await request("preflight");
    studio.set({ report: { report: msg.report, kind: "preflight" }, pane: "check", rightOpen: true });
  } catch (e) {
    notify("error", e instanceof Error ? e.message : String(e));
  }
}

/** Mermaid source → PNG data URL (DOCX export through an open editor). */
async function mermaidPng(code: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
  const { svg } = await mermaid.render(`ms-export-${Date.now()}`, code);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((ok, fail) => ((img.onload = () => ok()), (img.onerror = () => fail(new Error("SVG render failed"))), (img.src = url)));
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, img.naturalWidth * scale);
    canvas.height = Math.max(1, img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== "object") return;
  if (typeof msg.requestId === "string" && pending.has(msg.requestId)) {
    pending.get(msg.requestId)!(msg);
    pending.delete(msg.requestId);
    return;
  }
  if (msg.type === "mastersResult") applyMasters(msg);
  else if (msg.type === "mastersChanged") void refreshMasters();
  else if (msg.type === "showMasterBrowser") studio.set({ mastersOpen: true });
  // Explorer › Document masters: edit a master on this document's pages, or apply it.
  else if (msg.type === "enterMasterEdit" && typeof msg.id === "string") void import("./actions").then((a) => (studio.get().masterEdit ? a.exitMasterEdit(true) : Promise.resolve()).then(() => a.enterMasterEdit(msg.id)));
  else if (msg.type === "applyMaster" && typeof msg.id === "string") void import("./actions").then((a) => {
    const editor = a.getEditor();
    const section = editor && a.currentSectionBreak(editor);
    if (section) a.setSectionProps(section.pos, { ...section.props, master: msg.id, headers: "master" });
    else a.setDocumentMaster(msg.id);
  });
  else if (msg.type === "exportReport") studio.set({ report: { report: msg.report, target: msg.target, kind: "export" }, pane: "check", rightOpen: true });
  else if (msg.type === "renderMermaidPng") {
    mermaidPng(String(msg.code)).then(
      (dataUrl) => vscodeApi.postMessage({ type: "renderMermaidPngResult", requestId: msg.requestId, dataUrl }),
      (err) => vscodeApi.postMessage({ type: "renderMermaidPngResult", requestId: msg.requestId, error: String(err?.message ?? err) }),
    );
  }
});
