import type JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';
import { tr } from '@corporate-slides/core';

export const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', allowBooleanAttributes: true });

export interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

export async function readText(zip: JSZip, part: string): Promise<string | null> {
  const f = zip.file(part);
  return f ? f.async('string') : null;
}

export const relsPartFor = (part: string): string => posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels');

export async function readRels(zip: JSZip, part: string): Promise<Rel[]> {
  const xml = await readText(zip, relsPartFor(part));
  if (!xml) return [];
  const parsed = xmlParser.parse(xml);
  const list = [parsed?.Relationships?.Relationship ?? []].flat() as Record<string, string>[];
  return list.map((r) => ({
    id: r['@_Id'] ?? '',
    type: (r['@_Type'] ?? '').split('/').pop() ?? '',
    target: r['@_TargetMode'] === 'External' ? (r['@_Target'] ?? '') : posix.normalize(posix.join(posix.dirname(part), r['@_Target'] ?? '')),
    external: r['@_TargetMode'] === 'External',
  }));
}

export interface LayoutInventory {
  part: string;
  name: string;
  ooxmlType?: string;
  masterPart: string;
  /** Order within the master's sldLayoutIdLst (matches PowerPoint COM CustomLayouts order). */
  orderInMaster: number;
}

export interface MasterInventory {
  part: string;
  index: number;
  themePart?: string;
  layoutParts: string[];
  /** Number of template slides using a layout of this master. */
  usage: number;
  xml: Record<string, unknown>;
}

export interface FeatureFinding {
  feature: string;
  parts: string[];
  count: number;
  impact: string;
}

export interface PackageInventory {
  slideSize: { cx: number; cy: number };
  masters: MasterInventory[];
  layouts: LayoutInventory[];
  slideLayoutUsage: Record<string, number>;
  slideCount: number;
  media: { part: string; ext: string; bytes: number }[];
  embeddedFonts: string[];
  features: FeatureFinding[];
  externalRelationships: string[];
}

// Groups, alternate content (see flattenPart) and crops (see picturesIn) are handled, so not listed.
const FEATURE_PATTERNS: { feature: string; re: RegExp; impact: string }[] = [
  { feature: tr('Remplissage dégradé (a:gradFill)', 'Gradient fill (a:gradFill)'), re: /<a:gradFill/g, impact: tr('Approximé par la première couleur du dégradé', 'Approximated by the first gradient color') },
  { feature: tr('Remplissage motif (a:pattFill)', 'Pattern fill (a:pattFill)'), re: /<a:pattFill/g, impact: tr('Approximé par la couleur de premier plan', 'Approximated by the foreground color') },
  { feature: tr('Géométrie libre (a:custGeom)', 'Freeform geometry (a:custGeom)'), re: /<a:custGeom/g, impact: tr('Non reconstruite (rectangle, ou ignorée dans un groupe)', 'Not rebuilt (rectangle, or dropped inside a group)') },
  { feature: tr('Animations (p:timing)', 'Animations (p:timing)'), re: /<p:timing/g, impact: tr('Non reproduites', 'Not reproduced') },
  { feature: tr('Transitions (p:transition)', 'Transitions (p:transition)'), re: /<p:transition/g, impact: tr('Non reproduites', 'Not reproduced') },
  { feature: tr('Objets OLE (p:oleObj)', 'OLE objects (p:oleObj)'), re: /<p:oleObj/g, impact: tr('Non reproduits', 'Not reproduced') },
  { feature: tr('SmartArt (dgm)', 'SmartArt (dgm)'), re: /drawingml\/2006\/diagram/g, impact: tr('Non reproduit', 'Not reproduced') },
  { feature: tr('Graphiques (c:chart)', 'Charts (c:chart)'), re: /drawingml\/2006\/chart"/g, impact: tr('Non reproduits dans les dispositions', 'Not reproduced in layouts') },
  { feature: tr('Tableaux (a:tbl)', 'Tables (a:tbl)'), re: /<a:tbl>/g, impact: tr('Non reproduits dans les dispositions', 'Not reproduced in layouts') },
  { feature: tr('Effets 3D (a:scene3d/a:sp3d)', '3D effects (a:scene3d/a:sp3d)'), re: /<a:(scene3d|sp3d)/g, impact: tr('Non reproduits', 'Not reproduced') },
  { feature: tr('Texte WordArt (a:prstTxWarp)', 'WordArt text (a:prstTxWarp)'), re: /<a:prstTxWarp prst="(?!textNoShape")/g, impact: tr('Non reproduit', 'Not reproduced') },
];

const num = (s: string): number => parseInt(/\d+/.exec(s)?.[0] ?? '0', 10);

export async function inventoryPackage(zip: JSZip): Promise<PackageInventory> {
  const presXml = (await readText(zip, 'ppt/presentation.xml'))!;
  const pres = xmlParser.parse(presXml)['p:presentation'];
  const sz = pres?.['p:sldSz'] ?? {};
  const presRels = await readRels(zip, 'ppt/presentation.xml');
  const relById = new Map(presRels.map((r) => [r.id, r]));

  const masterIds = [pres?.['p:sldMasterIdLst']?.['p:sldMasterId'] ?? []].flat() as Record<string, string>[];
  const masters: MasterInventory[] = [];
  const layouts: LayoutInventory[] = [];
  for (const [index, m] of masterIds.entries()) {
    const part = relById.get(m['@_r:id'] ?? '')?.target;
    if (!part) continue;
    const xmlText = (await readText(zip, part)) ?? '';
    const xml = xmlParser.parse(xmlText);
    const rels = await readRels(zip, part);
    const relMap = new Map(rels.map((r) => [r.id, r]));
    const ids = [xml['p:sldMaster']?.['p:sldLayoutIdLst']?.['p:sldLayoutId'] ?? []].flat() as Record<string, string>[];
    const layoutParts: string[] = [];
    for (const [orderInMaster, l] of ids.entries()) {
      const lp = relMap.get(l['@_r:id'] ?? '')?.target;
      if (!lp) continue;
      layoutParts.push(lp);
      const lx = (await readText(zip, lp)) ?? '';
      layouts.push({
        part: lp,
        name: /<p:cSld[^>]*\bname="([^"]*)"/.exec(lx)?.[1] ?? posix.basename(lp, '.xml'),
        ooxmlType: /<p:sldLayout[^>]*\btype="(\w+)"/.exec(lx)?.[1],
        masterPart: part,
        orderInMaster,
      });
    }
    masters.push({ part, index, themePart: rels.find((r) => r.type === 'theme')?.target, layoutParts, usage: 0, xml });
  }

  const slideParts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  const slideLayoutUsage: Record<string, number> = {};
  for (const s of slideParts) {
    const lp = (await readRels(zip, s)).find((r) => r.type === 'slideLayout')?.target;
    if (lp) slideLayoutUsage[lp] = (slideLayoutUsage[lp] ?? 0) + 1;
  }
  for (const m of masters) m.usage = m.layoutParts.reduce((a, lp) => a + (slideLayoutUsage[lp] ?? 0), 0);

  const media = Object.keys(zip.files)
    .filter((f) => f.startsWith('ppt/media/') && !zip.files[f]!.dir)
    .map((part) => ({
      part,
      ext: posix.extname(part).slice(1).toLowerCase(),
      bytes: (zip.files[part] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
    }))
    .sort((a, b) => num(a.part) - num(b.part));

  const embeddedFonts = [pres?.['p:embeddedFontLst']?.['p:embeddedFont'] ?? []].flat().map((f: Record<string, Record<string, string>>) => f['p:font']?.['@_typeface'] ?? '?');

  // Feature scan over masters + layouts (what the importer must reproduce).
  const scanned = [...masters.map((m) => m.part), ...layouts.map((l) => l.part)];
  const features: FeatureFinding[] = [];
  const externalRelationships: string[] = [];
  for (const part of scanned) {
    const xml = (await readText(zip, part)) ?? '';
    for (const p of FEATURE_PATTERNS) {
      const count = xml.match(p.re)?.length ?? 0;
      if (!count) continue;
      let f = features.find((x) => x.feature === p.feature);
      if (!f) features.push((f = { feature: p.feature, parts: [], count: 0, impact: p.impact }));
      f.parts.push(part);
      f.count += count;
    }
    for (const r of await readRels(zip, part)) if (r.external) externalRelationships.push(`${part} → ${r.target}`);
  }
  const metafiles = media.filter((m) => m.ext === 'emf' || m.ext === 'wmf');
  if (metafiles.length) {
    features.push({
      feature: tr('Images vectorielles Windows (EMF/WMF)', 'Windows vector pictures (EMF/WMF)'),
      parts: metafiles.map((m) => m.part),
      count: metafiles.length,
      impact: tr('Conservées dans le PPTX (type MIME ajouté par l’adaptateur) ; aperçu navigateur via conversion PNG locale', 'Kept in the PPTX (MIME type added by the adapter); browser preview via local PNG conversion'),
    });
  }
  if (embeddedFonts.length) {
    features.push({ feature: tr('Polices incorporées', 'Embedded fonts'), parts: ['ppt/presentation.xml'], count: embeddedFonts.length, impact: tr('Non réincorporées', 'Not re-embedded') });
  }

  return {
    slideSize: { cx: Number(sz['@_cx'] ?? 9144000), cy: Number(sz['@_cy'] ?? 6858000) },
    masters,
    layouts,
    slideLayoutUsage,
    slideCount: slideParts.length,
    media,
    embeddedFonts,
    features,
    externalRelationships,
  };
}

const GROUP = /<p:grpSp>((?:(?!<p:grpSp>)[\s\S])*?)<\/p:grpSp>/; // innermost group
const GROUP_CHILD = /<(p:sp|p:pic|p:cxnSp|p:graphicFrame)(?=[\s>])[\s\S]*?<\/\1>/g;

/** Children of one group, moved from the group's child space to its parent's coordinates. */
function ungroup(body: string): string {
  if (/<p:cNvPr [^>]*hidden="(1|true)"/.test(/<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>/.exec(body)?.[0] ?? '')) return '';
  const xfrm = /<p:grpSpPr[^>]*>[\s\S]*?<\/p:grpSpPr>/.exec(body)?.[0] ?? '';
  const n = (tag: string, a: string) => Number(new RegExp(`<a:${tag} [^>]*\\b${a}="(-?\\d+)"`).exec(xfrm)?.[1]);
  const [ox, oy, ex, ey, cx, cy, cw, ch] = [n('off', 'x'), n('off', 'y'), n('ext', 'cx'), n('ext', 'cy'), n('chOff', 'x'), n('chOff', 'y'), n('chExt', 'cx'), n('chExt', 'cy')];
  const ok = [ox, oy, ex, ey, cx, cy, cw, ch].every(Number.isFinite);
  const sx = ok && cw ? ex / cw : 1;
  const sy = ok && ch ? ey / ch : 1;
  return [...body.matchAll(GROUP_CHILD)]
    .map((m) => m[0])
    // pptx-masters draws freeforms as filled rectangles: inside a group (logos, pictograms) that is worse than nothing.
    .filter((c) => !/<a:custGeom/.test(c) || /<a:t>/.test(c))
    .map((c) =>
      !ok
        ? c
        : c
            .replace(/<a:off x="(-?\d+)" y="(-?\d+)"/, (_, x, y) => `<a:off x="${Math.round(ox + (x - cx) * sx)}" y="${Math.round(oy + (y - cy) * sy)}"`)
            .replace(/<a:ext cx="(\d+)" cy="(\d+)"/, (_, w, h) => `<a:ext cx="${Math.round(w * sx)}" cy="${Math.round(h * sy)}"`),
    )
    .join('');
}

/**
 * pptx-masters only reads top-level p:sp / p:pic: unwrap mc:AlternateContent (Fallback branch) and
 * flatten p:grpSp (group rotation/flip is not applied to the children).
 */
export function flattenPart(xml: string): string {
  let out = xml.replace(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/g, (m) => /<mc:Fallback\b[^>]*>([\s\S]*?)<\/mc:Fallback>/.exec(m)?.[1] ?? '');
  for (let m; (m = GROUP.exec(out)); ) out = out.slice(0, m.index) + ungroup(m[1]!) + out.slice(m.index + m[0].length);
  return out;
}

/** Rewrites the given parts in place with {@link flattenPart}; true when anything changed. */
export async function flattenPackage(zip: JSZip, parts: string[]): Promise<boolean> {
  let changed = false;
  for (const part of parts) {
    const xml = await readText(zip, part);
    if (xml === null) continue;
    const flat = flattenPart(xml);
    if (flat === xml) continue;
    zip.file(part, flat);
    changed = true;
  }
  return changed;
}

export interface PictureInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Media part the picture embeds. */
  media: string;
  /** Source crop as fractions of the image (ECMA-376 a:srcRect, 100000 = 100 %). */
  crop?: { l: number; t: number; r: number; b: number };
  /** `p:cNvPr hidden="1"`: present in the file but not displayed by PowerPoint. */
  hidden?: boolean;
  kind: 'pic' | 'sp' | 'cxnSp';
}

/**
 * Shapes and pictures of a master/layout part with crop rectangles and hidden flags. pptx-masters
 * ignores `a:srcRect` and `hidden="1"`, so this adapter recovers them; the normalizer matches by geometry.
 */
export async function picturesIn(zip: JSZip, part: string): Promise<PictureInfo[]> {
  const xml = (await readText(zip, part)) ?? '';
  const rels = new Map((await readRels(zip, part)).map((r) => [r.id, r.target]));
  const out: PictureInfo[] = [];
  for (const m of xml.matchAll(/<p:(pic|sp|cxnSp)>([\s\S]*?)<\/p:\1>/g)) {
    const kind = m[1] as PictureInfo['kind'];
    const body = m[2]!;
    const rid = /<a:blip [^>]*r:embed="([^"]+)"/.exec(body)?.[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(body);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(body);
    if (!off || !ext || (kind === 'pic' && !rid)) continue;
    const info: PictureInfo = {
      x: Number(off[1]) / 914400,
      y: Number(off[2]) / 914400,
      w: Number(ext[1]) / 914400,
      h: Number(ext[2]) / 914400,
      media: rid ? (rels.get(rid) ?? '') : '',
      kind,
    };
    if (/<p:cNvPr [^>]*hidden="(1|true)"/.test(body)) info.hidden = true;
    const sr = /<a:srcRect([^>]*)\/>/.exec(body)?.[1] ?? '';
    const v = (k: string) => Number(new RegExp(`\\b${k}="(-?\\d+)"`).exec(sr)?.[1] ?? 0) / 100000;
    if (/\b[ltrb]="/.test(sr)) info.crop = { l: v('l'), t: v('t'), r: v('r'), b: v('b') };
    out.push(info);
  }
  return out;
}
