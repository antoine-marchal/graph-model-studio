import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rename, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';

/**
 * Local reference renderers. Nothing leaves the machine: we drive an installed PowerPoint
 * (Windows COM automation) or LibreOffice (`soffice --headless`). Paths are passed as process
 * arguments, never interpolated into script text.
 */
export type RendererKind = 'powerpoint' | 'libreoffice' | 'none';

const run = (cmd: string, args: string[], timeout = 300_000) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr }),
    );
  });

const PPT_PATHS = [
  'C:/Program Files/Microsoft Office/root/Office16/POWERPNT.EXE',
  'C:/Program Files (x86)/Microsoft Office/root/Office16/POWERPNT.EXE',
];
const SOFFICE_PATHS = ['C:/Program Files/LibreOffice/program/soffice.exe', '/usr/bin/soffice', '/usr/local/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];

export function detectRenderer(): { kind: RendererKind; path?: string } {
  if (process.env.CSS_RENDERER === 'none') return { kind: 'none' };
  if (process.platform === 'win32') {
    const p = PPT_PATHS.find((x) => existsSync(x));
    if (p) return { kind: 'powerpoint', path: p };
  }
  const s = SOFFICE_PATHS.find((x) => existsSync(x));
  return s ? { kind: 'libreoffice', path: s } : { kind: 'none' };
}

async function runPs(script: string, args: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'css-ps-'));
  const file = join(dir, 'script.ps1');
  try {
    await writeFile(file, '\ufeff' + script, 'utf8');
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args]);
    return stdout.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const PS_EXPORT_SLIDES = `
param([string]$In, [string]$OutDir, [int]$Width)
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $p = $app.Presentations.Open($In, $true, $false, $false)
  $h = [int]($Width * $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth)
  foreach ($s in $p.Slides) { $s.Export((Join-Path $OutDir ("slide{0}.png" -f $s.SlideIndex)), 'PNG', $Width, $h) }
  Write-Output $p.Slides.Count
  $p.Close()
} finally { if ($app.Presentations.Count -eq 0) { $app.Quit() } }
`;

/** Render every slide of a PPTX to `slide<N>.png` in outDir. Returns the files written. */
export async function renderPptxToPng(pptxPath: string, outDir: string, width = 1280): Promise<{ renderer: RendererKind; files: string[] }> {
  pptxPath = resolve(pptxPath);
  outDir = resolve(outDir);
  const r = detectRenderer();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  if (r.kind === 'powerpoint') {
    await runPs(PS_EXPORT_SLIDES, ['-In', pptxPath, '-OutDir', outDir, '-Width', String(width)]);
  } else if (r.kind === 'libreoffice') {
    // LibreOffice exports a PDF reliably; per-slide PNG export only renders the first slide.
    // We export PNG of the first slide and PDF for the rest (documented limitation).
    await run(r.path!, ['--headless', '--convert-to', 'png', '--outdir', outDir, pptxPath]);
    const png = join(outDir, basename(pptxPath).replace(/\.\w+$/, '.png'));
    if (existsSync(png)) await rename(png, join(outDir, 'slide1.png'));
  } else return { renderer: 'none', files: [] };
  const files = (await readdir(outDir)).filter((f) => /^slide\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  return { renderer: r.kind, files: files.map((f) => join(outDir, f)) };
}

const PS_LAYOUT_THUMBS = `
param([string]$In, [string]$OutDir, [int]$Width)
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $p = $app.Presentations.Open($In, $true, $true, $false)
  $h = [int]($Width * $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth)
  $n = 0
  for ($d = 1; $d -le $p.Designs.Count; $d++) {
    $layouts = $p.Designs.Item($d).SlideMaster.CustomLayouts
    for ($l = 1; $l -le $layouts.Count; $l++) {
      $n++
      $s = $p.Slides.AddSlide($p.Slides.Count + 1, $layouts.Item($l))
      $s.Export((Join-Path $OutDir ("m{0}-l{1}.png" -f $d, $l)), 'PNG', $Width, $h)
    }
  }
  Write-Output $n
  $p.Close()
} finally { if ($app.Presentations.Count -eq 0) { $app.Quit() } }
`;

/**
 * Reference thumbnails of every layout, rendered by PowerPoint from a temporary copy of the
 * template (opened read-only, untitled, never saved). Files are named `m<master>-l<layout>.png`
 * (1-based, PowerPoint order = sldMasterIdLst / sldLayoutIdLst order).
 */
export async function renderLayoutThumbnails(templatePath: string, outDir: string, width = 640): Promise<string[]> {
  if (detectRenderer().kind !== 'powerpoint') return [];
  outDir = resolve(outDir);
  await mkdir(outDir, { recursive: true });
  const tmp = await mkdtemp(join(tmpdir(), 'css-tpl-'));
  try {
    const copy = join(tmp, 'template' + (templatePath.toLowerCase().endsWith('.potx') ? '.potx' : '.pptx'));
    await copyFile(templatePath, copy);
    await runPs(PS_LAYOUT_THUMBS, ['-In', copy, '-OutDir', outDir, '-Width', String(width)]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return (await readdir(outDir)).filter((f) => /^m\d+-l\d+\.png$/.test(f));
}

const PS_EMF = `
param([string]$In, [string]$Out, [int]$MaxPx)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$m = New-Object System.Drawing.Imaging.Metafile($In)
try {
  $w = $m.Width; $h = $m.Height
  $s = [Math]::Min(1.0 * $MaxPx / [Math]::Max($w, $h), 4.0)
  $bmp = New-Object System.Drawing.Bitmap([int]([Math]::Max(1, $w * $s)), [int]([Math]::Max(1, $h * $s)))
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($m, 0, 0, $bmp.Width, $bmp.Height)
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output ("{0}x{1}" -f $w, $h)
} finally { $m.Dispose() }
`;

/** Convert EMF/WMF to PNG for browser previews (Windows only). Returns false when unavailable. */
export async function convertMetafileToPng(input: string, output: string, maxPx = 1600): Promise<boolean> {
  if (process.platform !== 'win32' || process.env.CSS_RENDERER === 'none') return false;
  try {
    await runPs(PS_EMF, ['-In', resolve(input), '-Out', resolve(output), '-MaxPx', String(maxPx)]);
    return existsSync(output);
  } catch {
    return false;
  }
}
