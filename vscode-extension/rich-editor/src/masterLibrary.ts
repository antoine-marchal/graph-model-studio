/**
 * Workspace master library: `.markdown-studio/masters/<id>/master.json` (+ `assets/`, and the
 * imported template under `source/`), plus the built-in starter masters (read-only; duplicate one
 * to change it). Ids are stable folder names; renaming changes only the display name. Deleting a
 * master that documents use requires reassigning them first. Masters are edited through their
 * own `master.json` text document, so master changes have their own undo history.
 */
import * as vscode from "vscode";
import * as path from "path";
import { MASTER_FILE, MASTER_FOLDER, starterMasters, validateMaster } from "../document/masters";
import type { MasterDef } from "../document/schema";
import type { ImportedTemplate } from "./docx/importTemplate";
import { importDocument, importMasters } from "./docx/importDocument";
import { renderSectionThumbnails } from "./docx/wordThumbnails";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface MasterEntry {
  id: string;
  name: string;
  description?: string;
  basedOn?: string;
  source: "starter" | "docx" | "user";
  readonly: boolean;
  /** Webview-independent folder (assets resolve against it); undefined for starters. */
  folder?: string;
  errors?: string[];
}

const STARTERS = new Map(starterMasters().map((m) => [m.id, m]));
const decoder = new TextDecoder();

export class MasterLibrary {
  private cache = new Map<string, { mtime: number; master: MasterDef }>();

  /** Library folder for a document: its workspace folder (else its own folder). */
  root(doc: vscode.Uri): vscode.Uri {
    const ws = vscode.workspace.getWorkspaceFolder(doc)?.uri ?? vscode.Uri.joinPath(doc, "..");
    return vscode.Uri.joinPath(ws, ...MASTER_FOLDER.split("/"));
  }

  folderOf(doc: vscode.Uri, id: string): vscode.Uri {
    return vscode.Uri.joinPath(this.root(doc), id);
  }

  private async read(file: vscode.Uri): Promise<MasterDef | { errors: string[] }> {
    try {
      const stat = await vscode.workspace.fs.stat(file);
      const hit = this.cache.get(file.toString());
      if (hit && hit.mtime === stat.mtime) return hit.master;
      // An open, unsaved master.json (master edit mode) wins over the file on disk.
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === file.toString());
      const text = open ? open.getText() : decoder.decode(await vscode.workspace.fs.readFile(file));
      const value = JSON.parse(text);
      const errors = validateMaster(value);
      if (errors.length) return { errors };
      if (!open?.isDirty) this.cache.set(file.toString(), { mtime: stat.mtime, master: value });
      return value;
    } catch (err) {
      return { errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  async list(doc: vscode.Uri): Promise<{ entries: MasterEntry[]; masters: MasterDef[] }> {
    const entries: MasterEntry[] = [];
    const masters: MasterDef[] = [];
    const root = this.root(doc);
    let names: [string, vscode.FileType][] = [];
    try {
      names = await vscode.workspace.fs.readDirectory(root);
    } catch {
      // No library yet.
    }
    for (const [name, type] of names) {
      if (type !== vscode.FileType.Directory) continue;
      const m = await this.read(vscode.Uri.joinPath(root, name, MASTER_FILE));
      if ("errors" in m) {
        entries.push({ id: name, name, source: "user", readonly: true, errors: m.errors });
        continue;
      }
      if (m.id !== name) m.id = name;
      masters.push(m);
      entries.push({ id: m.id, name: m.name, description: m.description, basedOn: m.basedOn, source: m.provenance?.source ?? "user", readonly: false, folder: vscode.Uri.joinPath(root, name).fsPath });
    }
    for (const s of STARTERS.values()) {
      if (masters.some((m) => m.id === s.id)) continue;
      masters.push(s);
      entries.push({ id: s.id, name: s.name, description: s.description, basedOn: s.basedOn, source: "starter", readonly: true });
    }
    return { entries, masters };
  }

  /** Master lookup for a document: library ids, starter ids, or a path relative to the document. */
  async lookup(doc: vscode.Uri): Promise<(ref: string) => MasterDef | undefined> {
    const { masters } = await this.list(doc);
    const byId = new Map(masters.map((m) => [m.id, m]));
    const byPath = new Map<string, MasterDef>();
    return (ref: string) => {
      if (byId.has(ref)) return byId.get(ref);
      if (/[\\/]|\.json$/i.test(ref)) {
        const resolved = path.resolve(path.dirname(doc.fsPath), ref);
        if (byPath.has(resolved)) return byPath.get(resolved);
        const id = path.basename(path.dirname(resolved));
        const hit = byId.get(id);
        if (hit) byPath.set(resolved, hit);
        return hit;
      }
      return undefined;
    };
  }

  private async write(doc: vscode.Uri, master: MasterDef): Promise<vscode.Uri> {
    const file = vscode.Uri.joinPath(this.folderOf(doc, master.id), MASTER_FILE);
    await vscode.workspace.fs.createDirectory(this.folderOf(doc, master.id));
    await vscode.workspace.fs.writeFile(file, Buffer.from(`${JSON.stringify(master, null, 2)}\n`, "utf8"));
    this.cache.delete(file.toString());
    return file;
  }

  private async freeId(doc: vscode.Uri, base: string): Promise<string> {
    const { masters } = await this.list(doc);
    const taken = new Set(masters.map((m) => m.id));
    const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "master";
    if (!taken.has(clean)) return clean;
    for (let i = 2; ; i++) if (!taken.has(`${clean}-${i}`)) return `${clean}-${i}`;
  }

  /** New editable master: a copy of `fromId` (library or starter) or a blank one. */
  async create(doc: vscode.Uri, name: string, fromId?: string): Promise<MasterDef> {
    const lookup = await this.lookup(doc);
    const from = fromId ? lookup(fromId) : undefined;
    const id = await this.freeId(doc, name);
    const master: MasterDef = from
      ? { ...structuredClone(from), id, name, provenance: { source: "user", file: from.provenance?.file } }
      : { id, name, page: { size: "A4" }, provenance: { source: "user" } };
    // A copy of a family member keeps its base; a copy of a starter base keeps the starter as base.
    if (from && fromId && STARTERS.has(fromId) && !from.basedOn) master.basedOn = undefined;
    if (from && this.folderOf(doc, from.id)) await this.copyAssets(doc, from.id, id);
    await this.write(doc, master);
    return master;
  }

  private async copyAssets(doc: vscode.Uri, fromId: string, toId: string): Promise<void> {
    const src = vscode.Uri.joinPath(this.folderOf(doc, fromId), "assets");
    try {
      await vscode.workspace.fs.copy(src, vscode.Uri.joinPath(this.folderOf(doc, toId), "assets"), { overwrite: false });
    } catch {
      // No assets (starters keep none on disk).
    }
  }

  async rename(doc: vscode.Uri, id: string, name: string): Promise<void> {
    const file = vscode.Uri.joinPath(this.folderOf(doc, id), MASTER_FILE);
    const m = await this.read(file);
    if ("errors" in m) throw new Error(`Master "${id}" cannot be read: ${m.errors.join("; ")}`);
    await this.write(doc, { ...m, name });
  }

  /** Documents of the workspace that use master `id` (frontmatter or section markers), and masters based on it. */
  async usage(doc: vscode.Uri, id: string): Promise<{ documents: vscode.Uri[]; masters: string[] }> {
    const folder = vscode.workspace.getWorkspaceFolder(doc);
    const files = folder ? await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.{md,markdown}"), "**/node_modules/**", 5000) : [doc];
    const re = new RegExp(`(^\\s*master:\\s*["']?${id}["']?\\s*$)|("master"\\s*:\\s*"${id}")`, "m");
    const documents: vscode.Uri[] = [];
    for (const file of files) {
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === file.toString());
      const text = open ? open.getText() : decoder.decode(await vscode.workspace.fs.readFile(file));
      if (re.test(text)) documents.push(file);
    }
    const { masters } = await this.list(doc);
    return { documents, masters: masters.filter((m) => m.basedOn === id).map((m) => m.id) };
  }

  /** Delete after confirmation; documents using it are reassigned to another master (or nothing is deleted). */
  async delete(doc: vscode.Uri, id: string): Promise<boolean> {
    if (STARTERS.has(id) && !(await this.exists(doc, id))) throw new Error("Starter masters are built in and cannot be deleted.");
    const { documents, masters } = await this.usage(doc, id);
    if (masters.length) throw new Error(`Master "${id}" is the base of ${masters.join(", ")}; delete or rebase them first.`);
    let target: string | undefined;
    if (documents.length) {
      const { entries } = await this.list(doc);
      const pick = await vscode.window.showQuickPick(
        entries.filter((e) => e.id !== id && !e.errors).map((e) => ({ label: e.name, description: e.id, id: e.id })),
        { title: `${documents.length} document(s) use "${id}"`, placeHolder: "Reassign them to… (Escape cancels the deletion)" },
      );
      if (!pick) return false;
      target = pick.id;
    } else {
      const ok = await vscode.window.showWarningMessage(`Delete master "${id}"? Its folder goes to the trash.`, { modal: true }, "Delete");
      if (ok !== "Delete") return false;
    }
    if (target) {
      const edit = new vscode.WorkspaceEdit();
      const re = new RegExp(`(^\\s*master:\\s*["']?)${id}(["']?\\s*$)|("master"\\s*:\\s*")${id}(")`, "gm");
      for (const file of documents) {
        const d = await vscode.workspace.openTextDocument(file);
        const text = d.getText();
        for (const m of text.matchAll(re)) {
          const start = m.index! + (m[1] ?? m[3]).length;
          edit.replace(file, new vscode.Range(d.positionAt(start), d.positionAt(start + id.length)), target);
        }
      }
      if (!(await vscode.workspace.applyEdit(edit))) throw new Error("Could not reassign the documents; nothing was deleted.");
    }
    await vscode.workspace.fs.delete(this.folderOf(doc, id), { recursive: true, useTrash: true });
    return true;
  }

  private async exists(doc: vscode.Uri, id: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.folderOf(doc, id), MASTER_FILE));
      return true;
    } catch {
      return false;
    }
  }

  /** Import a .docx / .dotx; the user picks which page designs to keep and names them. Returns the created ids. */
  async importDocx(doc: vscode.Uri, file?: vscode.Uri, reimportId?: string, keepAll = false): Promise<{ ids: string[]; report: MasterDef["provenance"] } | undefined> {
    const picked = file ?? (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Word templates": ["docx", "dotx"] }, openLabel: "Import as master" }))?.[0];
    if (!picked) return undefined;
    const data = await vscode.workspace.fs.readFile(picked);
    const imported = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Importing the Word template…" }, () => importMasters(data, path.basename(picked.fsPath)));
    return this.saveImported(doc, imported, picked, data, reimportId, keepAll);
  }

  /** Write imported masters (the user picks the page designs to keep), their assets, Word thumbnails and the kept template. */
  private async saveImported(doc: vscode.Uri, imported: ImportedTemplate, picked: vscode.Uri, data: Uint8Array, reimportId?: string, keepAll = false): Promise<{ ids: string[]; report: MasterDef["provenance"]; sectionIds: string[] } | undefined> {
    const designs = [imported.family, ...imported.variants];
    let chosen = designs;
    if (!reimportId && !keepAll && designs.length > 1) {
      const picks = await vscode.window.showQuickPick(
        designs.map((m, i) => ({ label: m.name, description: `${m.page.orientation ?? "portrait"} · ${m.page.width ? `${Math.round(m.page.width)}×${Math.round(m.page.height ?? 0)} pt` : ""}`, picked: true, index: i })),
        { canPickMany: true, title: "Page designs found in the template", placeHolder: "Keep the designs to turn into masters (the first holds the styles)" },
      );
      if (!picks?.length) return undefined;
      chosen = designs.filter((_, i) => i === 0 || picks.some((p) => p.index === i));
    }
    const familyId = reimportId ?? (await this.freeId(doc, imported.family.id));
    // Reference thumbnails rendered by Word (first page of each section), when Word is installed.
    const thumbDir = await mkdtemp(path.join(tmpdir(), "ms-thumbs-"));
    const thumbs = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Rendering reference thumbnails with Word…" }, () => renderSectionThumbnails(data, path.extname(picked.fsPath), thumbDir));
    const ids: string[] = [];
    const idOf = new Map<MasterDef, string>();
    for (const m of chosen) {
      const id = m === imported.family ? familyId : await this.freeId(doc, `${familyId}-${m.id.split("-").pop()}`);
      idOf.set(m, id);
      const previous = reimportId && m === imported.family ? await this.read(vscode.Uri.joinPath(this.folderOf(doc, id), MASTER_FILE)) : undefined;
      const section = m.provenance?.section;
      const thumb = section ? thumbs.get(section) : undefined;
      if (thumb) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.folderOf(doc, id), "thumbnails"));
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.folderOf(doc, id), "thumbnails", "reference.png"), await readFile(path.join(thumbDir, thumb)));
      }
      // Reimport keeps the id and the user's display name.
      const master: MasterDef = { ...m, id, ...(m.basedOn ? { basedOn: familyId } : {}), ...(thumb ? { thumbnail: "thumbnails/reference.png" } : {}), ...(previous && !("errors" in previous) ? { name: previous.name } : {}) };
      await this.write(doc, master);
      for (const [name, bytes] of imported.assets) {
        const target = vscode.Uri.joinPath(this.folderOf(doc, id), "assets", name);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.folderOf(doc, id), "assets"));
        await vscode.workspace.fs.writeFile(target, bytes);
      }
      ids.push(id);
    }
    // The original template is kept for provenance, never overwritten.
    const sourceDir = vscode.Uri.joinPath(this.folderOf(doc, familyId), "source");
    await vscode.workspace.fs.createDirectory(sourceDir);
    let original = vscode.Uri.joinPath(sourceDir, path.basename(picked.fsPath));
    for (let i = 2; await this.statOk(original); i++) original = vscode.Uri.joinPath(sourceDir, `${path.parse(picked.fsPath).name}-${i}${path.extname(picked.fsPath)}`);
    await vscode.workspace.fs.writeFile(original, data);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.folderOf(doc, familyId), "import-report.json"), Buffer.from(`${JSON.stringify({ file: path.basename(picked.fsPath), fonts: imported.fonts, report: imported.report }, null, 2)}\n`));
    await rm(thumbDir, { recursive: true, force: true });
    // Master of every section (a dropped design falls back to the family).
    const sectionIds = imported.sectionDesigns.map((i) => idOf.get(designs[i]) ?? familyId);
    return { ids, report: imported.family.provenance, sectionIds };
  }

  /**
   * Word document → `<name>.paper` beside it (pictures and drawings in `<name>.assets/`), its
   * page design saved as a master of the library. Returns the new document, or undefined.
   */
  async importDocument(doc: vscode.Uri | undefined, file?: vscode.Uri): Promise<vscode.Uri | undefined> {
    const picked = file ?? (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Word documents": ["docx", "dotx"] }, openLabel: "Import as .paper" }))?.[0];
    if (!picked) return undefined;
    const data = await vscode.workspace.fs.readFile(picked);
    const base = path.parse(picked.fsPath).name.replace(/[^\w\- .]+/g, "_");
    const folder = vscode.Uri.joinPath(picked, "..");
    let target = vscode.Uri.joinPath(folder, `${base}.paper`);
    for (let i = 2; await this.statOk(target); i++) target = vscode.Uri.joinPath(folder, `${base}-${i}.paper`);
    const name = path.parse(target.fsPath).name;
    const assetsDir = `${name}.assets`;
    const fileName = path.basename(picked.fsPath);
    const imported = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Importing ${fileName}…` }, () => importDocument(data, fileName, { assetsDir, master: "__master__" }));
    const saved = await this.saveImported(doc ?? target, imported.template, picked, data, undefined, true);
    if (!saved) return undefined;
    const source = imported.source.replace(/master: __master__/, `master: ${saved.ids[0]}`);
    if (imported.assets.size) await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, assetsDir));
    for (const [file, bytes] of imported.assets) await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, assetsDir, file), bytes);
    await vscode.workspace.fs.writeFile(target, Buffer.from(source, "utf8"));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, `${name}.import-report.json`), Buffer.from(`${JSON.stringify({ file: fileName, master: saved.ids[0], report: imported.report }, null, 2)}\n`));
    return target;
  }

  private async statOk(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /** Re-run the import of a master's template (kept copy first, else the original path). */
  async reimport(doc: vscode.Uri, id: string): Promise<string[] | undefined> {
    const m = await this.read(vscode.Uri.joinPath(this.folderOf(doc, id), MASTER_FILE));
    if ("errors" in m || m.provenance?.source !== "docx") throw new Error(`Master "${id}" was not imported from a Word template.`);
    const kept = vscode.Uri.joinPath(this.folderOf(doc, id), "source", m.provenance.file ?? "");
    const file = (await this.statOk(kept)) ? kept : (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Word templates": ["docx", "dotx"] }, openLabel: "Reimport" }))?.[0];
    if (!file) return undefined;
    return (await this.importDocx(doc, file, id))?.ids;
  }

  /**
   * Master edit mode: apply a change to the master's own text document (separate undo history from
   * the document). Starters are copied into the library first.
   */
  async save(doc: vscode.Uri, master: MasterDef): Promise<string> {
    const errors = validateMaster(master);
    if (errors.length) throw new Error(errors.join("; "));
    if (!(await this.exists(doc, master.id))) {
      await this.write(doc, master);
      return master.id;
    }
    const file = vscode.Uri.joinPath(this.folderOf(doc, master.id), MASTER_FILE);
    const text = await vscode.workspace.openTextDocument(file);
    const next = `${JSON.stringify(master, null, 2)}\n`;
    if (text.getText() === next) return master.id;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(file, new vscode.Range(0, 0, text.lineCount, 0), next);
    if (!(await vscode.workspace.applyEdit(edit))) throw new Error("VS Code refused the master edit.");
    await text.save();
    this.cache.delete(file.toString());
    return master.id;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
