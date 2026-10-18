import type JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';

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

const FEATURE_PATTERNS: { feature: string; re: RegExp; impact: string }[] = [
  { feature: 'Formes groupées (p:grpSp)', re: /<p:grpSp>/g, impact: 'Ignorées par pptx-masters v0.1 : absentes des dispositions reconstruites' },
  { feature: 'Remplissage dégradé (a:gradFill)', re: /<a:gradFill/g, impact: 'Approximé par la première couleur du dégradé' },
  { feature: 'Remplissage motif (a:pattFill)', re: /<a:pattFill/g, impact: 'Approximé par la couleur de premier plan' },
  { feature: 'Géométrie libre (a:custGeom)', re: /<a:custGeom/g, impact: 'Non reconstruite (forme ignorée ou rectangle)' },
  { feature: 'Image rognée (a:srcRect)', re: /<a:srcRect [^/]*[lrtb]="/g, impact: 'Rognage non reproduit : image affichée entière' },
  { feature: 'Contenu alternatif (mc:AlternateContent)', re: /<mc:AlternateContent/g, impact: 'Branche de repli ignorée' },
  { feature: 'Animations (p:timing)', re: /<p:timing/g, impact: 'Non reproduites' },
  { feature: 'Transitions (p:transition)', re: /<p:transition/g, impact: 'Non reproduites' },
  { feature: 'Objets OLE (p:oleObj)', re: /<p:oleObj/g, impact: 'Non reproduits' },
  { feature: 'SmartArt (dgm)', re: /drawingml\/2006\/diagram/g, impact: 'Non reproduit' },
  { feature: 'Graphiques (c:chart)', re: /drawingml\/2006\/chart"/g, impact: 'Non reproduits dans les dispositions' },
  { feature: 'Tableaux (a:tbl)', re: /<a:tbl>/g, impact: 'Non reproduits dans les dispositions' },
  { feature: 'Effets 3D (a:scene3d/a:sp3d)', re: /<a:(scene3d|sp3d)/g, impact: 'Non reproduits' },
  { feature: 'Texte WordArt (a:prstTxWarp)', re: /<a:prstTxWarp/g, impact: 'Non reproduit' },
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
      feature: 'Images vectorielles Windows (EMF/WMF)',
      parts: metafiles.map((m) => m.part),
      count: metafiles.length,
      impact: 'Conservées dans le PPTX (type MIME ajouté par l’adaptateur) ; aperçu navigateur via conversion PNG locale',
    });
  }
  if (embeddedFonts.length) {
    features.push({ feature: 'Polices incorporées', parts: ['ppt/presentation.xml'], count: embeddedFonts.length, impact: 'Non réincorporées' });
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
