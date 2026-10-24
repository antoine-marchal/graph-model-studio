import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { findLayout, validateDocument, type CorporateMaster } from '@corporate-slides/core';
import { discoverTemplates, importTemplate, isUnsafeEntryName, loadPackageSafely, UnsafePackageError } from '@corporate-slides/master-extractor';
import { applyMutations, parseSource } from '@corporate-slides/parser';
import { BlockingDiagnosticsError, exportPptx, validatePackage } from '@corporate-slides/pptx-generator';

const root = resolve(import.meta.dirname, '../..');
const ws = join(root, 'tests/.tmp/integration-ws');
const TEMPLATE = join(root, 'assets/corporate/original-template.pptx');
let master: CorporateMaster;
let templateHash: string;

beforeAll(async () => {
  templateHash = createHash('sha256').update(readFileSync(TEMPLATE)).digest('hex');
  rmSync(ws, { recursive: true, force: true });
  mkdirSync(ws, { recursive: true });
  // CSS_RENDERER is left untouched: EMF previews use local Windows APIs when available.
  ({ master } = await importTemplate(TEMPLATE, ws, { thumbnails: false }));
}, 300_000);

describe('master extraction (real corporate template)', () => {
  it('discovers the deposited template in the workspace', async () => {
    const found = await discoverTemplates(root);
    expect(found.some((f) => f.endsWith('original-template.pptx'))).toBe(true);
  });

  it('never modifies the original template', () => {
    expect(createHash('sha256').update(readFileSync(TEMPLATE)).digest('hex')).toBe(templateHash);
    expect(master.source.sha256).toBe(templateHash);
  });

  it('detects masters, layouts and their relationships', () => {
    expect(master.masters).toHaveLength(2);
    expect(master.layouts).toHaveLength(75);
    expect(master.masters.find((m) => m.primary)?.part).toBe('ppt/slideMasters/slideMaster2.xml');
    for (const l of master.layouts) expect(master.masters.some((m) => m.id === l.masterId && m.layoutIds.includes(l.id))).toBe(true);
    expect(new Set(master.layouts.map((l) => l.id)).size).toBe(75);
  });

  it('extracts theme colors and fonts', () => {
    expect(master.theme.colors).toMatchObject({ dk1: '262626', dk2: 'E50019', accent1: '3E4A83' });
    expect(master.theme.fonts).toEqual({ heading: 'Arial Black', body: 'Arial' });
    expect(master.theme.palette.accent1?.lighter40).toBe('7E8AC2');
    expect(master.dimensions).toEqual({ width: 13.3333, height: 7.5 });
  });

  it('creates usable layout definitions with stable placeholder keys and aliases', () => {
    const content = findLayout(master, 'content')!;
    expect(content.placeholders.map((p) => p.key)).toEqual(['title', 'body']);
    const two = findLayout(master, 'two-columns')!;
    expect(two.placeholders.filter((p) => p.type === 'body')).toHaveLength(2);
    expect(findLayout(master, 'title')!.placeholders.map((p) => p.key)).toContain('subtitle');
    const body = content.placeholders.find((p) => p.key === 'body')!;
    // corporate bullets resolved from the master text styles (level 1 has none, level 2+ use the red square)
    expect(body.levels?.[0]?.bullet).toBeNull();
    expect(body.levels?.[1]?.bullet).toMatchObject({ char: '■', color: 'E50019' });
  });

  it('extracts master assets with browser previews and crop information', () => {
    expect(master.assets.length).toBeGreaterThanOrEqual(10);
    for (const a of master.assets) expect(existsSync(join(ws, '.corporate-slides/master', a.file))).toBe(true);
    const cropped = master.layouts.flatMap((l) => l.objects).filter((o) => o.crop);
    expect(cropped.length).toBeGreaterThan(0);
    if (process.platform === 'win32') expect(master.assets.filter((a) => a.format === 'emf').every((a) => a.preview)).toBe(true);
  });

  it('reports unsupported features instead of dropping them silently', () => {
    const features = master.unsupported.map((u) => u.feature);
    // Grouped shapes are flattened into the layouts since 48ecb346: no longer an unsupported feature.
    expect(features.some((f) => f.includes('groupées'))).toBe(false);
    expect(features.some((f) => f.includes('EMF'))).toBe(true);
    expect(master.fidelity.method).toBe('reconstructed');
    const report = readFileSync(join(ws, '.corporate-slides/master/compatibility-report.md'), 'utf8');
    expect(report).toContain('Définitions de masques reconstruites | **oui**');
  });

  it('writes all expected artifacts', () => {
    for (const f of ['corporate-master.json', 'theme.json', 'layouts.json', 'generated-masters.ts', 'extraction-report.md', 'compatibility-report.md', 'slide-masters.md', 'style-guide.md']) {
      expect(existsSync(join(ws, '.corporate-slides/master', f)), f).toBe(true);
    }
  });
});

describe('untrusted package safety', () => {
  it('rejects path traversal entry names', () => {
    expect(isUnsafeEntryName('../evil.xml')).toBe(true);
    expect(isUnsafeEntryName('ppt/../../x')).toBe(true);
    expect(isUnsafeEntryName('C:/Windows/x')).toBe(true);
    expect(isUnsafeEntryName('ppt/slides/slide1.xml')).toBe(false);
  });
  it('refuses a ZIP containing traversal entries', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('ppt/presentation.xml', '<p:presentation/>');
    zip.file('../../evil.txt', 'x');
    const p = join(ws, 'evil.pptx');
    writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }));
    await expect(loadPackageSafely(p)).rejects.toBeInstanceOf(UnsafePackageError);
  });
});

describe('PPTX export of the example presentations', () => {
  const masterDir = () => join(ws, '.corporate-slides/master');

  async function build(example: string, out: string) {
    const text = readFileSync(join(root, example), 'utf8');
    const { doc, errors } = parseSource(text, example.endsWith('.md') ? 'markdown' : 'dsl', { dimensions: master.dimensions });
    expect(errors).toEqual([]);
    const output = join(ws, out);
    const report = await exportPptx(doc, master, { output, masterDir: masterDir(), sourceDir: join(root, 'examples/corporate-demo') });
    return { doc, report, buffer: readFileSync(output) };
  }

  it('produces a valid, native, corporate PPTX from Markdown', async () => {
    const { doc, report, buffer } = await build('examples/corporate-demo/deck.slides.md', 'deck.pptx');
    const pkg = await validatePackage(buffer);
    expect(pkg.ok).toBe(true);
    expect(pkg.slideCount).toBe(doc.slides.length);
    expect(pkg.slideSize).toEqual({ cx: 12191970, cy: 6858000 });
    // native editable text and shapes (no flattening)
    expect(report.stats.flattened).toHaveLength(0);
    expect(report.stats.nativeShapes).toBe(5);
    expect(pkg.slides[3]!.texts.join(' ')).toContain('PLM');
    expect(pkg.slides[0]!.texts).toContain('Architecture PLM / MES / ERP');
    expect(pkg.slides.every((s) => s.placeholders > 0)).toBe(true);
    expect(pkg.slides[4]!.tables).toBe(1);

    const zip = await JSZip.loadAsync(buffer);
    // layout selection: each slide points at a reconstructed layout named after the corporate layout id
    const layoutNames = await Promise.all(
      pkg.slides.map(async (s) => /<p:cSld name="([^"]+)"/.exec(await zip.file(`ppt/slideLayouts/${s.layout}`)!.async('string'))![1]),
    );
    expect(layoutNames).toEqual(['diapositive-de-titre', 'titre-et-contenu', 'deux-contenus', 'titre-seul', 'titre-et-contenu', 'fin']);
    // corporate theme colors and fonts
    const theme = await zip.file('ppt/theme/theme1.xml')!.async('string');
    expect(theme).toContain('<a:srgbClr val="E50019"/>');
    expect(theme).toContain('<a:latin typeface="Arial Black"');
    // EMF content type fix and no media collisions
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('Extension="emf"');
    expect(Object.keys(zip.files).some((f) => /media\/layout-image-\d/.test(f))).toBe(false);
    // footer metadata applied
    expect(Object.values(pkg.slides).length).toBe(6);
    expect(report.compatibilityFixes.some((f) => f.includes('collision'))).toBe(true);
  });

  it('produces a valid PPTX from the DSL with exact geometry', async () => {
    const { buffer } = await build('examples/corporate-demo/architecture.slides.yaml', 'architecture.pptx');
    const zip = await JSZip.loadAsync(buffer);
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    // plm-box: x 1.0 in, y 2.0 in, w 3.2 in, h 1.1 in → EMU
    expect(slide1).toContain('<a:off x="914400" y="1828800"/>');
    expect(slide1).toContain('<a:ext cx="2926080" cy="1005840"/>');
    expect(slide1).toContain('prst="roundRect"');
  });

  it('visual edits flow into the generated PPTX', async () => {
    const text = readFileSync(join(root, 'examples/corporate-demo/architecture.slides.yaml'), 'utf8');
    const edited = applyMutations(text, 'dsl', [{ kind: 'updateElement', slideId: 'architecture-overview', elementId: 'plm-box', patch: { x: 2, style: { fill: 'theme.accent3' } } }]);
    const { doc } = parseSource(edited, 'dsl', { dimensions: master.dimensions });
    const output = join(ws, 'edited.pptx');
    await exportPptx(doc, master, { output, masterDir: masterDir(), sourceDir: join(root, 'examples/corporate-demo') });
    const slide1 = await (await JSZip.loadAsync(readFileSync(output))).file('ppt/slides/slide1.xml')!.async('string');
    expect(slide1).toContain('<a:off x="1828800" y="1828800"/>');
    expect(slide1).toContain('FFCD31');
  });

  it('exports nested groups as native groups and rich text formats', async () => {
    const layout = master.layouts.find((l) => l.placeholders.some((p) => p.type === 'title'))!.id;
    const dsl = [
      'slides:',
      '  - id: a',
      `    layout: ${layout}`,
      '    elements:',
      '      - { id: a1, type: shape, shape: rect, x: 1, y: 1, w: 1, h: 1, group: cards/left }',
      '      - { id: a2, type: shape, shape: rect, x: 2.5, y: 1, w: 1, h: 1, group: cards/left }',
      '      - { id: b1, type: shape, shape: ellipse, x: 5, y: 1, w: 1, h: 1, group: cards }',
      '      - id: t',
      '        type: text',
      '        x: 1',
      '        y: 4',
      '        w: 6',
      '        h: 2',
      '        paragraphs:',
      '          - { align: center, spaceAfter: 6, runs: [{ text: S, strike: true, font: Courier New, highlight: "#FFFF00" }, { text: "2", baseline: super }] }',
      '      - { id: love, type: shape, shape: heart, x: 8, y: 1, w: 1, h: 1 }',
      '      - { id: free, type: shape, shape: custom, x: 9.5, y: 1, w: 1, h: 1, geometry: { paths: [{ w: 100, h: 100, d: "M 0 100 L 50 0 C 60 10 90 40 100 100 Z" }] } }',
      '      - { id: grid, type: table, x: 8, y: 3, w: 4, h: 2, rows: [[A, ""], ["1", "2"]], merges: [{ r: 0, c: 0, rs: 1, cs: 2 }] }',
    ].join('\n');
    const { doc, errors } = parseSource(dsl, 'dsl', { dimensions: master.dimensions });
    expect(errors).toEqual([]);
    const output = join(ws, 'groups.pptx');
    await exportPptx(doc, master, { output, masterDir: masterDir(), sourceDir: ws, force: true });
    const xml = await (await JSZip.loadAsync(readFileSync(output))).file('ppt/slides/slide1.xml')!.async('string');
    // cards ⊃ left ⊃ (a1, a2), cards ⊃ b1; children are group-relative.
    expect(xml).toMatch(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="cards"[\s\S]*<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="left"/);
    expect(xml.match(/<p:grpSp>/g)).toHaveLength(2);
    expect(xml).toContain('<a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/>');
    expect(xml).toContain('algn="ctr"');
    expect(xml).toContain('strike="sngStrike"');
    expect(xml).toContain('baseline="30000"');
    expect(xml).toContain('typeface="Courier New"');
    expect(xml).toMatch(/<a:highlight><a:srgbClr val="FFFF00"/);
    expect(xml).toContain('prst="heart"');
    expect(xml).toMatch(/<a:custGeom>[\s\S]*<a:cubicBezTo>/);
    expect(xml).toContain('gridSpan="2"');
  });

  it('exports preset shapes, corner radius and glued connectors natively', async () => {
    const layout = master.layouts.find((l) => l.placeholders.some((p) => p.type === 'title'))!.id;
    const dsl = [
      'slides:',
      '  - id: a',
      `    layout: ${layout}`,
      '    elements:',
      '      - { id: db, type: shape, shape: can, x: 1, y: 2, w: 1.5, h: 2 }',
      '      - { id: svc, type: shape, shape: roundRect, x: 5, y: 2.5, w: 3, h: 1, style: { radius: 0.25 } }',
      '      - { id: hex, type: shape, shape: hexagon, x: 5, y: 5, w: 2, h: 1.5 }',
      '      - { id: link, type: connector, from: svc, to: db, route: elbow, style: { startArrow: oval } }',
      '      - { id: down, type: connector, from: svc, to: hex, route: straight }',
    ].join('\n');
    const { doc, errors } = parseSource(dsl, 'dsl', { dimensions: master.dimensions });
    expect(errors).toEqual([]);
    const output = join(ws, 'shapes.pptx');
    await exportPptx(doc, master, { output, masterDir: masterDir(), sourceDir: ws, force: true });
    const xml = await (await JSZip.loadAsync(readFileSync(output))).file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('prst="can"');
    expect(xml).toContain('prst="hexagon"');
    // radius 0.25 in on a 1 in high box → adj 25000
    expect(xml).toMatch(/prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 25000"\/>/);
    expect(xml).toContain('prst="bentConnector3"');
    expect(xml).toContain('prst="straightConnector1"');
    expect(xml).toMatch(/<p:cxnSp>[\s\S]*<a:stCxn id="\d+" idx="1"\/>/);
    expect(xml).toContain('<a:headEnd type="oval"');
    expect(xml).toContain('<a:tailEnd type="triangle"');
  });

  it('exports a layout designed like a slide: shapes, tables, master pictures and new placeholders in the slide layout', async () => {
    const base = master.layouts.find((l) => l.placeholders.some((p) => p.type === 'title'))!;
    const logo = master.assets.find((a) => /\.(png|jpe?g)$/i.test(a.file)) ?? master.assets[0]!;
    const designed = {
      ...base,
      objects: [
        ...base.objects,
        { role: 'decoration' as const, object: { element: { id: 'star', type: 'shape', shape: 'star5', x: 11, y: 0.3, w: 1, h: 1, style: { fill: 'theme.accent2' } } } },
        { role: 'text' as const, object: { element: { id: 'kpis', type: 'table', x: 8, y: 5, w: 4, h: 1, rows: [['KPI', 'Valeur'], ['Délai', '3 j']] } } },
        { role: 'logo' as const, object: { element: { id: 'brand', type: 'image', src: `@master/${logo.id}`, x: 0.3, y: 6.5, w: 1, h: 0.5 } } },
      ],
      placeholders: [...base.placeholders, { key: 'body-9', name: 'body-9', type: 'body' as const, x: 1, y: 2, w: 5, h: 3, style: {}, prompt: 'Cliquez ici' }],
    };
    const m2 = { ...master, layouts: master.layouts.map((l) => (l.id === base.id ? designed : l)) };
    const { doc } = parseSource(`slides:\n  - id: a\n    layout: ${base.id}\n    elements: []\n`, 'dsl', { dimensions: master.dimensions });
    const output = join(ws, 'designed-layout.pptx');
    await exportPptx(doc, m2, { output, masterDir: masterDir(), sourceDir: ws, force: true });
    const buffer = readFileSync(output);
    expect((await validatePackage(buffer)).ok).toBe(true);
    const zip = await JSZip.loadAsync(buffer);
    const layouts = await Promise.all(Object.keys(zip.files).filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')));
    const xml = layouts.find((x) => x.includes(`name="${base.id}"`))!;
    expect(xml).toContain('prst="star5"');
    expect(xml).toContain('<a:tbl>');
    expect(xml).toContain('Délai');
    expect(xml).toMatch(/<p:pic>/);
    expect(xml).toContain('Cliquez ici');
  });

  it('blocks export on corporate errors unless forced', async () => {
    const { doc } = parseSource('slides:\n  - id: a\n    layout: does-not-exist\n    elements: []\n', 'dsl', { dimensions: master.dimensions });
    await expect(exportPptx(doc, master, { output: join(ws, 'x.pptx'), masterDir: masterDir(), sourceDir: ws })).rejects.toBeInstanceOf(BlockingDiagnosticsError);
  });
});

describe('corporate design validation', () => {
  it('flags off-palette colors, fonts, bounds, logo overlap, overflow and missing titles; overrides apply', () => {
    const src = `presentation:
  title: Test
slides:
  - id: s1
    layout: content
    elements:
      - id: body
        placeholder: body
        content: ${JSON.stringify('mot '.repeat(900))}
      - id: off
        type: shape
        shape: rect
        x: 12.9
        y: 7
        w: 2
        h: 1
        style:
          fill: '#00FF00'
          fontFace: Comic Sans MS
          fontSize: 120
      - id: logo-hit
        type: shape
        shape: rect
        x: 0.2
        y: 6.9
        w: 0.6
        h: 0.5
`;
    const { doc } = parseSource(src, 'dsl', { dimensions: master.dimensions });
    const rules = new Set(validateDocument(doc, master).map((d) => d.rule));
    for (const r of ['title-required', 'overflow', 'palette', 'font', 'font-size', 'bounds', 'logo-overlap']) expect(rules, r).toContain(r);
    const relaxed = validateDocument({ ...doc, constraints: { rules: { palette: 'off' }, extraColors: [] } }, master).map((d) => d.rule);
    expect(relaxed).not.toContain('palette');
    // the corporate master itself was not modified by the override
    expect(master.constraints.rules.palette).toBe('warning');
  });
});
