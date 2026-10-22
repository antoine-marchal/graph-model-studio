import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * PowerPoint's native clipboard drawing ("Art::GVML ClipFormat", an OOXML package of the copied
 * shapes, text and tables), read through Windows Forms: webviews only see HTML / text / images.
 * When PowerPoint is installed, the clipboard is also pasted into a hidden blank presentation and
 * saved (`pptx`): its slide is native PowerPoint XML, which the drawing simplifies (text box list
 * styles…). Null when the clipboard holds no drawing, or off Windows.
 */
export async function readPowerPointClipboard(tmpDir: string, slide: { width: number; height: number }): Promise<{ gvml: Uint8Array; pptx: Uint8Array | null } | null> {
  if (process.platform !== 'win32') return null;
  await mkdir(tmpDir, { recursive: true });
  const base = join(tmpDir, `clipboard-${process.pid}-${Date.now()}`);
  const gvml = `${base}.gvml`, pptx = `${base}.pptx`;
  const q = (p: string) => p.replace(/'/g, "''");
  // Paths are ours (no user input in the script); the clipboard API needs an STA thread.
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    "$d = [System.Windows.Forms.Clipboard]::GetDataObject()",
    "$s = if ($d) { $d.GetData('Art::GVML ClipFormat') } else { $null }",
    'if (-not ($s -is [System.IO.Stream])) { exit 0 }',
    `$m = New-Object System.IO.MemoryStream; $s.CopyTo($m); [System.IO.File]::WriteAllBytes('${q(gvml)}', $m.ToArray())`,
    'try {',
    '  $pp = New-Object -ComObject PowerPoint.Application',
    '  $was = $pp.Presentations.Count',
    '  $p = $pp.Presentations.Add(0)',
    `  $p.PageSetup.SlideWidth = ${Math.round(slide.width * 72)}; $p.PageSetup.SlideHeight = ${Math.round(slide.height * 72)}`,
    '  $sl = $p.Slides.Add(1, 12)',
    '  $null = $sl.Shapes.Paste()',
    `  $p.SaveAs('${q(pptx)}', 24)`,
    '  $p.Close()',
    '  if ($was -eq 0) { $pp.Quit() }',
    '} catch { }',
  ].join('\n');
  try {
    await new Promise<void>((resolve, reject) =>
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { timeout: 30000, windowsHide: true }, (e) => (e ? reject(e) : resolve())),
    );
    const g = await readFile(gvml).catch(() => null);
    if (!g) return null;
    return { gvml: new Uint8Array(g), pptx: await readFile(pptx).then((b) => new Uint8Array(b)).catch(() => null) };
  } catch {
    return null;
  } finally {
    await rm(gvml, { force: true }).catch(() => undefined);
    await rm(pptx, { force: true }).catch(() => undefined);
  }
}
