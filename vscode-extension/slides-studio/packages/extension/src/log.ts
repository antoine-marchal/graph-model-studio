import * as vscode from 'vscode';

/** Structured logging to the "Corporate Slides" output channel (no telemetry). */
let channel: vscode.LogOutputChannel | undefined;
const ch = () => (channel ??= vscode.window.createOutputChannel('Corporate Slides', { log: true }));

export const log = {
  info: (msg: string, data?: unknown) => ch().info(msg, ...(data === undefined ? [] : [data])),
  warn: (msg: string, data?: unknown) => ch().warn(msg, ...(data === undefined ? [] : [data])),
  error: (msg: string, err?: unknown) => ch().error(msg, ...(err === undefined ? [] : [err instanceof Error ? (err.stack ?? err.message) : err])),
  show: () => ch().show(true),
};
