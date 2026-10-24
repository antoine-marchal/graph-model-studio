import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DiffBaseKind, ReviewData } from '@corporate-slides/core';
import { tr } from '@corporate-slides/core';

/** URI scheme of merge request revisions opened by the Project Integration (GitLab) companion. */
export const MR_SCHEME = 'pi-mr';
const RENDERED_REVIEW = 'projectIntegration.mrReview.rendered';
const LOCAL_REVISION = 'projectIntegration.mrReview.localRevision';

interface MrRef {
  m?: { iid: number; project: number; side: 'old' | 'new'; oldPath: string; newPath: string };
}

export function mrRef(uri: vscode.Uri): MrRef['m'] | undefined {
  if (uri.scheme !== MR_SCHEME) return undefined;
  try {
    return (JSON.parse(uri.query) as MrRef).m;
  } catch {
    return undefined;
  }
}

/** Working-copy path of a presentation: masters, images and diagrams always resolve from disk. */
export function localPath(uri: vscode.Uri): string {
  if (uri.scheme === 'file') return uri.fsPath;
  const rel = uri.path.replace(/^\/+/, '');
  const folders = vscode.workspace.workspaceFolders ?? [];
  const hit = folders.find((f) => existsSync(join(f.uri.fsPath, rel))) ?? folders.find((f) => existsSync(dirname(join(f.uri.fsPath, rel))));
  return join((hit ?? folders[0])?.uri.fsPath ?? '', rel);
}

/** Merge request revisions (changed side) seen this session, by working-copy path. */
const twins = new Map<string, string>();
const twinKey = (p: string) => p.toLowerCase();

/** Remember a merge request revision so the working copy of the same file can show its discussions. */
export function trackMrRevision(d: vscode.TextDocument): boolean {
  if (mrRef(d.uri)?.side !== 'new') return false;
  twins.set(twinKey(localPath(d.uri)), d.uri.toString());
  return true;
}

/** Merge request revision of a local file, when one was opened from the merge request this session. */
export function mrTwin(uri: vscode.Uri): vscode.Uri | undefined {
  const t = uri.scheme === 'file' ? twins.get(twinKey(uri.fsPath)) : undefined;
  return t ? vscode.Uri.parse(t) : undefined;
}

/**
 * Link a local file to its merge request revision without opening it from the Changes list:
 * the companion finds the open merge request of the checked-out branch that changes this file.
 * Resolved again each time: a push moves the merge request head, and discussions follow the latest one.
 */
export async function linkMrRevision(document: vscode.TextDocument): Promise<boolean> {
  if (document.uri.scheme !== 'file') return false;
  if (!(await vscode.commands.getCommands(true)).includes(LOCAL_REVISION)) return false;
  const uri = await vscode.commands.executeCommand<string | undefined>(LOCAL_REVISION, document.uri.toString());
  if (!uri) return false;
  twins.set(twinKey(document.uri.fsPath), uri);
  return true;
}

/**
 * Relay a rendered-review action to the companion. The URI always comes from the host document:
 * the merge request revision itself, or for a local file the revision of the same path opened
 * from the merge request (the companion only knows files opened from its Changes list).
 */
export async function reviewRequest(document: vscode.TextDocument, request: { action: string; line?: number; text?: string; discussionId?: string; resolved?: boolean }): Promise<ReviewData> {
  const twin = document.uri.scheme === MR_SCHEME ? undefined : mrTwin(document.uri);
  if (document.uri.scheme !== MR_SCHEME && !twin) throw new Error(tr('Aucune merge request ouverte de la branche courante ne modifie ce fichier. Ouvrez-le depuis la liste des modifications de la merge request (Project Integration) : ses discussions s’afficheront ensuite aussi sur la copie locale.', 'No open merge request of the current branch changes this file. Open it from the merge request changes list (Project Integration): its discussions then also show on the local copy.'));
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(RENDERED_REVIEW)) throw new Error(tr('Mettez à jour l’extension Project Integration pour commenter dans l’éditeur visuel.', 'Update the Project Integration extension to comment in the visual editor.'));
  const uri = twin ?? document.uri;
  const data = (await vscode.commands.executeCommand(RENDERED_REVIEW, { uri: uri.toString(), ...request })) as ReviewData;
  if (twin && data) {
    // Comment lines are those of the merge request revision: new comments need the same text.
    const same = (await vscode.workspace.openTextDocument(twin)).getText() === document.getText();
    if (!same) return { ...data, canCreate: false, notice: tr('La copie locale diffère de la version de la merge request : les commentaires peuvent être décalés ; pour en créer un, ouvrez la version de la merge request.', 'The local copy differs from the merge request version: comments may be offset; to add one, open the merge request version.') };
  }
  return data;
}

const git = (cwd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout))),
  );

/** Merge request target used for "MR base" on local files: setting, else origin's default branch. */
async function mrTarget(cwd: string): Promise<string> {
  const configured = vscode.workspace.getConfiguration('corporateSlides').get<string>('mrTargetBranch', '').trim();
  if (configured) return configured.includes('/') ? configured : `origin/${configured}`;
  const head = await git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).catch(() => '');
  if (head.trim()) return head.trim();
  for (const b of ['origin/main', 'origin/master']) if (await git(cwd, ['rev-parse', '--verify', '--quiet', b]).then(() => true, () => false)) return b;
  throw new Error(tr('Branche cible de la merge request introuvable (réglage corporateSlides.mrTargetBranch).', 'Merge request target branch not found (setting corporateSlides.mrTargetBranch).'));
}

export interface DiffBase {
  text: string | null;
  label: string;
  error?: string;
}

/**
 * Source text the visual diff compares against.
 * - MR revision (new side): the matching old side opened by the same diff.
 * - Local file: HEAD, or the merge-base with the merge request target branch.
 */
export async function loadDiffBase(document: vscode.TextDocument, kind: DiffBaseKind): Promise<DiffBase> {
  if (kind === 'none') return { text: null, label: '' };
  const m = mrRef(document.uri);
  if (m) {
    if (m.side === 'old') return { text: null, label: '', error: tr('Cette vue est la version de base de la merge request.', 'This view is the base version of the merge request.') };
    const old = vscode.workspace.textDocuments.find((d) => {
      const o = mrRef(d.uri);
      return o?.side === 'old' && o.iid === m.iid && o.project === m.project && o.newPath === m.newPath;
    });
    return old ? { text: old.getText(), label: tr(`base de !${m.iid}`, `base of !${m.iid}`) } : { text: '', label: tr(`base de !${m.iid}`, `base of !${m.iid}`) };
  }
  if (document.uri.scheme !== 'file') return { text: null, label: '', error: tr('Comparaison indisponible pour ce document.', 'Comparison unavailable for this document.') };
  const cwd = dirname(document.uri.fsPath);
  const file = `./${basename(document.uri.fsPath)}`;
  try {
    if (kind === 'head') {
      // An untracked file has no base: everything is new.
      const text = await git(cwd, ['show', `HEAD:${file}`]).catch(() => '');
      return { text, label: 'HEAD' };
    }
    const target = await mrTarget(cwd);
    const base = (await git(cwd, ['merge-base', 'HEAD', target])).trim();
    const text = await git(cwd, ['show', `${base}:${file}`]).catch(() => '');
    return { text, label: `merge-base ${target} (${base.slice(0, 8)})` };
  } catch (e) {
    return { text: null, label: '', error: (e as Error).message };
  }
}
