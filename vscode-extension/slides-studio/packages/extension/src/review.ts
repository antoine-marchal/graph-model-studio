import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { DiffBaseKind, ReviewData } from '@corporate-slides/core';
import { tr } from '@corporate-slides/core';

/** URI scheme of merge request revisions opened by the Project Integration (GitLab) companion. */
export const MR_SCHEME = 'pi-mr';
const RENDERED_REVIEW = 'projectIntegration.mrReview.rendered';

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

/** Relay a rendered-review action to the companion. The URI always comes from the host document. */
export async function reviewRequest(document: vscode.TextDocument, request: { action: string; line?: number; text?: string; discussionId?: string; resolved?: boolean }): Promise<ReviewData> {
  if (document.uri.scheme !== MR_SCHEME) throw new Error(tr('Les commentaires de revue sont disponibles depuis la liste des modifications de la merge request.', 'Review comments are available from the changes list of the merge request.'));
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(RENDERED_REVIEW)) throw new Error(tr('Mettez à jour l’extension Project Integration pour commenter dans l’éditeur visuel.', 'Update the Project Integration extension to comment in the visual editor.'));
  return (await vscode.commands.executeCommand(RENDERED_REVIEW, { uri: document.uri.toString(), ...request })) as ReviewData;
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
