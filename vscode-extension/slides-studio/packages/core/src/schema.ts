import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitive tokens                                                    */
/* ------------------------------------------------------------------ */

/**
 * Color value: a theme token (`theme.accent1`, `theme.accent1.lighter40`, `theme.dk2.darker25`)
 * or a literal hex color (`#E50019` / `E50019`). `none` disables a fill or line.
 */
export const ColorValue = z
  .string()
  .regex(/^(none|theme\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)?|#?[0-9a-fA-F]{6})$/, 'couleur invalide (attendu theme.<slot>[.<variante>], #RRGGBB ou none)');
export type ColorValue = z.infer<typeof ColorValue>;

/** Font face: `theme.heading`, `theme.body` or a literal family name. */
export const FontValue = z.string().min(1).max(80);

export const Id = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'identifiant invalide (lettres, chiffres, _ et -, 64 max)');

export const HAlign = z.enum(['left', 'center', 'right', 'justify']);
export const ColAlign = z.enum(['left', 'center', 'right']);
export const VAlign = z.enum(['top', 'middle', 'bottom']);

/** OOXML preset geometries (names are the `prstGeom` presets, exported natively). */
export const ArrowHead = z.enum(['none', 'triangle', 'arrow', 'stealth', 'diamond', 'oval']);
export type ArrowHead = z.infer<typeof ArrowHead>;
/** OOXML `buAutoNum` schemes. */
export const Numbering = z.enum(['arabicPeriod', 'arabicParenR', 'alphaLcPeriod', 'alphaUcPeriod', 'alphaLcParenR', 'romanLcPeriod', 'romanUcPeriod']);
export type Numbering = z.infer<typeof Numbering>;
export const ConnectorSide = z.enum(['auto', 'top', 'right', 'bottom', 'left']);
export type ConnectorSide = z.infer<typeof ConnectorSide>;

export const ShapeKind = z.enum([
  'rect', 'roundRect', 'snip1Rect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'parallelogram', 'trapezoid',
  'pentagon', 'hexagon', 'octagon', 'star5', 'plus', 'donut', 'can', 'cube',
  'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'chevron', 'homePlate',
  'flowChartTerminator', 'flowChartDocument', 'wedgeRectCallout', 'line',
]);
export type ShapeKind = z.infer<typeof ShapeKind>;

/* ------------------------------------------------------------------ */
/* Rich text                                                           */
/* ------------------------------------------------------------------ */

export const TextRun = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: ColorValue.optional(),
});
export type TextRun = z.infer<typeof TextRun>;

export const Paragraph = z.object({
  runs: z.array(TextRun),
  /** `bullet` = unordered list item, `number` = ordered list item. */
  list: z.enum(['bullet', 'number']).optional(),
  /** Indentation level, 0 = first level. */
  level: z.number().int().min(0).max(4).optional(),
  /** Paragraph comes from a Markdown heading (h2–h6) inside a body: rendered bold. */
  heading: z.number().int().min(2).max(6).optional(),
});
export type Paragraph = z.infer<typeof Paragraph>;

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

export const ElementStyle = z
  .object({
    fill: ColorValue.optional(),
    line: ColorValue.optional(),
    /** Line width in points. */
    lineWidth: z.number().min(0).max(50).optional(),
    dash: z.enum(['solid', 'dash', 'dot']).optional(),
    /** Fill transparency, 0 (opaque) – 100 (invisible). */
    transparency: z.number().min(0).max(100).optional(),
    fontFace: FontValue.optional(),
    /** Font size in points. */
    fontSize: z.number().min(4).max(400).optional(),
    color: ColorValue.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    align: HAlign.optional(),
    valign: VAlign.optional(),
    /** Line spacing multiple (1 = single). */
    lineSpacing: z.number().min(0.5).max(4).optional(),
    /** Corner radius in inches (roundRect / snip1Rect corners). */
    radius: z.number().min(0).max(20).optional(),
    /** Bullet character of the element's bulleted list items (overrides the template). */
    bullet: z.string().min(1).max(2).optional(),
    /** Numbering scheme of the element's ordered list items. */
    numbering: Numbering.optional(),
    /** Arrowheads of lines and connectors. */
    startArrow: ArrowHead.optional(),
    endArrow: ArrowHead.optional(),
  })
  .strict();
export type ElementStyle = z.infer<typeof ElementStyle>;

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

/** Where an element was defined in the source file (computed, never persisted). */
export const SourceRef = z.object({
  kind: z.enum(['markdown', 'markdown-frontmatter', 'dsl']),
  startLine: z.number().int(),
  endLine: z.number().int(),
});
export type SourceRef = z.infer<typeof SourceRef>;

const ElementBase = {
  id: Id,
  /** Geometry in inches. Optional when bound to a placeholder (inherited from the layout). */
  x: z.number().min(-50).max(100).optional(),
  y: z.number().min(-50).max(100).optional(),
  w: z.number().min(0).max(100).optional(),
  h: z.number().min(0).max(100).optional(),
  /** Clockwise rotation in degrees. */
  rotation: z.number().min(-360).max(360).optional(),
  /** Explicit stacking order; when absent, document order is used (later = in front). */
  z: z.number().int().min(0).max(10_000).optional(),
  /** Layout placeholder key this element is bound to (`title`, `subtitle`, `body`, `body-2`, `pic`…). */
  placeholder: z.string().min(1).max(64).optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  name: z.string().max(120).optional(),
  style: ElementStyle.optional(),
  source: SourceRef.optional(),
};

export const TextElement = z.object({ ...ElementBase, type: z.literal('text'), paragraphs: z.array(Paragraph) });
export const ShapeElement = z.object({
  ...ElementBase,
  type: z.literal('shape'),
  shape: ShapeKind,
  paragraphs: z.array(Paragraph).optional(),
  flipH: z.boolean().optional(),
  flipV: z.boolean().optional(),
});
export const ImageElement = z.object({
  ...ElementBase,
  type: z.literal('image'),
  /** Path relative to the presentation source file. Remote URLs are rejected. */
  src: z
    .string()
    .min(1)
    .refine((s) => !/^[a-z][a-z0-9+.-]*:/i.test(s) || /^[a-z]:[\\/]/i.test(s), 'URL distante interdite : chemins locaux uniquement'),
  alt: z.string().optional(),
});
/** Per-cell overrides of a table: background, border (all four sides) and text. */
export const CellStyle = z
  .object({
    fill: ColorValue.optional(),
    line: ColorValue.optional(),
    /** Border width in points. */
    lineWidth: z.number().min(0).max(20).optional(),
    dash: z.enum(['solid', 'dash', 'dot']).optional(),
    color: ColorValue.optional(),
    bold: z.boolean().optional(),
  })
  .strict();
export type CellStyle = z.infer<typeof CellStyle>;

/** Free attachment point of a connector end, as fractions of the element box (0,0 = top-left). */
export const AnchorPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export type AnchorPoint = z.infer<typeof AnchorPoint>;

export const TableElement = z.object({
  ...ElementBase,
  type: z.literal('table'),
  rows: z.array(z.array(z.string())).min(1),
  header: z.boolean().optional(),
  /** Horizontal alignment per column (GFM `:---:` in Markdown); null = default. */
  colAlign: z.array(ColAlign.nullable()).optional(),
  /** Relative column widths / row heights (weights, normalised to the box); absent = even. */
  colWidths: z.array(z.number().positive()).optional(),
  rowHeights: z.array(z.number().positive()).optional(),
  /** Cell overrides, parallel to `rows` (null / missing = table default). */
  cellStyles: z.array(z.array(CellStyle.nullable())).optional(),
});

/**
 * Relation between two elements. Its geometry is derived from the connected elements' boxes
 * (it follows them when they move); `x/y/w/h` are ignored.
 */
export const ConnectorElement = z.object({
  ...ElementBase,
  type: z.literal('connector'),
  from: Id,
  to: Id,
  route: z.enum(['straight', 'elbow', 'curved']).optional(),
  fromSide: ConnectorSide.optional(),
  toSide: ConnectorSide.optional(),
  /** Free attachment points on the boxes; take precedence over `fromSide` / `toSide`. */
  fromPoint: AnchorPoint.optional(),
  toPoint: AnchorPoint.optional(),
});

export const SlideElement = z.discriminatedUnion('type', [TextElement, ShapeElement, ImageElement, TableElement, ConnectorElement]);
export type SlideElement = z.infer<typeof SlideElement>;
export type TextElement = z.infer<typeof TextElement>;
export type ShapeElement = z.infer<typeof ShapeElement>;
export type ImageElement = z.infer<typeof ImageElement>;
export type TableElement = z.infer<typeof TableElement>;
export type ConnectorElement = z.infer<typeof ConnectorElement>;
export type ElementType = SlideElement['type'];

/* ------------------------------------------------------------------ */
/* Slides and document                                                 */
/* ------------------------------------------------------------------ */

export const SlideNode = z.object({
  id: Id,
  /** Layout id (or alias) from the corporate master. */
  layout: z.string().min(1),
  notes: z.string().optional(),
  hidden: z.boolean().optional(),
  elements: z.array(SlideElement),
  source: SourceRef.optional(),
});
export type SlideNode = z.infer<typeof SlideNode>;

export const RuleSeverity = z.enum(['error', 'warning', 'off']);
export const ConstraintOverrides = z
  .object({
    rules: z.record(z.string(), RuleSeverity).optional(),
    allowedFonts: z.array(z.string()).optional(),
    extraColors: z.array(z.string().regex(/^#?[0-9a-fA-F]{6}$/)).optional(),
    minMargin: z.number().min(0).max(3).optional(),
  })
  .strict();
export type ConstraintOverrides = z.infer<typeof ConstraintOverrides>;

export const PresentationMetadata = z.object({
  title: z.string().default('Présentation'),
  author: z.string().optional(),
  subject: z.string().optional(),
  /** Text substituted into the corporate footer zone. */
  footer: z.string().optional(),
  /** Text substituted into the corporate date zone. */
  date: z.string().optional(),
});
export type PresentationMetadata = z.infer<typeof PresentationMetadata>;

export const SlideDocument = z.object({
  version: z.literal('1'),
  metadata: PresentationMetadata,
  /** Path to the normalized corporate master (relative to the source file) or `corporate`. */
  masterRef: z.string().min(1),
  themeRef: z.string().min(1),
  dimensions: z.object({ width: z.number().positive(), height: z.number().positive() }),
  constraints: ConstraintOverrides.optional(),
  slides: z.array(SlideNode),
});
export type SlideDocument = z.infer<typeof SlideDocument>;

/* ------------------------------------------------------------------ */
/* Normalized corporate master (design system)                         */
/* ------------------------------------------------------------------ */

export const LevelStyle = z.object({
  fontSize: z.number().optional(),
  color: z.string().optional(),
  bold: z.boolean().optional(),
  bullet: z.object({ char: z.string().optional(), color: z.string().optional(), numbered: z.boolean().optional() }).nullable().optional(),
  marginLeft: z.number().optional(),
  indent: z.number().optional(),
});
export type LevelStyle = z.infer<typeof LevelStyle>;

export const PlaceholderDef = z.object({
  key: z.string(),
  name: z.string(),
  type: z.enum(['title', 'subtitle', 'body', 'pic', 'chart', 'tbl', 'media', 'other']),
  idx: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  style: z.object({
    fontFace: z.string().optional(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: HAlign.optional(),
    valign: VAlign.optional(),
    margin: z.array(z.number()).length(4).optional(),
  }),
  levels: z.array(LevelStyle).optional(),
  prompt: z.string().optional(),
});
export type PlaceholderDef = z.infer<typeof PlaceholderDef>;

/** A static master/layout object in pptx-masters' `defineSlideMaster` object format. */
export const StaticObject = z.object({
  role: z.enum(['logo', 'footer', 'date', 'label', 'decoration', 'text']),
  /** Original pptx-masters object, e.g. `{ rect: {...} }`, `{ text: {...} }`, `{ image: {...} }`. */
  object: z.record(z.string(), z.unknown()),
  assetId: z.string().optional(),
  /** Image crop as fractions of the source (from a:srcRect), when the template crops the picture. */
  crop: z.object({ l: z.number(), t: z.number(), r: z.number(), b: z.number() }).optional(),
});
export type StaticObject = z.infer<typeof StaticObject>;

export const LayoutDef = z.object({
  id: z.string(),
  name: z.string(),
  masterId: z.string(),
  sourcePart: z.string(),
  ooxmlType: z.string().optional(),
  aliases: z.array(z.string()),
  background: z.object({ color: z.string().optional(), assetId: z.string().optional() }),
  placeholders: z.array(PlaceholderDef),
  objects: z.array(StaticObject),
  slideNumber: z.record(z.string(), z.unknown()).nullable(),
  /** Reference rendering of the layout by PowerPoint, relative to the master directory. */
  thumbnail: z.string().optional(),
  warnings: z.array(z.string()),
});
export type LayoutDef = z.infer<typeof LayoutDef>;

export const AssetDef = z.object({
  id: z.string(),
  /** Path relative to the master directory. */
  file: z.string(),
  originalPart: z.string(),
  format: z.string(),
  /** Browser-displayable preview (PNG) for formats such as EMF/WMF, relative to the master directory. */
  preview: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type AssetDef = z.infer<typeof AssetDef>;

export const Constraints = z.object({
  allowedFonts: z.array(z.string()),
  fontSizes: z.object({ title: z.tuple([z.number(), z.number()]), body: z.tuple([z.number(), z.number()]) }),
  palette: z.array(z.string()),
  minMargin: z.number(),
  safeArea: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  aspectRatio: z.number(),
  rules: z.record(z.string(), RuleSeverity),
});
export type Constraints = z.infer<typeof Constraints>;

export const CorporateMaster = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  source: z.object({
    file: z.string(),
    sha256: z.string(),
    importedAt: z.string(),
    extractor: z.object({ name: z.string(), version: z.string() }),
  }),
  dimensions: z.object({ width: z.number(), height: z.number() }),
  theme: z.object({
    colors: z.record(z.string(), z.string()),
    palette: z.record(z.string(), z.record(z.string(), z.string())),
    fonts: z.object({ heading: z.string(), body: z.string() }),
  }),
  masters: z.array(z.object({ id: z.string(), name: z.string(), part: z.string(), layoutIds: z.array(z.string()), primary: z.boolean() })),
  layouts: z.array(LayoutDef),
  assets: z.array(AssetDef),
  fidelity: z.object({ method: z.enum(['native', 'reconstructed', 'flattened']), description: z.string() }),
  unsupported: z.array(z.object({ feature: z.string(), parts: z.array(z.string()), count: z.number(), impact: z.string() })),
  warnings: z.array(z.string()),
  constraints: Constraints,
});
export type CorporateMaster = z.infer<typeof CorporateMaster>;
