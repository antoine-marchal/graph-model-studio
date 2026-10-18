import type { AssetDef, Constraints, CorporateMaster, LayoutDef, LevelStyle, PlaceholderDef, StaticObject } from '@corporate-slides/core';
import { PALETTE_VARIANTS, RULES, THEME_SLOTS, staticObjectBox, type Box } from '@corporate-slides/core';
import type { PackageInventory, PictureInfo } from './ooxml.js';
import { tr } from '@corporate-slides/core';

/** Shape of `pptx-masters` `extract()` output that we rely on (verified against v0.1.1). */
export interface PptxMastersResult {
  masterData: { name: string; title: string; background?: Record<string, unknown> | null; slideNumber?: Record<string, unknown> | null; objects: Record<string, unknown>[] }[];
  themeColors: Record<string, string>;
  themeFonts: { heading: string; body: string };
  dimensions: { width: number; height: number };
  warnings: string[];
  layouts: {
    name: string;
    _file: string;
    _masterFile: string | null;
    placeholders: { type?: string; idx?: string; name?: string; position?: Box; textProps?: { lstStyleProps?: Record<number, RawLevel> | null } | null }[];
    warnings: string[];
  }[];
  mediaFiles: { archivePath: string; filename: string }[];
  /** Tint/shade palette computed with pptx-masters' generateThemeJson(). */
  palette?: Record<string, Record<string, string>>;
}

export interface RawLevel {
  marginLeft?: number;
  indent?: number;
  bullet?: false | { type?: string; characterCode?: string; fontFace?: string; color?: string };
  defaultRunProps?: { fontSize?: number; color?: string; bold?: boolean; fontFace?: string };
}

export interface MasterTextStyles {
  title?: Record<number, RawLevel> | null;
  body?: Record<number, RawLevel> | null;
  sldNum?: (RawLevel & { align?: string }) | null;
}

export const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'layout';

const WINGDINGS: Record<string, string> = { A7: '▪', D8: '➢', FC: '✔', '76': '❖', '6E': '■', '71': '❑', A8: '◆', '9F': '•', '77': '⬥', F0: '➔' };

function bulletChar(b: Exclude<RawLevel['bullet'], false | undefined>): string {
  const code = (b.characterCode ?? '').toUpperCase();
  if (/wingdings/i.test(b.fontFace ?? '') && WINGDINGS[code]) return WINGDINGS[code]!;
  const cp = parseInt(code, 16);
  return Number.isFinite(cp) && cp > 0x1f ? String.fromCodePoint(cp) : '•';
}

function toLevels(...sources: (Record<number, RawLevel> | null | undefined)[]): LevelStyle[] {
  const levels: LevelStyle[] = [];
  for (let i = 1; i <= 5; i++) {
    const merged: LevelStyle = {};
    for (const src of sources) {
      const l = src?.[i];
      if (!l) continue;
      if (l.marginLeft !== undefined) merged.marginLeft = l.marginLeft;
      if (l.indent !== undefined) merged.indent = l.indent;
      const r = l.defaultRunProps;
      if (r?.fontSize) merged.fontSize = r.fontSize;
      if (r?.color) merged.color = r.color;
      if (r?.bold !== undefined) merged.bold = r.bold;
      if (l.bullet === false) merged.bullet = null;
      else if (l.bullet) merged.bullet = { char: l.bullet.type === 'number' ? undefined : bulletChar(l.bullet), color: l.bullet.color, numbered: l.bullet.type === 'number' };
    }
    levels.push(merged);
  }
  return levels;
}

const PH_TYPE: Record<string, PlaceholderDef['type']> = {
  title: 'title',
  ctrTitle: 'title',
  subTitle: 'subtitle',
  body: 'body',
  obj: 'body',
  pic: 'pic',
  chart: 'chart',
  tbl: 'tbl',
  media: 'media',
  clipArt: 'pic',
  dgm: 'other',
};
const FOOTER_TYPES = new Set(['dt', 'ftr', 'sldNum', 'hdr']);

interface BuildInput {
  r: PptxMastersResult;
  inv: PackageInventory;
  textStyles: Map<string, MasterTextStyles>;
  source: CorporateMaster['source'];
  assets: AssetDef[];
  /** archive part → asset id */
  assetByPart: Map<string, string>;
  /** layout/master part → top-level pictures with crop info */
  pictures: Map<string, PictureInfo[]>;
}

export function buildCorporateMaster({ r, inv, textStyles, source, assets, assetByPart, pictures }: BuildInput): CorporateMaster {
  const { width: W, height: H } = r.dimensions;
  const warnings: string[] = [];

  // Primary master = most used by the template's own slides (ties → first).
  const mastersSorted = [...inv.masters].sort((a, b) => b.usage - a.usage || a.index - b.index);
  const primary = mastersSorted[0]?.part;
  const masterId = (part: string) => `master-${(inv.masters.find((m) => m.part === part)?.index ?? 0) + 1}`;

  const assetByFilename = new Map<string, string>();
  for (const m of r.mediaFiles) {
    const id = assetByPart.get(m.archivePath);
    if (id) assetByFilename.set(m.filename, id);
  }

  // Process layouts primary-master first so the un-suffixed ids go to the primary master.
  const order = r.layouts
    .map((l, i) => ({ l, i, inv: inv.layouts.find((x) => x.part === l._file) }))
    .sort((a, b) => {
      const pa = a.l._masterFile === primary ? 0 : 1;
      const pb = b.l._masterFile === primary ? 0 : 1;
      const ma = inv.masters.findIndex((m) => m.part === a.l._masterFile);
      const mb = inv.masters.findIndex((m) => m.part === b.l._masterFile);
      return pa - pb || ma - mb || (a.inv?.orderInMaster ?? a.i) - (b.inv?.orderInMaster ?? b.i);
    });

  const usedIds = new Set<string>();
  const layouts: LayoutDef[] = [];
  for (const { l, i, inv: li } of order) {
    const md = r.masterData[i]!;
    const mPart = l._masterFile ?? inv.masters[0]?.part ?? '';
    let id = slugify(l.name);
    if (usedIds.has(id)) id = `${id}-m${(inv.masters.find((m) => m.part === mPart)?.index ?? 0) + 1}`;
    for (let n = 2; usedIds.has(id); n++) id = `${slugify(l.name)}-${n}`;
    usedIds.add(id);

    const ts = textStyles.get(mPart) ?? {};
    const phOptions = md.objects.filter((o) => 'placeholder' in o).map((o) => (o.placeholder as { options: Record<string, unknown> }).options);

    // Placeholder keys: title, subtitle, body, body-2 … in reading order.
    const raw = l.placeholders.filter((p) => !FOOTER_TYPES.has(p.type ?? '') && p.position);
    const reading = [...raw].sort((a, b) => Math.round(a.position!.y * 4) - Math.round(b.position!.y * 4) || a.position!.x - b.position!.x);
    const counters: Record<string, number> = {};
    const placeholders: PlaceholderDef[] = reading.map((p) => {
      const type = PH_TYPE[p.type ?? 'body'] ?? 'other';
      counters[type] = (counters[type] ?? 0) + 1;
      const key = counters[type] === 1 ? type : `${type}-${counters[type]}`;
      // pptx-masters emits placeholders in the same order as layout.placeholders (minus footers);
      // match by name + geometry because names are not unique (e.g. two "Espace réservé du contenu 2").
      const opt = phOptions.find((o) => o.name === p.name && Math.abs((o.x as number) - p.position!.x) < 0.001 && Math.abs((o.y as number) - p.position!.y) < 0.001) ?? {};
      const titleLvl = ts.title?.[1]?.defaultRunProps;
      const bodyLevels = toLevels(type === 'title' ? null : ts.body, p.textProps?.lstStyleProps);
      return {
        key,
        name: p.name ?? key,
        type,
        idx: p.idx,
        ...p.position!,
        style: {
          fontFace: (opt.fontFace as string) ?? (type === 'title' ? (titleLvl?.fontFace ?? r.themeFonts.heading) : undefined),
          fontSize: (opt.fontSize as number) ?? (type === 'title' ? titleLvl?.fontSize : bodyLevels[0]?.fontSize),
          // For body text the master level style is authoritative: pptx-masters fills a fallback
          // placeholder color from txStyles/title defaults that does not match the rendered text.
          color: type === 'title' ? ((opt.color as string) ?? titleLvl?.color) : (bodyLevels[0]?.color ?? (opt.color as string)),
          bold: (opt.bold as boolean) ?? (type === 'title' ? titleLvl?.bold : undefined),
          italic: opt.italic as boolean | undefined,
          align: opt.align as PlaceholderDef['style']['align'],
          valign: opt.valign === 'middle' || opt.valign === 'bottom' || opt.valign === 'top' ? opt.valign : undefined,
          margin: Array.isArray(opt.margin) && opt.margin.length === 4 ? (opt.margin as number[]) : undefined,
        },
        levels: type === 'title' ? undefined : bodyLevels,
      };
    });

    // Static objects with roles.
    const footerPhs = l.placeholders.filter((p) => p.type === 'dt' || p.type === 'ftr');
    const objects: StaticObject[] = [];
    let dropped = 0;
    let hidden = 0;
    for (const o of md.objects) {
      if ('placeholder' in o) continue;
      const box = staticObjectBox(o);
      const offSlide = box && (box.x >= W || box.y >= H || box.x + box.w <= 0 || box.y + box.h <= 0);
      if (offSlide) {
        dropped++;
        continue;
      }
      const kind = Object.keys(o)[0]!;
      const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
      const same = (p: PictureInfo) => !!box && near(p.x, box.x) && near(p.y, box.y) && near(p.w, box.w) && near(p.h, box.h);
      const partShapes = [...(pictures.get(l._file) ?? []), ...(pictures.get(mPart) ?? [])];
      if (partShapes.some((p) => p.hidden && same(p)) && !partShapes.some((p) => !p.hidden && same(p))) {
        hidden++;
        continue;
      }
      const obj = structuredClone(o) as Record<string, Record<string, unknown>>;
      let role: StaticObject['role'] = kind === 'text' ? 'text' : 'decoration';
      let assetId: string | undefined;
      let crop: StaticObject['crop'];
      if (kind === 'image') crop = partShapes.find((p) => p.crop && !p.hidden && same(p))?.crop;
      if (kind === 'image') {
        const file = String(obj.image!.path ?? '').split('/').pop() ?? '';
        assetId = assetByFilename.get(file);
        if (assetId) obj.image!.path = `assets/${file}`;
        else warnings.push(tr(`[${l.name}] image ${file} non résolue`, `[${l.name}] picture ${file} not resolved`));
        // Small images near a corner are treated as logos for overlap checks.
        if (box && box.w * box.h < 6 && (box.x < 2 || box.x + box.w > W - 3) && (box.y < 1.8 || box.y + box.h > H - 1)) role = 'logo';
      }
      if (kind === 'text' && box) {
        const ph = footerPhs.find((p) => p.position && Math.abs(p.position.x - box.x) < 0.01 && Math.abs(p.position.y - box.y) < 0.01);
        if (ph) {
          role = ph.type === 'dt' ? 'date' : 'footer';
          // pptx-masters omits inherited footer sizes; PptxGenJS would fall back to 18 pt and wrap.
          const opts = (obj.text!.options ?? {}) as Record<string, unknown>;
          if (opts.fontSize === undefined) opts.fontSize = (md.slideNumber?.fontSize as number | undefined) ?? 10;
          obj.text!.options = opts;
        }
      }
      objects.push({ role, object: obj, ...(assetId ? { assetId } : {}), ...(crop ? { crop } : {}) });
    }
    const layoutWarnings = [...l.warnings];
    if (dropped) layoutWarnings.push(tr(`${dropped} objet(s) hors diapositive (annotations du gabarit) ignoré(s)`, `${dropped} off-slide object(s) (template annotations) ignored`));
    if (hidden) layoutWarnings.push(tr(`${hidden} objet(s) masqué(s) (hidden="1") non reproduit(s)`, `${hidden} hidden object(s) (hidden="1") not reproduced`));

    // pptx-masters falls back to black Calibri when the slide number style is inherited from the master.
    let slideNumber = md.slideNumber ?? null;
    const layoutSldNum = l.placeholders.find((p) => p.type === 'sldNum') as
      | { textProps?: { paragraphs?: { runs?: { color?: string }[] }[]; lstStyleProps?: Record<number, RawLevel> | null } }
      | undefined;
    const explicitColor =
      layoutSldNum?.textProps?.paragraphs?.some((p) => p.runs?.some((r) => r.color)) || !!layoutSldNum?.textProps?.lstStyleProps?.[1]?.defaultRunProps?.color;
    if (slideNumber && !explicitColor && ts.sldNum) {
      const d = ts.sldNum.defaultRunProps ?? {};
      slideNumber = {
        ...slideNumber,
        ...(d.color ? { color: d.color } : {}),
        ...(d.fontSize ? { fontSize: d.fontSize } : {}),
        ...(d.bold ? { bold: true } : {}),
        fontFace: d.fontFace ?? r.themeFonts.body,
        ...(ts.sldNum.align ? { align: ts.sldNum.align } : {}),
      };
    }
    const bg = (md.background ?? {}) as Record<string, unknown>;
    const bgFile = typeof bg.path === 'string' ? bg.path.split('/').pop() : undefined;
    layouts.push({
      id,
      name: l.name,
      masterId: masterId(mPart),
      sourcePart: l._file,
      ooxmlType: li?.ooxmlType,
      aliases: [],
      background: { color: typeof bg.color === 'string' ? bg.color : undefined, assetId: bgFile ? assetByFilename.get(bgFile) : undefined },
      placeholders,
      objects,
      slideNumber,
      warnings: layoutWarnings,
    });
  }

  assignAliases(layouts, primary ? masterId(primary) : undefined);
  const contentLayout = layouts.find((l) => l.aliases.includes('content'));

  const masters = inv.masters.map((m) => ({
    id: masterId(m.part),
    name: tr(`Masque ${m.index + 1}`, `Master ${m.index + 1}`),
    part: m.part,
    layoutIds: layouts.filter((l) => l.masterId === masterId(m.part)).map((l) => l.id),
    primary: m.part === primary,
  }));

  const palette: Record<string, Record<string, string>> = {};
  for (const slot of THEME_SLOTS) palette[slot] = r.palette?.[slot] ?? {};

  return {
    schemaVersion: 1,
    id: 'corporate',
    name: source.file.replace(/\.(pptx|potx)$/i, ''),
    source,
    dimensions: { width: W, height: H },
    theme: { colors: r.themeColors, palette, fonts: r.themeFonts },
    masters,
    layouts,
    assets,
    fidelity: {
      method: 'reconstructed',
      description:
        tr("Dispositions reconstruites : chaque disposition du gabarit est recréée comme disposition PowerPoint native (defineSlideMaster de pptxgenjs-plus) avec ses objets statiques, son arrière-plan et des espaces réservés natifs. Les masques d'origine ne sont pas copiés : l'héritage masque → disposition du fichier source n'est pas conservé tel quel.", "Reconstructed layouts: every template layout is recreated as a native PowerPoint layout (pptxgenjs-plus defineSlideMaster) with its static objects, background and native placeholders. The original masters are not copied: the source file's master → layout inheritance is not kept as is."),
    },
    unsupported: inv.features,
    warnings: [...r.warnings, ...warnings],
    constraints: deriveConstraints(r, layouts, W, H, contentLayout),
  };
}

const ALIAS_BY_TYPE: Record<string, string> = { title: 'title', obj: 'content', twoObj: 'two-columns', secHead: 'section', titleOnly: 'title-only', blank: 'blank' };
const ALIAS_BY_NAME: [RegExp, string][] = [
  [/section/i, 'section'],
  [/sommaire|agenda|summary/i, 'agenda'],
  [/citation|quote/i, 'quote'],
  [/^(fin|end)\b/i, 'end'],
  [/comparaison|comparison/i, 'comparison'],
];

/**
 * Generic aliases so sources can say `layout: content` regardless of the template's language:
 * 1) OOXML layout type, 2) placeholder composition, 3) name keywords. First match wins, primary master first.
 */
export function assignAliases(layouts: LayoutDef[], primaryMasterId?: string): void {
  const taken = new Set<string>();
  const give = (l: LayoutDef, alias: string) => {
    if (taken.has(alias) || layouts.some((x) => x.id === alias)) return;
    taken.add(alias);
    l.aliases.push(alias);
  };
  const ordered = [...layouts].sort((a, b) => (a.masterId === primaryMasterId ? 0 : 1) - (b.masterId === primaryMasterId ? 0 : 1));
  for (const l of ordered) if (l.ooxmlType && ALIAS_BY_TYPE[l.ooxmlType]) give(l, ALIAS_BY_TYPE[l.ooxmlType]!);
  // Content layout: the one with the largest single body area (ties → template order).
  const contentCandidates = ordered.filter((l) => {
    const bodies = l.placeholders.filter((p) => p.type === 'body');
    return l.placeholders.filter((p) => p.type === 'title').length === 1 && bodies.length === 1 && !l.placeholders.some((p) => p.type === 'subtitle' || p.type === 'pic');
  });
  const area = (l: LayoutDef) => l.placeholders.filter((p) => p.type === 'body').reduce((a, p) => a + p.w * p.h, 0);
  const bestContent = [...contentCandidates].sort((a, b) => area(b) - area(a))[0];
  if (bestContent && area(bestContent) > 10) give(bestContent, 'content');
  for (const l of ordered) {
    const t = l.placeholders.filter((p) => p.type === 'title').length;
    const sub = l.placeholders.filter((p) => p.type === 'subtitle').length;
    const bodies = l.placeholders.filter((p) => p.type === 'body');
    const pics = l.placeholders.filter((p) => p.type === 'pic').length;
    const big = bodies.filter((b) => b.w * b.h > 10);
    if (t === 1 && sub === 1 && big.length === 0 && pics === 0) give(l, 'title');
    if (t === 1 && sub === 0 && bodies.length === 2 && big.length === 2 && Math.abs(big[0]!.y - big[1]!.y) < 0.2 && pics === 0) give(l, 'two-columns');
    if (t === 1 && l.placeholders.length === 1) give(l, 'title-only');
    if (l.placeholders.length === 0) give(l, 'blank');
    if (t === 1 && pics >= 1 && bodies.length >= 1) give(l, 'image-content');
  }
  for (const l of ordered) for (const [re, alias] of ALIAS_BY_NAME) if (re.test(l.name)) give(l, alias);
}

function deriveConstraints(r: PptxMastersResult, layouts: LayoutDef[], W: number, H: number, contentLayout?: LayoutDef): Constraints {
  const fonts = new Set<string>([r.themeFonts.heading, r.themeFonts.body]);
  const colors = new Set<string>(['000000', 'FFFFFF']);
  for (const slot of THEME_SLOTS) {
    const c = r.themeColors[slot];
    if (c) colors.add(c.toUpperCase());
    const p = r.palette?.[slot];
    for (const v of PALETTE_VARIANTS) if (p?.[v]) colors.add(p[v]!.toUpperCase());
  }
  const titleSizes: number[] = [];
  const bodySizes: number[] = [];
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const l of layouts) {
    for (const p of l.placeholders) {
      if (p.style.fontFace) fonts.add(p.style.fontFace);
      if (p.style.color) colors.add(p.style.color.toUpperCase());
      if (p.style.fontSize) (p.type === 'title' ? titleSizes : bodySizes).push(p.style.fontSize);
      for (const lv of p.levels ?? []) if (lv.fontSize) bodySizes.push(lv.fontSize);
      // Safe content area = title + body placeholders of the canonical content layout.
      if ((!contentLayout || l === contentLayout) && (p.type === 'title' || p.type === 'body' || p.type === 'subtitle')) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h);
      }
    }
    for (const o of l.objects) {
      const v = Object.values(o.object)[0] as Record<string, unknown> | undefined;
      const opts = (v?.options ?? v) as Record<string, unknown> | undefined;
      const fill = (opts?.fill as Record<string, unknown> | undefined)?.color;
      if (typeof fill === 'string') colors.add(fill.toUpperCase());
      if (typeof opts?.color === 'string') colors.add(opts.color.toUpperCase());
      if (typeof opts?.fontFace === 'string') fonts.add(opts.fontFace);
    }
  }
  if (x1 <= x0) { x0 = 0.5; y0 = 0.5; x1 = W - 0.5; y1 = H - 0.5; }
  const minMargin = Math.min(1, Math.max(0.1, Math.floor(Math.min(x0, y0, W - x1, H - y1) * 20) / 20));
  const lo = (a: number[], d: number) => (a.length ? Math.min(...a) : d);
  const hi = (a: number[], d: number) => (a.length ? Math.max(...a) : d);
  return {
    allowedFonts: [...fonts],
    fontSizes: {
      title: [Math.max(12, lo(titleSizes, 28) - 8), Math.min(96, hi(titleSizes, 40) + 8)],
      body: [Math.max(8, Math.min(10, lo(bodySizes, 12))), Math.min(60, Math.max(28, hi(bodySizes, 24) + 4))],
    },
    palette: [...colors],
    minMargin,
    safeArea: { x: Math.round(x0 * 1e4) / 1e4, y: Math.round(y0 * 1e4) / 1e4, w: Math.round((x1 - x0) * 1e4) / 1e4, h: Math.round((y1 - y0) * 1e4) / 1e4 },
    aspectRatio: Math.round((W / H) * 1e4) / 1e4,
    rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.default])),
  };
}
