/**
 * VS Code webview API, acquired once. acquireVsCodeApi() throws if called
 * twice, so the instance is cached on window (the diff panel and editor
 * bundles share it).
 */

declare function acquireVsCodeApi(): VsCodeApi;

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

const KEY = "__BTRMK_VSCODE_API__";

export const vscodeApi: VsCodeApi = (() => {
  const w = window as any;
  if (!w[KEY]) w[KEY] = acquireVsCodeApi();
  return w[KEY];
})();
