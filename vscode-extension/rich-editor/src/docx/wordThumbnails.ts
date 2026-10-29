/**
 * Reference thumbnails of a Word template, rendered by Word itself (Windows, Word installed): the
 * first page of every section, from a temporary copy opened read-only and never saved. Masters
 * show them beside the editor rendering, as Slides Studio does with PowerPoint. Without Word,
 * nothing is rendered and the editor rendering is used.
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PS = `
param([string]$In, [string]$OutDir, [int]$Width)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($In, $false, $true, $false)
  $doc.ActiveWindow.View.Type = 3
  $pages = $doc.ActiveWindow.Panes(1).Pages
  for ($s = 1; $s -le $doc.Sections.Count; $s++) {
    $n = $doc.Sections.Item($s).Range.Characters.First.Information(3)
    if ($n -lt 1 -or $n -gt $pages.Count) { continue }
    $ms = New-Object System.IO.MemoryStream(,$pages.Item($n).EnhMetaFileBits)
    $img = [System.Drawing.Image]::FromStream($ms)
    $h = [int]($Width * $img.Height / $img.Width)
    $bmp = New-Object System.Drawing.Bitmap($Width, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($img, 0, 0, $Width, $h)
    $bmp.Save((Join-Path $OutDir ("section-{0}.png" -f $s)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  }
  $doc.Close($false)
} finally { $word.Quit() }
`;

/** Section number (1-based) → PNG file in `outDir`; empty when Word is unavailable. */
export async function renderSectionThumbnails(data: Uint8Array, ext: string, outDir: string, width = 420): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (process.platform !== "win32") return out;
  const tmp = await mkdtemp(join(tmpdir(), "ms-tpl-"));
  try {
    const copy = join(tmp, `template${ext.toLowerCase() === ".dotx" ? ".dotx" : ".docx"}`);
    await writeFile(copy, data);
    const script = join(tmp, "thumbs.ps1");
    await writeFile(script, PS, "utf8");
    const pngDir = join(tmp, "png");
    await mkdir(pngDir);
    await new Promise<void>((ok, fail) =>
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-In", copy, "-OutDir", pngDir, "-Width", String(width)], { timeout: 180_000, windowsHide: true }, (err) => (err ? fail(err) : ok())),
    );
    await mkdir(outDir, { recursive: true });
    for (const f of await readdir(pngDir)) {
      const m = /^section-(\d+)\.png$/.exec(f);
      if (!m) continue;
      await copyFile(join(pngDir, f), join(outDir, f));
      out.set(Number(m[1]), f);
    }
  } catch {
    // Word missing or failed: the editor rendering stands in.
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return out;
}
