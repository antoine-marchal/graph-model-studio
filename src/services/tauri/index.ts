// Thin wrappers around the Tauri window API so the rest of the app stays
// runtime-agnostic. In a browser (vite dev / web build) these are no-ops.

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function appWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return
  await (await appWindow()).minimize()
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return
  await (await appWindow()).toggleMaximize()
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return
  await (await appWindow()).close()
}

export async function isMaximized(): Promise<boolean> {
  if (!isTauri()) return false
  return (await appWindow()).isMaximized()
}

// File passed to the app on launch (CLI arg or .gmc double-click).
export async function getCliFile(): Promise<{ path: string; content: string } | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  const res = await invoke<[string, string] | null>('get_cli_file')
  if (!res) return null
  return { path: res[0], content: res[1] }
}

export interface ExportRequest {
  inputContent: string
  inputName: string
  output: string
  format: string
  width?: number | null
  height?: number | null
  theme?: string | null
  view?: string | null
}

// Headless export request parsed from `--export` CLI flags (null otherwise).
export async function getExportRequest(): Promise<ExportRequest | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return (await invoke<ExportRequest | null>('get_export_request')) ?? null
}

// Report headless export result; the Rust side prints and exits the process.
export async function finishExport(success: boolean, message: string): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('finish_export', { success, message })
}
