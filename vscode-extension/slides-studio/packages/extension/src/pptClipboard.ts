import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * PowerPoint's native clipboard drawing ("Art::GVML ClipFormat", an OOXML package of the copied
 * shapes, text and tables), read through Windows Forms: webviews only see HTML / text / images.
 * Null when the clipboard holds none, or off Windows.
 */
export async function readPowerPointClipboard(tmpDir: string): Promise<Uint8Array | null> {
  if (process.platform !== 'win32') return null;
  await mkdir(tmpDir, { recursive: true });
  const out = join(tmpDir, `clipboard-${process.pid}-${Date.now()}.gvml`);
  // The path is ours (no user input in the script); the clipboard API needs an STA thread.
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    "$d = [System.Windows.Forms.Clipboard]::GetDataObject()",
    "$s = if ($d) { $d.GetData('Art::GVML ClipFormat') } else { $null }",
    `if ($s -is [System.IO.Stream]) { $m = New-Object System.IO.MemoryStream; $s.CopyTo($m); [System.IO.File]::WriteAllBytes('${out.replace(/'/g, "''")}', $m.ToArray()) }`,
  ].join('; ');
  try {
    await new Promise<void>((resolve, reject) =>
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { timeout: 8000, windowsHide: true }, (e) => (e ? reject(e) : resolve())),
    );
    return new Uint8Array(await readFile(out));
  } catch {
    return null;
  } finally {
    await rm(out, { force: true }).catch(() => undefined);
  }
}
