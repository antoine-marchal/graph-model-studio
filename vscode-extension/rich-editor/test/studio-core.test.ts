// Markdown Studio document core: pagination, versioned edit rebasing, markers, frontmatter span
// edits, style / master resolution. Run: node --import tsx --test rich-editor/test/studio-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate, type Block } from "../document/paginate";
import { applyChanges, rebaseChanges } from "../../shared/edit-sync";
import { formatMarker, parseMarker, uniqueId } from "../document/markers";
import { readMeta, writeMeta } from "../document/meta";
import { resolveStyleSheet } from "../document/styles";
import { resolveSections, starterMasters } from "../document/masters";
import { parseStudioDocument } from "../document/model";
import { resolvePage } from "../document/schema";

const lines = (top: number, n: number, h = 20, pos = 100) => Array.from({ length: n }, (_, i) => ({ top: top + i * h, bottom: top + (i + 1) * h, pos: pos + i * 10 }));
const text = (top: number, n: number, extra: Partial<Block> = {}): Block => ({ pos: top, top, bottom: top + n * 20, kind: "text", lines: () => lines(top, n, 20, top + 1), ...extra });

test("paragraph longer than a page splits between lines, with widow/orphan control", () => {
  const blocks = [text(0, 4), text(80, 30)]; // 2nd paragraph 600px, page 500px
  const { pages, breaks } = paginate(blocks, [{ contentHeight: 500 }]);
  assert.equal(pages.length, 2);
  assert.equal(breaks[0].kind, "line");
  // 80 + 21 lines * 20 = 500 → lines 0..20 fit, line 21 starts the next page
  assert.equal(breaks[0].at, 80 + 21 * 20);
});

test("widow control keeps two lines on the next page", () => {
  const blocks = [text(0, 1), text(20, 25)]; // 25 lines: 24 fit on 500px page (20+24*20=500)
  const { breaks } = paginate(blocks, [{ contentHeight: 500 }]);
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].at, 20 + 23 * 20, "one line would be a widow: two move");
});

test("a heading at the page end moves with its paragraph (keep with next)", () => {
  const blocks = [text(0, 23), { ...text(460, 1), keepWithNext: true }, text(480, 5)];
  const { breaks } = paginate(blocks, [{ contentHeight: 500 }]);
  assert.equal(breaks[0].kind, "block");
  assert.equal(breaks[0].block, 1);
});

test("a document-wide paragraph does not move forever: it is split", () => {
  const blocks = [text(0, 200)];
  const { pages, overflows } = paginate(blocks, [{ contentHeight: 500 }]);
  assert.equal(pages.length, 8);
  assert.equal(overflows.length, 0);
});

test("oversized unsplittable block lands once on a page top and is reported", () => {
  const blocks: Block[] = [text(0, 2), { pos: 40, top: 40, bottom: 1240, kind: "atomic" }, text(1240, 2)];
  const { pages, overflows, breaks } = paginate(blocks, [{ contentHeight: 500 }]);
  assert.equal(overflows.length, 1);
  assert.equal(overflows[0].block, 1);
  assert.deepEqual(breaks.map((b) => b.block), [1, 2]);
  assert.equal(pages.length, 3);
});

test("tables split between rows and repeat their header rows", () => {
  const rows = [{ top: 0, bottom: 30, pos: 1, header: true }, ...Array.from({ length: 40 }, (_, i) => ({ top: 30 + i * 30, bottom: 60 + i * 30, pos: 10 + i }))];
  const table: Block = { pos: 0, top: 0, bottom: 1230, kind: "table", rows: () => rows };
  const { breaks, pages } = paginate([table], [{ contentHeight: 500 }]);
  assert.ok(breaks.every((b) => b.kind === "row" && b.repeatHeader?.rows === 1));
  // page 2 holds (500-30)/30 = 15 body rows after its repeated header
  assert.equal(breaks[1].at - breaks[0].at, 15 * 30);
  assert.ok(pages.length >= 3);
});

test("explicit page and section breaks start pages; sections change page frames", () => {
  const blocks: Block[] = [text(0, 2), { pos: 40, top: 40, bottom: 40, kind: "sectionBreak" }, text(40, 2), { pos: 80, top: 80, bottom: 80, kind: "pageBreak" }, text(80, 2)];
  const { pages } = paginate(blocks, [{ contentHeight: 500 }, { contentHeight: 300 }]);
  assert.deepEqual(pages.map((p) => [p.section, p.start, p.limit - p.start, p.firstOfSection]), [[0, 0, 500, true], [1, 40, 300, true], [1, 80, 300, false]]);
});

test("rebase: disjoint edits move, overlapping edits conflict", () => {
  const base = "alpha beta gamma";
  const theirs = "ALPHA! beta gamma";
  const mine = [{ start: 11, end: 16, text: "delta" }];
  const rebased = rebaseChanges(base, theirs, mine);
  assert.ok(rebased);
  assert.equal(applyChanges(theirs, rebased!), "ALPHA! beta delta");
  assert.equal(rebaseChanges(base, theirs, [{ start: 2, end: 4, text: "x" }]), null);
});

test("markers: parse, escape, errors are recoverable", () => {
  const m = formatMarker({ kind: "block", props: { id: "intro", style: "Lead--x" } });
  assert.ok(!m.slice(4, -3).includes("--"), "no -- inside the comment");
  const parsed = parseMarker(m);
  assert.deepEqual(parsed && "marker" in parsed ? parsed.marker : null, { kind: "block", props: { id: "intro", style: "Lead--x" } });
  assert.ok(parseMarker('<!-- ms:block {"id": -->') && "error" in parseMarker('<!-- ms:block {"id": -->')!);
  assert.ok("error" in parseMarker("<!-- ms:unknown -->")!);
  assert.equal(parseMarker("<!-- plain comment -->"), null);
  assert.equal(uniqueId("fig", new Set(["fig", "fig-2"])), "fig-3");
});

test("frontmatter: only markdownStudio changes; comments, quoting and other keys stay", () => {
  const src = "---\r\ntitle: 'Q'  # keep\r\nmarkdownStudio:\r\n  version: 1\r\n  # note\r\n  objects:\r\n    a: { type: shape, placement: page, box: { x: 1, y: 2, width: 3, height: 4 } }\r\nz: [1,2]\r\n---\r\nBody\r\n";
  const { meta } = readMeta(src);
  const next = structuredClone(meta!);
  next.objects!.a.box.x = 50;
  const out = writeMeta(src, next);
  assert.ok(out.startsWith("---\r\ntitle: 'Q'  # keep\r\nmarkdownStudio:\r\n  version: 1\r\n  # note\r\n"));
  assert.ok(out.includes("x: 50"));
  assert.ok(out.endsWith("z: [1,2]\r\n---\r\nBody\r\n"));
  assert.ok(!/(^|[^\r])\n/.test(out), "line endings kept");
  assert.equal(writeMeta(src, meta), src, "unchanged meta is a no-op");
  assert.equal(readMeta("---\nmarkdownStudio:\n  version: 9\n---\n").readOnly, true);
});

test("styles: master → basedOn → local overrides, cycles cut, reset restores the master", () => {
  const [body] = starterMasters();
  const sheet = resolveStyleSheet([body], { Lead: { run: { color: "C62828" } } });
  const lead = sheet.styles.get("Lead")!;
  assert.equal(lead.run.color, "C62828");
  assert.equal(lead.origin["run.color"].from, "local");
  assert.equal(lead.run.font, "theme.body", "inherited from Normal through basedOn");
  assert.equal(lead.origin["run.size"].from, "master:studio-body");
  const cyc = resolveStyleSheet([], { A: { type: "paragraph", basedOn: "B" }, B: { type: "paragraph", basedOn: "A" } });
  assert.ok(cyc.diagnostics.some((d) => /based on itself/.test(d)));
});

test("sections: master stories, link to previous, landscape page", () => {
  const masters = new Map(starterMasters().map((m) => [m.id, m]));
  const { sections } = resolveSections({ version: 1, master: "studio-body" }, [{ master: "studio-landscape" }, {}], (id) => masters.get(id));
  assert.equal(sections[0].footers.default?.markdown, "Page {{page}} of {{pages}}");
  assert.equal(sections[1].page.orientation, "landscape");
  assert.ok(sections[1].page.width > sections[1].page.height);
  assert.equal(sections[1].headers.default?.markdown, "Appendix — {{title}}");
  assert.equal(sections[2].storyOrigin, "linked");
  assert.equal(sections[2].headers.default?.markdown, "Appendix — {{title}}");
  assert.equal(resolvePage({ size: "Letter" }).width, 612);
});

test("model: objects, anchors, sections, duplicate ids and broken connectors", () => {
  const src = [
    "---",
    "markdownStudio:",
    "  version: 1",
    "  objects:",
    "    fig: { type: image, placement: anchored, box: { x: 10, y: 0, width: 100, height: 80 } }",
    "    c1: { type: connector, placement: anchored, box: { x: 0, y: 0, width: 0, height: 0 }, from: { id: fig }, to: { id: ghost } }",
    "---",
    "# Title",
    "",
    "<!-- ms:object {\"id\":\"fig\"} -->",
    "![Arch](arch.png)",
    "<!-- ms:endobject -->",
    "",
    "<!-- ms:block {\"id\":\"intro\",\"style\":\"Lead\"} -->",
    "Intro paragraph.",
    "",
    "<!-- ms:block {\"id\":\"intro\"} -->",
    "Again.",
    "",
    "<!-- ms:section {\"master\":\"studio-landscape\"} -->",
    "",
    "Wide.",
  ].join("\n");
  const doc = parseStudioDocument(src);
  const fig = doc.objects.find((o) => o.id === "fig")!;
  assert.equal(fig.body[0].type, "paragraph");
  assert.equal(doc.blocks[fig.anchor].data.msBlock.style, "Lead");
  assert.equal(doc.sections.length, 1);
  assert.equal(doc.title, "Title");
  assert.ok(doc.diagnostics.some((d) => /Duplicate block id "intro"/.test(d.message)));
  assert.ok(doc.diagnostics.some((d) => /missing object "ghost"/.test(d.message)));
  // Marker belongs to its block's source span.
  const intro = doc.blocks[fig.anchor];
  assert.ok(src.slice(intro.position.start.offset, intro.position.end.offset).startsWith("<!-- ms:block"));
});
