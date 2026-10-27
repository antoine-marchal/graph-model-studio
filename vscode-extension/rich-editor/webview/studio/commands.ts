/** Host commands shared by the title bar, shortcuts and context menus. */
import { vscodeApi } from "../vscode-api";
import { getSync } from "./actions";

const flushed = () => getSync()?.flush() ?? Promise.resolve();

/** One history, VS Code's: pending typing goes first, then the host's undo / redo. */
export const hostUndo = () => void flushed().then(() => vscodeApi.postMessage({ type: "undo" }));
export const hostRedo = () => void flushed().then(() => vscodeApi.postMessage({ type: "redo" }));
export const revealSource = (line: number) => vscodeApi.postMessage({ type: "revealSource", line });
