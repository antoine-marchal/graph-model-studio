import * as vscode from "vscode";

const ACTIONS = new Set(["load", "create", "reply", "resolve"]);
const RENDERED_REVIEW = "projectIntegration.mrReview.rendered";
const LOCAL_REVISION = "projectIntegration.mrReview.localRevision";

/** Merge request revision lending its discussions to a local file, by local path. */
const twins = new Map<string, string>();

/**
 * Link a local file to its merge request revision: the companion finds the open
 * merge request of the checked-out branch that changes this file. Resolved again
 * on every load: a push moves the MR head, and discussions follow the latest one.
 */
export async function linkMrRevision(document: vscode.TextDocument): Promise<boolean> {
  if (document.uri.scheme !== "file") return false;
  if (!(await vscode.commands.getCommands(true)).includes(LOCAL_REVISION)) return false;
  const uri = await vscode.commands.executeCommand<string | undefined>(LOCAL_REVISION, document.uri.toString());
  if (uri) twins.set(document.uri.fsPath, uri);
  else twins.delete(document.uri.fsPath);
  return !!uri;
}

/** URI always comes from the host document (or its linked revision), never from a webview message. */
export async function sendReview(
  document: vscode.TextDocument,
  webview: vscode.Webview,
  request: {
    action?: unknown;
    requestId?: unknown;
    line?: unknown;
    text?: unknown;
    discussionId?: unknown;
    resolved?: unknown;
  },
): Promise<void> {
  const twin = document.uri.scheme === "file" ? twins.get(document.uri.fsPath) : undefined;
  if (document.uri.scheme !== "pi-mr" && !twin) return;
  try {
    if (typeof request.action !== "string" || !ACTIONS.has(request.action))
      throw new Error("Unsupported review action.");
    const commands = await vscode.commands.getCommands(true);
    if (!commands.includes(RENDERED_REVIEW))
      throw new Error("Update Project Integration to review this file in the rendered editor.");
    let data = await vscode.commands.executeCommand<{ canCreate?: boolean; notice?: string } | undefined>(RENDERED_REVIEW, {
      uri: twin ?? document.uri.toString(),
      action: request.action,
      line: request.line,
      text: request.text,
      discussionId: request.discussionId,
      resolved: request.resolved,
    });
    // Comment lines are those of the merge request revision: new comments need the same text.
    if (twin && data && (await vscode.workspace.openTextDocument(vscode.Uri.parse(twin))).getText() !== document.getText())
      data = { ...data, canCreate: false, notice: "Local copy differs from the merge request · replies still work" };
    await webview.postMessage({
      type: "reviewResult",
      requestId: request.requestId,
      action: request.action,
      data,
    });
  } catch (err) {
    await webview.postMessage({
      type: "reviewResult",
      requestId: request.requestId,
      action: request.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
