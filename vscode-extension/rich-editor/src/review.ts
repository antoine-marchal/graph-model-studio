import * as vscode from "vscode";

const ACTIONS = new Set(["load", "create", "reply", "resolve"]);

/** URI always comes from the host document, never from a webview message. */
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
  if (document.uri.scheme !== "pi-mr") return;
  try {
    if (typeof request.action !== "string" || !ACTIONS.has(request.action))
      throw new Error("Unsupported review action.");
    const commands = await vscode.commands.getCommands(true);
    if (!commands.includes("projectIntegration.mrReview.rendered"))
      throw new Error("Update Project Integration to review this file in the rendered editor.");
    const data = await vscode.commands.executeCommand("projectIntegration.mrReview.rendered", {
      uri: document.uri.toString(),
      action: request.action,
      line: request.line,
      text: request.text,
      discussionId: request.discussionId,
      resolved: request.resolved,
    });
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
