import type { Constraints, CorporateMaster, SlideDocument, SlideElement, SourceRef } from './schema.js';
import { intersectionArea, resolveSlide, staticObjectBox, type Box } from './geometry.js';
import { estimateFit } from './metrics.js';
import { plainText } from './text.js';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  rule: string;
  severity: Severity;
  message: string;
  slideId?: string;
  slideIndex?: number;
  elementId?: string;
  source?: SourceRef;
}

export const RULES: Record<string, { label: string; default: Severity }> = {
  'unknown-layout': { label: 'Disposition inconnue', default: 'error' },
  'duplicate-id': { label: 'Identifiant dupliqué', default: 'error' },
  'missing-asset': { label: 'Image introuvable', default: 'error' },
  'unknown-placeholder': { label: 'Espace réservé inconnu', default: 'warning' },
  bounds: { label: 'Hors de la diapositive', default: 'warning' },
  'safe-area': { label: 'Hors zone de sécurité', default: 'warning' },
  overflow: { label: 'Débordement de texte', default: 'warning' },
  palette: { label: 'Couleur hors charte', default: 'warning' },
  font: { label: 'Police non autorisée', default: 'warning' },
  'font-size': { label: 'Taille de police hors hiérarchie', default: 'warning' },
  'logo-overlap': { label: 'Chevauchement du logo', default: 'warning' },
  'title-required': { label: 'Titre manquant', default: 'warning' },
  'image-distortion': { label: 'Image déformée', default: 'warning' },
  'broken-connector': { label: 'Connecteur sans extrémité', default: 'error' },
};

export interface ValidateOptions {
  /** Intrinsic pixel size of an image, when known. */
  imageSize?: (src: string) => { width: number; height: number } | undefined;
  /** Whether an image source exists on disk. */
  assetExists?: (src: string) => boolean;
}

/** Merge the corporate constraints with per-presentation overrides (never written back to the template). */
export function effectiveConstraints(master: CorporateMaster, doc: SlideDocument): Constraints {
  const o = doc.constraints;
  const base = master.constraints;
  return {
    ...base,
    allowedFonts: [...base.allowedFonts, ...(o?.allowedFonts ?? [])],
    palette: [...base.palette, ...(o?.extraColors ?? []).map((c) => c.replace('#', '').toUpperCase())],
    minMargin: o?.minMargin ?? base.minMargin,
    rules: { ...base.rules, ...(o?.rules ?? {}) },
  };
}

const textOf = (el: SlideElement): string =>
  el.type === 'text' || el.type === 'shape' ? (el.paragraphs ?? []).map(plainText).join('\n') : '';

export function validateDocument(doc: SlideDocument, master: CorporateMaster, opts: ValidateOptions = {}): Diagnostic[] {
  const c = effectiveConstraints(master, doc);
  const out: Diagnostic[] = [];
  const palette = new Set(c.palette.map((h) => h.toUpperCase()));
  const fonts = new Set(c.allowedFonts.map((f) => f.toLowerCase()));
  const { width: W, height: H } = master.dimensions;

  const push = (rule: string, message: string, ctx: Omit<Diagnostic, 'rule' | 'severity' | 'message'>, severity?: Severity) => {
    const configured = c.rules[rule];
    if (configured === 'off') return;
    out.push({ rule, severity: severity ?? configured ?? RULES[rule]?.default ?? 'warning', message, ...ctx });
  };

  const slideIds = new Set<string>();
  doc.slides.forEach((slide, slideIndex) => {
    const sctx = { slideId: slide.id, slideIndex, source: slide.source };
    if (slideIds.has(slide.id)) push('duplicate-id', `Identifiant de diapositive dupliqué « ${slide.id} »`, sctx);
    slideIds.add(slide.id);

    const resolved = resolveSlide(slide, master);
    const layout = resolved.layout;
    if (!layout) {
      push('unknown-layout', `Disposition « ${slide.layout} » absente du masque corporate`, sctx);
      return;
    }
    const logos: Box[] = layout.objects.filter((o) => o.role === 'logo').map((o) => staticObjectBox(o.object)).filter((b): b is Box => !!b);

    const hasTitlePh = layout.placeholders.some((p) => p.type === 'title');
    const titleEl = resolved.elements.find((r) => r.placeholder?.type === 'title');
    if (hasTitlePh && (!titleEl || !textOf(titleEl.element).trim())) {
      push('title-required', `La disposition « ${layout.name} » attend un titre`, sctx);
    }

    const elementIds = new Set<string>();
    for (const r of resolved.elements) {
      const el = r.element;
      const ctx = { ...sctx, elementId: el.id, source: el.source ?? slide.source };
      if (elementIds.has(el.id)) push('duplicate-id', `Identifiant d'élément dupliqué « ${el.id} »`, ctx);
      elementIds.add(el.id);
      if (el.hidden) continue;
      if (el.type === 'connector') {
        if (!r.path) push('broken-connector', `Connecteur « ${el.id} » : élément « ${el.from} » ou « ${el.to} » introuvable sur la diapositive`, ctx);
        // Its geometry follows the linked elements: placement rules do not apply.
        continue;
      }
      if (el.placeholder && !r.placeholder) {
        push('unknown-placeholder', `Espace réservé « ${el.placeholder} » absent de la disposition « ${layout.name} »`, ctx);
      }

      const b = r.box;
      const inside = b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= W + 0.01 && b.y + b.h <= H + 0.01;
      const fullyOutside = b.x >= W || b.y >= H || b.x + b.w <= 0 || b.y + b.h <= 0;
      if (fullyOutside) push('bounds', `« ${el.id} » est entièrement hors de la diapositive`, ctx, 'error');
      else if (!inside) push('bounds', `« ${el.id} » dépasse les bords de la diapositive`, ctx);
      else if (!r.inheritedGeometry) {
        const m = c.minMargin;
        const sa = c.safeArea;
        const inSafe = b.x >= sa.x - 0.01 && b.y >= sa.y - 0.01 && b.x + b.w <= sa.x + sa.w + 0.01 && b.y + b.h <= sa.y + sa.h + 0.01;
        const tooClose = b.x < m || b.y < m || b.x + b.w > W - m || b.y + b.h > H - m;
        if (!inSafe || tooClose) push('safe-area', `« ${el.id} » sort de la zone de contenu corporate (marge ${m.toFixed(2)} in)`, ctx);
      }

      if (!r.inheritedGeometry) {
        for (const logo of logos) {
          if (intersectionArea(b, logo) > 0.02) {
            push('logo-overlap', `« ${el.id} » chevauche un logo du gabarit`, ctx);
            break;
          }
        }
      }

      if ((el.type === 'text' || el.type === 'shape') && el.paragraphs?.length) {
        const fit = estimateFit(r, el.paragraphs);
        if (fit.overflows) {
          push(
            'overflow',
            `Texte de « ${el.id} » probablement trop long : ${fit.requiredHeight.toFixed(2)} in requis pour ${fit.availableHeight.toFixed(2)} in disponibles (estimation)`,
            ctx,
          );
        }
      }

      const colors = [el.style?.fill, el.style?.line, el.style?.color];
      if (el.type === 'text' || el.type === 'shape') for (const p of el.paragraphs ?? []) for (const run of p.runs) colors.push(run.color);
      for (const col of colors) {
        if (col && col !== 'none' && !col.startsWith('theme.') && !palette.has(col.replace('#', '').toUpperCase())) {
          push('palette', `Couleur ${col} hors de la palette corporate (utiliser un jeton theme.*)`, ctx);
        }
      }

      if (el.style?.fontFace && !el.style.fontFace.startsWith('theme.') && !fonts.has(r.style.fontFace.toLowerCase())) {
        push('font', `Police « ${r.style.fontFace} » non autorisée (autorisées : ${c.allowedFonts.join(', ')})`, ctx);
      }
      if (el.style?.fontSize) {
        const [min, max] = r.placeholder?.type === 'title' ? c.fontSizes.title : c.fontSizes.body;
        if (el.style.fontSize < min || el.style.fontSize > max) {
          push('font-size', `Taille ${el.style.fontSize} pt hors de la hiérarchie corporate (${min}–${max} pt)`, ctx);
        }
      }

      if (el.type === 'image') {
        if (opts.assetExists && !opts.assetExists(el.src)) push('missing-asset', `Image introuvable : ${el.src}`, ctx);
        const size = opts.imageSize?.(el.src);
        if (size && size.width > 0 && size.height > 0 && b.h > 0) {
          const ratio = b.w / b.h / (size.width / size.height);
          if (Math.abs(ratio - 1) > 0.02) push('image-distortion', `Image « ${el.id} » déformée de ${Math.round(Math.abs(ratio - 1) * 100)} %`, ctx);
        }
      }
    }
  });
  return out;
}
