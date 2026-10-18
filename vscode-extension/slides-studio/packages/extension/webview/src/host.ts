import type { HostMessage, WebviewMessage } from '@corporate-slides/core';

/** Bridge to the extension host (or to the standalone test harness, which provides the same API). */
interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(s: unknown): void;
}
declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const api: VsCodeApi = window.acquireVsCodeApi
  ? window.acquireVsCodeApi()
  : { postMessage: (m) => console.warn('[no host]', m), getState: () => undefined, setState: () => {} };

export const post = (msg: WebviewMessage) => api.postMessage(msg);
export const saveViewState = (s: unknown) => api.setState(s);
export const loadViewState = <T,>(): T | undefined => api.getState() as T | undefined;

export function onHostMessage(fn: (m: HostMessage) => void): () => void {
  const h = (e: MessageEvent) => {
    if (e.data && typeof e.data === 'object' && typeof e.data.type === 'string') fn(e.data as HostMessage);
  };
  window.addEventListener('message', h);
  return () => window.removeEventListener('message', h);
}
