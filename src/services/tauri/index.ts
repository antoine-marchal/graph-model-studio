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
