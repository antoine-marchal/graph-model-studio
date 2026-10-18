import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { XMLValidator } from 'fast-xml-parser';
import { posix } from 'node:path';
import { tr } from '@corporate-slides/core';

/**
 * OOXML post-processing adapter for pptxgenjs-plus 4.3.4 output. Kept isolated and minimal:
 * every fix is listed in `fixes` so the export report can show what was patched.
 */
/** Extension of a part name; dot-files such as `_rels/.rels` count as their full name. */
const extOf = (f: string): string => {
  const b = posix.basename(f);
  const i = b.lastIndexOf('.');
  return i < 0 ? '' : b.slice(i + 1).toLowerCase();
};

const EXTRA_CONTENT_TYPES: Record<string, string> = { emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp' };

export interface PostProcessInput {
  /** Layout name (cSld@name) → distinct image source files in pptxgenjs registration order. */
  layoutMedia?: Map<string, string[]>;
  adjustments?: { slide: number; name: string; values: Record<string, number> }[];
}

export async function postProcess(buffer: Buffer, input: PostProcessInput = {}): Promise<{ buffer: Buffer; fixes: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const fixes: string[] = [];
  if (input.layoutMedia) fixes.push(...(await fixLayoutMediaCollisions(zip, input.layoutMedia)));
  // Shape adjustments (ring thickness, arrow heads, callout tail…): `a:avLst` of the named shape.
  for (const a of input.adjustments ?? []) {
    const part = `ppt/slides/slide${a.slide}.xml`;
    const xml = await zip.file(part)?.async('string');
    if (!xml) continue;
    const at = xml.search(new RegExp(`<p:cNvPr id="\\d+" name="${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    if (at < 0) continue;
    const end = xml.indexOf('</p:sp>', at);
    const seg = xml.slice(at, end);
    const gd = Object.entries(a.values).map(([k, v]) => `<a:gd name="${k}" fmla="val ${Math.round(v)}"/>`).join('');
    const next = seg.replace(/<a:avLst\/>|<a:avLst>[\s\S]*?<\/a:avLst>/, `<a:avLst>${gd}</a:avLst>`);
    if (next === seg) continue;
    zip.file(part, xml.slice(0, at) + next + xml.slice(end));
    fixes.push(`${tr('Ajustements de forme', 'Shape adjustments')} : ${a.name}`);
  }
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  const present = new Set([...ct.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase()));
  const used = new Set(Object.keys(zip.files).map(extOf).filter(Boolean));
  for (const ext of used) {
    if (present.has(ext) || !EXTRA_CONTENT_TYPES[ext]) continue;
    ct = ct.replace('<Default Extension="xml"', `<Default Extension="${ext}" ContentType="${EXTRA_CONTENT_TYPES[ext]}"/><Default Extension="xml"`);
    fixes.push(tr(`Type de contenu ajouté pour .${ext} (${EXTRA_CONTENT_TYPES[ext]})`, `Content type added for .${ext} (${EXTRA_CONTENT_TYPES[ext]})`));
  }
  if (!fixes.length) return { buffer, fixes };
  zip.file('[Content_Types].xml', ct);
  for (const f of Object.keys(zip.files)) {
    // drop media no longer referenced after the collision fix
    if (/^ppt\/media\/layout-image-\d+\.\w+$/.test(f) && !(await isReferenced(zip, posix.basename(f)))) zip.remove(f);
  }
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer: out, fixes };
}

export interface PackageCheck {
  ok: boolean;
  errors: string[];
  slideCount: number;
  slideSize: { cx: number; cy: number } | null;
  /** Per slide: layout part and counts of native objects. */
  slides: { part: string; layout: string; shapes: number; pictures: number; tables: number; placeholders: number; texts: string[] }[];
}

/**
 * Structural validation of a generated package: well-formed XML parts, every internal relationship
 * target exists, every part extension has a content type, slide count and size.
 */
export async function validatePackage(buffer: Buffer): Promise<PackageCheck> {
  const zip = await JSZip.loadAsync(buffer);
  const errors: string[] = [];
  const files = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir);
  const ct = (await zip.file('[Content_Types].xml')?.async('string')) ?? '';
  if (!ct) errors.push(tr('[Content_Types].xml absent', '[Content_Types].xml missing'));
  const defaults = new Set([...ct.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase()));
  const overrides = new Set([...ct.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1]!.slice(1)));
  for (const f of files) {
    if (f === '[Content_Types].xml') continue;
    const ext = extOf(f);
    if (!defaults.has(ext) && !overrides.has(f)) errors.push(tr(`Aucun type de contenu pour ${f}`, `No content type for ${f}`));
    if (ext === 'xml' || ext === 'rels') {
      const xml = await zip.file(f)!.async('string');
      const v = XMLValidator.validate(xml);
      if (v !== true) errors.push(tr(`XML invalide dans ${f} : ${v.err.msg}`, `Invalid XML in ${f}: ${v.err.msg}`));
      if (ext === 'rels') {
        const dir = posix.dirname(posix.dirname(f));
        for (const m of xml.matchAll(/<Relationship [^>]*>/g)) {
          if (/TargetMode="External"/.test(m[0])) continue;
          const target = /Target="([^"]+)"/.exec(m[0])?.[1];
          if (!target) continue;
          const resolved = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(dir, target));
          if (!zip.file(resolved)) errors.push(tr(`Relation cassée dans ${f} → ${target}`, `Broken relationship in ${f} → ${target}`));
        }
      }
    }
  }
  const pres = (await zip.file('ppt/presentation.xml')?.async('string')) ?? '';
  const sz = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(pres);
  const slideParts = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
  const slides: PackageCheck['slides'] = [];
  for (const part of slideParts) {
    const xml = await zip.file(part)!.async('string');
    const rels = (await zip.file(part.replace('slides/', 'slides/_rels/') + '.rels')?.async('string')) ?? '';
    slides.push({
      part,
      layout: /Target="\.\.\/slideLayouts\/([^"]+)"/.exec(rels)?.[1] ?? '?',
      shapes: (xml.match(/<p:sp>/g) ?? []).length,
      pictures: (xml.match(/<p:pic>/g) ?? []).length,
      tables: (xml.match(/<a:tbl>/g) ?? []).length,
      placeholders: (xml.match(/<p:ph /g) ?? []).length,
      texts: [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]!),
    });
  }
  const declared = (pres.match(/<p:sldId /g) ?? []).length;
  if (declared !== slideParts.length) errors.push(tr(`presentation.xml déclare ${declared} diapositives, ${slideParts.length} présentes`, `presentation.xml declares ${declared} slides, ${slideParts.length} present`));
  return { ok: errors.length === 0, errors, slideCount: slideParts.length, slideSize: sz ? { cx: Number(sz[1]), cy: Number(sz[2]) } : null, slides };
}

async function isReferenced(zip: JSZip, name: string): Promise<boolean> {
  for (const f of Object.keys(zip.files)) {
    if (f.endsWith('.rels') && (await zip.file(f)!.async('string')).includes(`media/${name}"`)) return true;
  }
  return false;
}

/**
 * pptxgenjs-plus 4.3.4 names layout media `layout-image-<n>` with a per-layout counter, so two layouts
 * with images overwrite each other's `ppt/media/layout-image-1.*` (wrong logo on every layout but one).
 * We know the ordered image sources of each layout, so we re-store them under unique names and retarget
 * the layout relationships.
 */
async function fixLayoutMediaCollisions(zip: JSZip, layoutMedia: Map<string, string[]>): Promise<string[]> {
  const fixes: string[] = [];
  const layoutParts = Object.keys(zip.files).filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f));
  let retargeted = 0;
  for (const part of layoutParts) {
    const xml = await zip.file(part)!.async('string');
    const name = /<p:cSld name="([^"]*)"/.exec(xml)?.[1];
    const sources = name ? layoutMedia.get(name) : undefined;
    if (!sources?.length) continue;
    const relsPart = posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels');
    let rels = await zip.file(relsPart)!.async('string');
    const n = parseInt(/slideLayout(\d+)\.xml$/.exec(part)![1]!, 10);
    rels = rels.replace(/Target="\.\.\/media\/layout-image-(\d+)\.(\w+)"/g, (m, idx: string, ext: string) => {
      const src = sources[Number(idx) - 1];
      if (!src) return m;
      const target = `layout${n}-image-${idx}.${ext}`;
      zip.file(`ppt/media/${target}`, readFile(src));
      retargeted++;
      return `Target="../media/${target}"`;
    });
    zip.file(relsPart, rels);
  }
  if (retargeted) fixes.push(tr(`${retargeted} relation(s) d'image de disposition renommée(s) (collision layout-image-N de pptxgenjs-plus 4.3.4)`, `${retargeted} layout picture relationship(s) renamed (pptxgenjs-plus 4.3.4 layout-image-N collision)`));
  return fixes;
}
