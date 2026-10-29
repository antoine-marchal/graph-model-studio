// Browser checks of the built Markdown Studio webview (dist/rich-editor) against a stub host that
// implements the versioned edit protocol. Run after `pnpm run build:rich-editor`:
//   npx tsx rich-editor/test/studio.browser.ts [--shots <dir>]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium, fixtureDir, listen, open as openDoc, origin, server, state } from "./studio.harness";

const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : "";

const para = (i: number) => `Paragraph ${i}: ${"Revenue grew steadily while costs stayed flat and the platform team shipped ahead of schedule. ".repeat(4)}`;
const ROWS = Array.from({ length: 60 }, (_, i) => `| R${i} | ${i * 3} |`).join("\n");
const DOC = [
  "---",
  "title: Report # keep",
  "custom: { keep: true }",
  "---",
  "",
  "# Report",
  "",
  "* star bullets stay",
  "* second",
  "",
  "Some __underscore bold__ and *star emphasis* stay as written.",
  "",
  ...Array.from({ length: 24 }, (_, i) => para(i) + "\n"),
  "## Table",
  "",
  "| Row | Value |",
  "|-----|------:|",
  ROWS,
  "",
  "```js",
  "const x  =  1;   // spacing kept",
  "```",
  "",
  "Last paragraph.",
  "",
].join("\n");

const open = openDoc;

const docOf = (p: any): Promise<string> => p.evaluate(() => (window as any).__doc.text as string);
const editsOf = (p: any): Promise<number> => p.evaluate(() => (window as any).__edits.length as number);
const pmSel = (p: any) => p.evaluate(() => {
  const ed = (document.querySelector(".ProseMirror") as any).editor;
  const s = ed.state.selection;
  let inObject = false;
  for (let d = s.$from.depth; d > 0; d--) if (s.$from.node(d).type.name === "msObject") inObject = true;
  return { type: s.toJSON().type as string, from: s.from as number, to: s.to as number, editing: (window as any).__studio.get().editingObject as string | null, parentText: s.$from.parent.textContent as string, inObject };
});
/** Page index and offset (paper px) of the first object's top-left corner. */
const objectPlace = (p: any) => p.evaluate(() => {
  const L = (window as any).__studio.get().layout;
  const top = parseFloat(document.querySelector<HTMLElement>(".ms-object")!.style.top);
  const page = L.pages.findIndex((q: any) => top >= q.top && top < q.top + q.height + 28);
  return { page, off: top - L.pages[page].top, pageTops: L.pages.map((q: any) => q.top) as number[], objects: document.querySelectorAll(".ms-object").length };
});

/**
 * Drag the selected object so its top lands `off` px below the top of page `page`, scrolling the
 * canvas with the wheel while the button is held (the pointer stays away from the auto-scroll edges).
 */
async function dragObjectTo(p: any, page: number, off: number, zoom: number) {
  const at = await objectPlace(p);
  const frame = p.locator(".ms-sel-frame");
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  const x = box.x + 30;
  let y = box.y + 10;
  await p.mouse.move(x, y);
  await p.mouse.down();
  let left = (at.pageTops[page] + off - (at.pageTops[at.page] + at.off)) * zoom;
  while (Math.abs(left) > 0.5) {
    const step = Math.sign(left) * Math.min(Math.abs(left), 60);
    if (y + step > 850 || y + step < 300) await p.mouse.wheel(0, step), await p.waitForTimeout(30);
    else (y += step), await p.mouse.move(x, y);
    left -= step;
  }
  await p.mouse.move(x, y + 0.01);
  await p.mouse.up();
  await p.waitForTimeout(1500);
}

async function regressions(browser: any) {
  const body = ["# Report", "", ...Array.from({ length: 30 }, (_, i) => para(i).slice(0, 320) + "\n")].join("\n");

  // `::: id` groups: header / placeholder text stays out of the flow, a block group takes its
  // frontmatter style; unchanged groups are written back byte for byte.
  {
    const doc = ["---", "markdownStudio:", "  version: 2", "  blocks:", "    intro: { style: Caption, align: center }", "  placeholders: [ client ]", "  headers:", "    default: { id: header }", "---", "",
      "::: header", "ACME {{page}}", ":::", "", "::: client", "Contoso", ":::", "", "# Title", "", "::: intro", "Lead text", ":::", "", "tail", ""].join("\n");
    const { p, errors } = await open(browser, doc);
    assert.equal(await p.locator(".ProseMirror p", { hasText: /ACME|Contoso/ }).count(), 0, "header and placeholder text not in the flow");
    assert.match(await p.locator(".ms-story-headers").first().innerText(), /ACME 1/, "header from its group, fields filled");
    assert.match((await p.locator(".ProseMirror p", { hasText: "Lead text" }).getAttribute("class")) ?? "", /ms-s-Caption/, "group style applied");
    await p.locator(".ProseMirror p", { hasText: "tail" }).click();
    await p.waitForTimeout(200);
    await p.keyboard.press("End");
    await p.keyboard.type("Z");
    await p.waitForTimeout(800);
    assert.equal(await docOf(p), doc.replace("tail\n", "tailZ\n"), "only the edited block changes");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Page / section breaks: empty `::: id` groups described in `breaks` (older markers rewritten).
  {
    const { p, errors } = await open(browser, '# Doc\n\nOne\n\n<!-- ms:pagebreak -->\n\nTwo\n\n<!-- ms:section {"orientation":"landscape"} -->\n\nThree\n');
    await p.locator(".ProseMirror p", { hasText: "Three" }).click();
    await p.waitForTimeout(200);
    await p.keyboard.press("End");
    await p.keyboard.press("Control+Enter");
    await p.keyboard.type("Four");
    await p.waitForTimeout(900);
    const text = await docOf(p);
    assert.ok(!text.includes("<!-- ms:"), `no markers left: ${JSON.stringify(text)}`);
    assert.match(text, /breaks:\n\s+pagebreak: \{ page: true \}\n\s+section: \{ orientation: landscape \}\n\s+pagebreak-2: \{ page: true \}/, `breaks described by id: ${JSON.stringify(text)}`);
    assert.match(text, /One\n\n::: pagebreak\n:::\n\nTwo\n\n::: section\n:::\n\nThree\n\n::: pagebreak-2\n:::\n\nFour\n$/, "breaks are empty groups in the body");
    assert.equal(await p.evaluate(() => document.querySelectorAll(".ms-page").length), 4, "three breaks paginate");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // CRLF document (VS Code keeps it CRLF and echoes the text back): typing in a table cell or a
  // text box keeps the caret there.
  {
    const doc = ["# Doc", "", "Intro paragraph.", "", "| A | B |", "| --- | --- |", "| one | two |", "", "after table", ""].join("\r\n");
    const { p } = await open(browser, doc, { height: 900 });
    await p.evaluate(() => ((window as any).__crlf = true));
    await p.locator(".ProseMirror td", { hasText: "one" }).click();
    await p.waitForTimeout(200);
    await p.keyboard.press("End");
    for (const ch of "xyz") (await p.keyboard.type(ch), await p.waitForTimeout(250));
    await p.waitForTimeout(1000);
    assert.equal((await pmSel(p)).parentText, "onexyz", "caret still in the table cell");
    await p.locator(".ProseMirror p", { hasText: "Intro" }).click();
    await p.getByTestId("tab-insert").click();
    await p.getByRole("button", { name: "Text box" }).click();
    await p.waitForTimeout(800);
    const box = (await p.locator(".ms-object").first().boundingBox())!;
    await p.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await p.keyboard.type("Hi");
    await p.waitForTimeout(1200);
    assert.ok(/^::: textbox\r\n.*Hi.*\r\n:::/m.test(await docOf(p)) && (await pmSel(p)).inObject, "caret still in the text box, CRLF kept");
    await p.close();
  }

  // A block image splits its paragraph on load: editing elsewhere must not write it twice (or add
  // blank lines), across several edits and host round trips.
  {
    const fm = "---\nmarkdownStudio:\n  version: 2\n  blocks:\n    cap: { style: Caption }\n---\n\n";
    const { p, errors } = await open(browser, `${fm}# Doc\n\n![](bad.png)\n\n::: cap\nFigure 1: x\n:::\n\ntail\n`);
    await p.locator(".ProseMirror p", { hasText: "tail" }).click();
    await p.waitForTimeout(200);
    await p.keyboard.press("End");
    for (let i = 0; i < 3; i++) {
      await p.keyboard.type("z");
      await p.waitForTimeout(700);
      await p.evaluate(() => (window as any).__external((window as any).__doc.text));
      await p.waitForTimeout(300);
    }
    assert.equal(await docOf(p), `${fm}# Doc\n\n![](bad.png)\n\n::: cap\nFigure 1: x\n:::\n\ntailzzz\n`, "image written once, group kept");
    assert.deepEqual(errors.filter((e) => !/bad\.png/.test(e)), []);
    await p.close();
  }

  // Enter after a caption starts a Normal paragraph; empty styled paragraphs leave no orphan marker;
  // stacked markers (from older files) style the next block instead of showing as HTML blocks.
  {
    const { p } = await open(browser, "# Doc\n\n<!-- ms:block {\"style\":\"Caption\"} -->\n<!-- ms:block {\"style\":\"Caption\"} -->\nFigure 1: x\n\ntail\n");
    assert.equal(await p.locator(".ProseMirror .raw-html-block, .ProseMirror [data-type=rawHtml]").count(), 0, "stacked markers are not HTML blocks");
    await p.locator(".ProseMirror p", { hasText: "Figure" }).click();
    await p.waitForTimeout(200);
    await p.keyboard.press("End");
    for (let i = 0; i < 3; i++) await p.keyboard.press("Enter");
    await p.keyboard.type("q");
    await p.waitForTimeout(800);
    const text = await docOf(p);
    // Old markers are rewritten as a `::: id` group, its style in the frontmatter.
    assert.ok(/\n::: caption\nFigure 1: x\n:::\n\nq\n\ntail\n$/.test(text) && /blocks:\n\s+caption: \{ style: Caption \}/.test(text) && !text.includes("ms:block"), `next paragraph is Normal, no orphan marker: ${JSON.stringify(text)}`);
    // Ribbon tabs and buttons keep the caret: typing continues in the text.
    await p.getByTestId("tab-insert").click();
    await p.keyboard.type("r");
    await p.waitForTimeout(600);
    assert.ok((await docOf(p)).includes("\nqr\n"), "typing after a ribbon click goes on in the text");
    // A text box gets deselected by a click in the text.
    await p.getByRole("button", { name: "Text box" }).click();
    await p.waitForTimeout(500);
    await p.locator(".ProseMirror p", { hasText: "tail" }).click();
    await p.waitForTimeout(300);
    assert.deepEqual(await p.evaluate(() => (window as any).__studio.get().selection), [], "click in the text deselects the object");
    await p.close();
  }

  // Moving an object across pages at several zooms, scrolling while dragging: it lands where it
  // was dropped (no jump to another page), keeps its identity, one edit per gesture.
  for (const zoom of [0.75, 1.5]) {
    const { p, errors } = await open(browser, body, { width: 1600, height: 1000 });
    await p.locator(".ProseMirror p", { hasText: "Paragraph 3:" }).click();
    await p.getByRole("tab", { name: "Insert" }).click();
    await p.getByRole("button", { name: "Text box" }).click();
    await p.waitForTimeout(600);
    await p.evaluate((z: number) => (window as any).__studio.set({ zoom: z }), zoom);
    await p.waitForTimeout(600);
    for (const [page, off] of [[0, 500], [1, 60], [2, 400], [0, 200]] as const) {
      const before = await editsOf(p);
      await dragObjectTo(p, page, off, zoom);
      const at = await objectPlace(p);
      assert.equal(at.page, page, `zoom ${zoom}: dropped on page ${page + 1}`);
      assert.ok(Math.abs(at.off - off) < 6, `zoom ${zoom}: dropped ${off}px down page ${page + 1} (got ${at.off.toFixed(1)})`);
      assert.equal(at.objects, 1, "one object");
      assert.equal((await editsOf(p)) - before, 1, "one edit per move (drop and re-anchoring together)");
      assert.equal((await pmSel(p)).type, "node", "the moved object stays selected");
    }
    const text = await docOf(p);
    assert.equal((text.match(/^::: textbox$/gm) ?? []).length, 1, "one object group");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Text box and shape: click selects, double-click edits inside (never the anchor paragraph),
  // mouse selection does not move the object, ribbon formats the selection, Escape steps out.
  for (const kind of ["textbox", "shape"] as const) {
    const { p, errors } = await open(browser, body, { width: 1500, height: 1000 });
    await p.locator(".ProseMirror p", { hasText: "Paragraph 1:" }).click();
    await p.getByRole("tab", { name: "Insert" }).click();
    if (kind === "textbox") await p.getByRole("button", { name: "Text box" }).click();
    else await p.getByRole("button", { name: "Shapes" }).click(), await p.locator(".menu button").first().click();
    await p.waitForTimeout(600);
    const obj = p.locator(".ms-object").first();
    const b = await obj.boundingBox();
    await p.mouse.dblclick(b.x + 20, b.y + 12);
    await p.waitForTimeout(300);
    let sel = await pmSel(p);
    assert.equal(sel.editing, kind, `${kind}: double-click edits its text`);
    await p.keyboard.type("Hello world");
    const objPos = await p.evaluate((id: string) => { let at = -1; (document.querySelector(".ProseMirror") as any).editor.state.doc.forEach((n: any, pos: number) => n.attrs.id === id && (at = pos)); return at; }, kind);
    sel = await pmSel(p);
    assert.ok(sel.from > objPos && (await obj.innerText()).includes("Hello world"), `${kind}: typing goes into the object`);
    const t = await obj.boundingBox();
    await p.mouse.move(t.x + 6, t.y + 12);
    await p.mouse.down();
    await p.mouse.move(t.x + 60, t.y + 12, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    assert.equal((await obj.boundingBox()).y, t.y, `${kind}: selecting text does not move the object`);
    await p.keyboard.press("Shift+End");
    await p.waitForTimeout(150); // selectionchange reaches ProseMirror asynchronously
    await p.waitForFunction(() => { const s = (document.querySelector(".ProseMirror") as any).editor.state.selection; return s.to > s.from; });
    await p.getByRole("tab", { name: "Home" }).click();
    await p.getByTestId("bold").click();
    assert.match(await obj.innerHTML(), /<strong>Hello world/, `${kind}: ribbon bold applies inside`);
    assert.equal((await pmSel(p)).editing, kind, `${kind}: still editing after the ribbon command`);
    await p.waitForTimeout(150);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    sel = await pmSel(p);
    assert.ok(sel.type === "node" && sel.editing === null, `${kind}: Escape leaves the text to the object`);
    await p.waitForTimeout(800);
    assert.match(await docOf(p), /^::: [a-z]+\n\*\*Hello world[^\n]*\n:::$/m, `${kind}: text saved in the object body`);
    assert.doesNotMatch(await docOf(p), /Hello worldParagraph/, "anchor paragraph untouched");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // GMC: /gmc inserts exactly one diagram; selected, it gets the ribbon Position menu and the
  // inspector's diagram fields; float, move, fix and back in line keep one editable fence.
  {
    const { p, errors } = await open(browser, body.split("\n").slice(0, 20).join("\n"), { width: 1600, height: 1000 });
    await p.locator(".ProseMirror p", { hasText: "Paragraph 2:" }).click();
    await p.keyboard.press("End");
    await p.keyboard.press("Enter");
    await p.keyboard.type("/gmc");
    await p.waitForTimeout(300);
    await p.keyboard.press("Enter");
    await p.waitForTimeout(1500);
    const fences = async () => ((await docOf(p)).match(/```gmc/g) ?? []).length;
    assert.equal(await fences(), 1, "/gmc inserts one diagram");
    await p.locator(".gmc-block-preview").first().click();
    await p.locator(".inspector").getByText("Edit diagram").waitFor();
    await p.getByTestId("tab-format").click();
    const position = p.locator(".ribbon").getByRole("button", { name: "Position", exact: true });
    assert.equal(await position.isEnabled(), true, "Position available for a selected diagram");
    await position.click();
    await p.getByRole("menuitem", { name: "Floating, moves with text" }).click();
    await p.waitForTimeout(800);
    const f = await p.locator(".ms-sel-frame").boundingBox();
    await p.mouse.move(f.x + 40, f.y + 20);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(f.x + 40, f.y + 20 + i * 25);
    await p.mouse.up();
    await p.waitForTimeout(1200);
    await position.click();
    await p.getByRole("menuitem", { name: "Fixed on the page" }).click();
    await p.waitForTimeout(600);
    await position.click();
    await p.getByRole("menuitem", { name: "In line with text" }).click();
    await p.waitForTimeout(1200);
    assert.equal(await fences(), 1, "still one diagram");
    assert.equal(await p.locator(".gmc-block-wrapper").count(), 1, "one diagram view");
    assert.doesNotMatch(await docOf(p), /^::: (shape|textbox|image)/m, "back in line: no object left");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Footer: selecting its text with the mouse keeps it in edit; the ribbon formats the footer, not the body.
  {
    const doc = ["---", "markdownStudio:", "  version: 1", "  footers:", "    default:", '      markdown: "Confidential {{page}}"', "---", body].join("\n");
    const { p, errors } = await open(browser, doc, { width: 1500, height: 1100 });
    const footer = p.locator(".ms-story-footers").first();
    await footer.scrollIntoViewIfNeeded();
    const fb = await footer.boundingBox();
    await p.mouse.dblclick(fb.x + 40, fb.y + fb.height / 2);
    const ta = p.locator(".ms-story-editor .ms-story-input");
    await ta.waitFor();
    await p.waitForFunction(() => /Confidential/.test(document.querySelector(".ms-story-input")?.textContent ?? ""));
    // Past the double-click interval: the drag is not a triple click (paragraph selection).
    await p.waitForTimeout(700);
    const tb = await ta.boundingBox();
    await p.mouse.move(tb.x + 10, tb.y + 10);
    await p.mouse.down();
    await p.mouse.move(tb.x + 70, tb.y + 10, { steps: 8 });
    await p.mouse.up();
    assert.ok(await p.evaluate(() => (window.getSelection()?.toString().length ?? 0) > 0), "mouse selection in the footer");
    // Select the first word ("Confidential").
    await p.evaluate(() => (document.querySelector(".ms-story-input") as any).editor.commands.setTextSelection({ from: 1, to: 13 }));
    await p.getByTestId("bold").click();
    assert.equal(await ta.count(), 1, "the ribbon does not end footer editing");
    assert.equal(await ta.locator("b, strong").count(), 1, "bold shown while editing (WYSIWYG)");
    await p.keyboard.press("Control+Enter");
    await p.waitForTimeout(800);
    const text = await docOf(p);
    // The footer text moves to a `::: footer` group; the frontmatter only names it.
    assert.match(text, /^::: footer\n\*\*Confiden[^\n]*\n:::$/m, "bold applied to the footer text");
    assert.match(text, /footers:\n\s+default: \{ id: footer \}/, "footer named in the frontmatter");
    assert.doesNotMatch(text, /ms:pagebreak|markdown: /, "Ctrl+Enter ended footer editing, nothing inserted in the body");
    // Alignment and style of the footer being edited: `blocks.footer`, shown on the page.
    await footer.dblclick();
    await ta.waitFor();
    await p.waitForFunction(() => /Confiden/.test(document.querySelector(".ms-story-input")?.textContent ?? ""));
    await p.getByTestId("align-center").click();
    await p.waitForTimeout(300);
    assert.equal(await ta.evaluate((e: Element) => getComputedStyle(e).textAlign), "center", "alignment shown while editing");
    assert.match(await ta.innerText(), /Confiden/, "text kept after the alignment change");
    await p.keyboard.press("Control+Enter");
    await p.waitForTimeout(800);
    assert.match(await docOf(p), /blocks:\n\s+footer: \{ align: center \}/, "footer alignment in the frontmatter");
    assert.equal(await p.locator(".ms-story-footers .ms-story-text").first().evaluate((e: Element) => getComputedStyle(e).textAlign), "center", "footer centered on the page");
    // The footer is a document of its own: blocks (a list) and drawings (a shape, moved by drag).
    await footer.dblclick();
    await ta.waitFor();
    await p.waitForFunction(() => /Confiden/.test(document.querySelector(".ms-story-input")?.textContent ?? ""));
    await p.waitForTimeout(500);
    await p.keyboard.press("Control+End");
    await p.keyboard.press("Enter");
    await p.keyboard.type("- First item");
    await p.waitForTimeout(200);
    assert.equal(await ta.locator("ul li").count(), 1, `a list in the footer: ${await p.evaluate(() => [(document.activeElement as HTMLElement)?.className, document.querySelector(".ms-story-input")?.innerHTML].join(" | "))}`);
    await p.getByRole("tab", { name: "Insert" }).click();
    await p.locator("button", { hasText: "Text box" }).first().click();
    await p.waitForTimeout(600);
    const shape = p.locator("[data-story-object]").first();
    assert.equal(await shape.count(), 1, "text box drawn in the footer band");
    assert.equal(await ta.count(), 1, "inserting a drawing keeps the footer in edit");
    const sb = await shape.boundingBox();
    await p.mouse.move(sb.x + 10, sb.y + 8);
    await p.mouse.down();
    await p.mouse.move(sb.x - 90, sb.y + 8, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(600);
    assert.ok((await p.locator("[data-story-object]").first().boundingBox()).x < sb.x - 50, "drawing moved");
    await p.locator(".ms-story-editor .ms-story-input").click();
    await p.keyboard.press("Control+Enter");
    await p.waitForTimeout(800);
    const withBlocks = await docOf(p);
    assert.match(withBlocks, /::: footer\n[^]*\n- First item\n:::/, "list saved in the footer group");
    assert.match(withBlocks, /footers:[^]*default:[^]*id: footer[^]*objects:[^]*textbox/, "footer drawing in the frontmatter");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Column backgrounds (Word cell shading): Format pane › Columns, one column and the whole block.
  {
    const doc = ["# Columns", "", '<div class="ms-columns" style="display:flex;gap:24px">', "", '<div class="ms-column" style="flex:1;min-width:0">', "", "Left text", "", "</div>", "", '<div class="ms-column" style="flex:1;min-width:0">', "", "Right text", "", "</div>", "", "</div>", ""].join("\n");
    const { p, errors } = await open(browser, doc, { width: 1500, height: 1000 });
    await p.locator(".ProseMirror p", { hasText: "Right text" }).click();
    await p.evaluate(() => (window as any).__studio.set({ pane: "format", rightOpen: true }));
    // Menus close on scroll: bring the picker into view before opening it.
    await p.getByTestId("column-fill").scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);
    await p.getByTestId("column-fill").click();
    await p.getByTestId("column-fill-menu").locator(".palette-chip").nth(3).click();
    await p.waitForTimeout(800);
    assert.match(await docOf(p), /<div class="ms-column" style="flex:1;min-width:0;background:#[0-9A-F]{6};padding:12px">\n\nRight text/, "column background in the source");
    assert.notEqual(await p.locator(".ms-column[data-fill]").evaluate((e: Element) => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)", "column background shown");
    // Menus close on scroll: bring the picker into view before opening it.
    await p.getByTestId("columns-fill").scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);
    await p.getByTestId("columns-fill").click();
    await p.getByTestId("columns-fill-menu").locator(".palette-chip").nth(5).click();
    await p.waitForTimeout(800);
    assert.match(await docOf(p), /<div class="ms-columns" style="display:flex;gap:24px;background:#[0-9A-F]{6};padding:12px">/, "block background in the source");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Headings H1–H6 by Markdown shortcut: no stray empty paragraph.
  {
    const { p } = await open(browser, "# T\n\nAlpha line.\n", { width: 1400, height: 900 });
    await p.locator(".ProseMirror p", { hasText: "Alpha line." }).click();
    for (let level = 1; level <= 6; level++) {
      await p.waitForTimeout(150);
      await p.keyboard.press("End");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(150);
      await p.keyboard.type(`${"#".repeat(level)} Heading ${level}`);
    }
    await p.waitForTimeout(900);
    assert.equal(await docOf(p), "# T\n\nAlpha line.\n\n# Heading 1\n\n## Heading 2\n\n### Heading 3\n\n#### Heading 4\n\n##### Heading 5\n\n###### Heading 6\n");
    await p.close();
  }

  // Master on the canvas: objects added where the page was right-clicked; text edited in place is
  // one master change; filling a placeholder in the document leaves the master alone.
  {
    const { p, errors } = await open(browser, body, { width: 1500, height: 1000 });
    const masterBg = () => p.evaluate(() => (window as any).__studio.get().masterEdit?.background ?? {});
    await p.getByTestId("tab-design").click();
    await p.getByTestId("toggle-master-edit").click();
    await p.getByTestId("master-banner").waitFor();
    await p.evaluate(() => document.querySelector(".editor-container")!.scrollTo(0, 0));
    await p.waitForTimeout(300);
    const page = await p.locator(".ms-page").first().boundingBox();
    const zoom = await p.evaluate(() => (window as any).__studio.get().zoom);
    await p.mouse.click(page.x + 100, page.y + 300, { button: "right" });
    await p.getByTestId("ctx-add").hover();
    await p.getByTestId("ctx-add-ph").hover();
    await p.getByTestId("ctx-add-ph-client").click();
    await p.waitForTimeout(300);
    const ph = (await masterBg()).client;
    assert.ok(Math.abs(ph.box.y - (300 / zoom) * 0.75) < 2, `placeholder added at the clicked point (y ${ph.box.y} pt)`);
    const furniture = p.locator(".ms-page").first().locator(".ms-furniture.is-editable").first();
    const fb = await furniture.boundingBox();
    await p.mouse.dblclick(fb.x + 10, fb.y + 10);
    await p.keyboard.press("Control+a");
    await p.keyboard.type("Client name");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(300);
    assert.equal((await masterBg()).client.text, "Client name", "master text edited on the canvas");
    await p.getByTestId("close-master-edit").click();
    await p.waitForFunction(() => !(window as any).__studio.get().masterEdit, null, { timeout: 5000 });
    await p.waitForTimeout(600);
    const saved = () => p.evaluate(() => JSON.stringify(((window as any).__masters ?? []).find((m: any) => m.id.endsWith("-custom"))?.background));
    const before = await saved();
    await p.locator(".ms-furniture.is-fillable").first().click();
    await p.keyboard.type("Contoso");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(800);
    assert.equal(await saved(), before, "filling a placeholder leaves the master unchanged");
    const filled = await docOf(p);
    assert.match(filled, /placeholders: \[ client \]/, "the placeholder is listed in the frontmatter");
    assert.match(filled, /^::: client\nContoso\n:::$/m, "the value is the document's `::: client` group");
    assert.equal(await p.locator(".ProseMirror p", { hasText: "Contoso" }).count(), 0, "not in the text flow");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // A `.md` opens in the continuous editor: no ribbon, no pages, no view switch; positioned objects
  // show in line. Tables stay plain GFM: a legacy `<!-- ms-table -->` comment is dropped by the next
  // edit and no `<!-- ms… -->` comment is written.
  {
    const doc = ["---", "markdownStudio:", "  version: 1", "  objects:",
      "    box1: { type: textbox, placement: anchored, box: { x: 200, y: 10, width: 150, height: 60 }, wrap: square }",
      "    stamp: { type: shape, shape: roundRect, placement: page, relativeTo: margin, box: { x: 300, y: 500, width: 120, height: 50 }, wrap: none }",
      "---", "# Report", "", para(0), "", "::: box1", "Boxed", ":::", "", para(1), "", "::: stamp", "Stamp", ":::", "", para(2), "",
      "| a | b |", "| - | - |", "| 1 | 2 |", "", "<!-- ms-table:cols=120,80 -->", "", "Tail", ""].join("\n");
    const { p, errors } = await open(browser, doc, { width: 1500, height: 1000, paper: false });
    assert.equal(await p.locator("[data-testid=tab-view]").count(), 0, ".md: no ribbon");
    assert.equal(await p.locator(".ms-paged, .ms-page").count(), 0, ".md: no pages");
    assert.equal(await p.locator(".editor-toolbar").count(), 1, ".md: continuous editor toolbar");
    const flow = await p.evaluate(() => {
      const blocks = [...document.querySelectorAll<HTMLElement>(".ProseMirror > *")].map((e) => e.getBoundingClientRect());
      return { inline: document.querySelectorAll(".ms-object.ms-object-inline").length, overlaps: blocks.filter((r, i) => i && r.top < blocks[i - 1].bottom - 1).length };
    });
    assert.deepEqual(flow, { inline: 2, overlaps: 0 }, "continuous: objects in line, no overlap");
    assert.equal(await editsOf(p), 0, "opening a .md writes nothing");
    await p.locator(".ProseMirror p", { hasText: "Tail" }).click();
    await p.keyboard.press("End");
    await p.keyboard.type(" end.");
    await p.locator(".ProseMirror table td").first().click();
    await p.keyboard.type("0");
    await p.waitForFunction(() => /\| 10 /.test((window as any).__doc.text) && (window as any).__doc.text.includes("Tail end."), null, { timeout: 5000 });
    const text: string = await p.evaluate(() => (window as any).__doc.text);
    assert.ok(!/<!-- ?ms[-:]/.test(text), `.md: no ms comment written\n${text}`);
    assert.deepEqual(errors, []);
    await p.close();
  }

  // `.paper`: resized table columns live in the table's group (`blocks.<id>.cols`), an inline picture's
  // width in a Pandoc attribute, a GMC diagram's size in its fence; never in a comment.
  {
    const pic = `${origin()}/fixture/assets/architecture.png`;
    const doc = ["# Sizes", "", "| a | b |", "| - | - |", "| 1 | 2 |", "", `![Pic](${pic})`, "", "After", ""].join("\n");
    const { p, errors } = await open(browser, doc, { width: 1500, height: 1000 });
    // Column widths as prosemirror-tables' column resizing sets them (after a user gesture).
    await p.locator(".ProseMirror td").first().click();
    await p.evaluate(() => {
      const editor = (document.querySelector(".ProseMirror") as any).editor;
      const { state: st } = editor;
      const tr = st.tr;
      st.doc.descendants((n: any, pos: number) => {
        if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
          const row = st.doc.resolve(pos).index();
          tr.setNodeMarkup(pos, undefined, { ...n.attrs, colwidth: [row === 0 ? 140 : 90] });
        }
        return true;
      });
      editor.view.dispatch(tr);
    });
    await p.waitForFunction(() => /cols:/.test((window as any).__doc.text), null, { timeout: 5000 });
    let text: string = await p.evaluate(() => (window as any).__doc.text);
    assert.match(text, /blocks:[\s\S]*table:[\s\S]*cols:/, `table cols in the frontmatter\n${text}`);
    assert.match(text, /^::: table\n\| a/m, "table in its group");
    // Inline picture: select it, drag the right handle.
    await p.locator(".image-block img").click();
    const handle = p.locator(".image-block .ms-resize-e");
    await handle.waitFor();
    const box = await handle.boundingBox();
    await p.mouse.move(box!.x + 4, box!.y + 4);
    await p.mouse.down();
    await p.mouse.move(box!.x + 120, box!.y + 4, { steps: 6 });
    await p.mouse.up();
    await p.waitForFunction(() => /\)\{width=\d+%\}/.test((window as any).__doc.text), null, { timeout: 5000 });
    text = await p.evaluate(() => (window as any).__doc.text);
    assert.ok(!/<!-- ?ms[-:]/.test(text), `.paper: no ms comment\n${text}`);
    assert.deepEqual(errors, []);
    await p.close();
  }

  // `.paper` table look: rendered from the group's frontmatter; the Inspector writes ranges there.
  {
    const doc = ["---", "markdownStudio:", "  version: 2", "  blocks:", "    sales:", "      table: { borderColor: \"#FF0000\", borderStyle: dashed, borderWidth: 1.5 }", "---",
      "# Look", "", "::: sales", "| Region | Total |", "| - | - |", "| North | 10 |", "| South | 12 |", ":::", "", "After", ""].join("\n");
    const { p, errors } = await open(browser, doc, { width: 1500, height: 1000 });
    const cellStyle = (i: number) => p.evaluate((n: number) => { const c = getComputedStyle(document.querySelectorAll(".ProseMirror td, .ProseMirror th")[n]); return { top: c.borderTopStyle, color: c.borderTopColor, bg: c.backgroundColor, weight: c.fontWeight }; }, i);
    assert.deepEqual({ top: (await cellStyle(3)).top, color: (await cellStyle(3)).color }, { top: "dashed", color: "rgb(255, 0, 0)" }, "whole-table border look");
    await p.locator(".ProseMirror td", { hasText: "North" }).click();
    await p.getByRole("button", { name: "Header row" }).click();
    await p.waitForFunction(() => /"?A1:B1"?:/.test((window as any).__doc.text), null, { timeout: 5000 });
    const text: string = await p.evaluate(() => (window as any).__doc.text);
    assert.match(text, /cells:[\s\S]*A1:B1[\s\S]*1F4E79/, `header range in the frontmatter\n${text}`);
    assert.ok(!/<!--/.test(text), "no comment in the body");
    const header = await cellStyle(0);
    assert.equal(header.bg, "rgb(31, 78, 121)", "header range shading in the editor");
    await p.locator(".ProseMirror td", { hasText: "North" }).click();
    await p.getByRole("radio", { name: "Centered table" }).click();
    await p.waitForFunction(() => /sales:[\s\S]*align: center/.test((window as any).__doc.text), null, { timeout: 5000 });
    const centered = await p.evaluate(() => {
      const t = document.querySelector(".ProseMirror table")!.getBoundingClientRect();
      const page = document.querySelector(".ProseMirror")!.getBoundingClientRect();
      return Math.abs((t.left + t.right) / 2 - (page.left + page.right) / 2) < 4;
    });
    assert.ok(centered, "table centered on the page");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Block frame: the hovered block is framed (dashed); clicking the frame selects the block (blue),
  // then a style reaches the whole block.
  {
    const { p, errors } = await open(browser, "# Doc\n\nFirst words and more words.\n\nSecond.\n", { width: 1500, height: 1000 });
    const para = p.locator(".ProseMirror p", { hasText: "First words" });
    const box = (await para.boundingBox())!;
    await p.mouse.move(box.x + 20, box.y + box.height / 2);
    await p.waitForTimeout(100);
    assert.equal(await para.evaluate((e: Element) => e.classList.contains("ms-block-hover") && getComputedStyle(e).outlineStyle), "dashed", "hovered block framed dashed");
    await p.mouse.move(box.x + box.width / 2, box.y - 4);
    assert.ok(await p.evaluate(() => document.querySelector(".ProseMirror")!.classList.contains("ms-frame-hot")), "frame hot on hover");
    await p.mouse.down();
    await p.mouse.up();
    await p.waitForTimeout(150);
    assert.equal(await para.evaluate((e: Element) => e.classList.contains("ProseMirror-selectednode") && getComputedStyle(e).outlineStyle), "solid", "frame click selects the block");
    await p.keyboard.press("Control+b");
    await p.waitForFunction(() => /\*\*First words and more words\.\*\*/.test((window as any).__doc.text), null, { timeout: 5000 });
    await p.locator(".ProseMirror p", { hasText: "Second." }).click();
    await p.waitForTimeout(100);
    assert.equal(await para.evaluate((e: Element) => e.classList.contains("ms-block-hover")), false, "frame follows the pointer");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // Block in a block: hovering the grouped block frames it; clicking its frame again selects the group.
  {
    const { p, errors } = await open(browser, '# Doc\n\n<!-- embed:file="notes.md" -->\n\nInner words here.\n\n<!-- embed:end -->\n\nAfter.\n', { width: 1500, height: 1000 });
    const inner = p.locator(".ProseMirror p", { hasText: "Inner words" });
    const box = (await inner.boundingBox())!;
    await p.mouse.move(box.x + 20, box.y + box.height / 2);
    await p.waitForTimeout(100);
    assert.ok(await inner.evaluate((e: Element) => e.classList.contains("ms-block-hover")), "grouped block framed");
    await p.mouse.move(box.x + box.width / 2, box.y - 4);
    await p.mouse.down();
    await p.mouse.up();
    await p.waitForTimeout(100);
    const sel = () => p.evaluate(() => (document.querySelector(".ProseMirror") as any).editor.state.selection.node?.type.name);
    assert.equal(await sel(), "paragraph", "frame click selects the grouped block");
    await p.mouse.move(box.x + box.width / 2 + 1, box.y - 4);
    await p.mouse.down();
    await p.mouse.up();
    await p.waitForTimeout(100);
    assert.equal(await sel(), "directiveBlock", "second click selects the group");
    assert.deepEqual(errors, []);
    await p.close();
  }

  // An embed refreshed for the first time (opener only → content + end marker) keeps its content
  // inside the embed block, in a .paper and in a .md.
  for (const paper of [true, false]) {
    const opener = '<!-- embed:file="notes.md" -->';
    const { p, errors } = await open(browser, ["# Embeds", "", opener, "", "After", ""].join("\n"), { paper });
    // VS Code may deliver the embed as two changes: the content, then the end marker.
    await p.evaluate((o: string) => (window as any).__external((window as any).__doc.text.replace(o, `${o}\n## Embedded title\n\nEmbedded text.\n`)), opener);
    await p.waitForTimeout(800);
    await p.evaluate(() => (window as any).__external((window as any).__doc.text.replace("Embedded text.\n", "Embedded text.\n<!-- embed:end -->\n")));
    await p.waitForFunction(() => document.querySelector(".directive-block")?.textContent?.includes("Embedded text."), null, { timeout: 5000 });
    const outside = await p.evaluate(() => {
      let n = 0;
      (document.querySelector(".ProseMirror") as any).editor.state.doc.forEach((node: any) => {
        if (node.type.name !== "directiveBlock" && /Embedded/.test(node.textContent)) n++;
      });
      return n;
    });
    assert.equal(outside, 0, `${paper ? ".paper" : ".md"}: embedded content stays in its block`);
    assert.deepEqual(errors, []);
    await p.close();
  }
}

(async () => {
  await listen();
  const browser = await chromium.launch();
  try {
    // 1. Opening is a no-op; pages are derived.
    const { p, errors } = await open(browser, DOC);
    const pages = await p.locator(".ms-page").count();
    assert.ok(pages >= 3, `paginated (${pages} pages)`);
    assert.equal((await p.evaluate(() => (window as any).__edits.length)), 0, "opening never writes");
    // Table rows split onto pages with a repeated header row.
    const repeated = await p.locator("tr.ms-repeat-header").count();
    assert.ok(repeated >= 1, "table header repeated after a page break");
    // Content stays in one editor: no paragraph duplicated.
    const count = await p.evaluate(() => [...document.querySelectorAll(".ProseMirror p")].filter((e) => e.textContent?.startsWith("Paragraph 5:")).length);
    assert.equal(count, 1);
    if (shots) await p.screenshot({ path: path.join(shots, "studio-light.png") });

    // 2. Typing in one paragraph changes only that span; everything else keeps its exact source.
    await p.locator(".ProseMirror p", { hasText: "Paragraph 20:" }).click();
    await p.evaluate(() => {
      const el = [...document.querySelectorAll(".ProseMirror p")].find((e) => e.textContent?.startsWith("Paragraph 20:"))!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last: Node | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n;
      const range = document.createRange();
      range.setStart(last!, last!.textContent!.length);
      range.collapse(true);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await p.waitForTimeout(100);
    await p.keyboard.type(" Added.");
    await p.waitForFunction(() => (window as any).__edits.length > 0 && (window as any).__doc.text.includes("Added."), null, { timeout: 5000 });
    const after = await p.evaluate(() => (window as any).__doc.text as string);
    const expected = DOC.replace(para(20), `${para(20).trimEnd()} Added.`);
    if (after !== expected) {
      let i = 0;
      while (after[i] === expected[i]) i++;
      throw new Error(`source changed outside the edit at ${i}:\n--- got\n${JSON.stringify(after.slice(i - 80, i + 160))}\n--- expected\n${JSON.stringify(expected.slice(i - 80, i + 160))}`);
    }
    const edit = await p.evaluate(() => (window as any).__edits[0]);
    assert.equal(edit.changes.length, 1);
    assert.ok(edit.changes[0].end - edit.changes[0].start < 200, "minimal span");

    // 3. External change elsewhere while typing is pending: both survive.
    await p.keyboard.type(" More");
    await p.evaluate(() => (window as any).__external((window as any).__doc.text.replace("Last paragraph.", "Last paragraph, edited elsewhere.")));
    await p.waitForTimeout(1200);
    const merged = await p.evaluate(() => (window as any).__doc.text as string);
    assert.ok(merged.includes("Added. More"), "local typing kept");
    assert.ok(merged.includes("Last paragraph, edited elsewhere."), "external change kept");

    // 4. Undo goes to VS Code (one history), not ProseMirror.
    const before = await p.evaluate(() => (window as any).__msgs.length);
    await p.keyboard.press("Control+z");
    await p.waitForTimeout(200);
    const undoMsgs = await p.evaluate((n: number) => (window as any).__msgs.slice(n).map((m: any) => m.type), before);
    assert.ok(undoMsgs.includes("undo"), `undo routed to the host (${undoMsgs})`);

    // 5. Insert a text box from the ribbon: marker + descriptor in one edit; nudge burst = one edit.
    await p.locator(".ProseMirror p", { hasText: "Paragraph 2:" }).click();
    await p.getByRole("tab", { name: "Insert" }).click();
    const editsBefore = await p.evaluate(() => (window as any).__edits.length);
    await p.getByRole("button", { name: "Text box" }).click();
    await p.waitForFunction((n: number) => (window as any).__edits.length > n && /^::: textbox$/m.test((window as any).__doc.text), editsBefore, { timeout: 5000 });
    const withBox = await p.evaluate(() => (window as any).__doc.text as string);
    assert.match(withBox, /objects:\n\s+textbox:/);
    assert.match(withBox, /^::: textbox\nText\n:::$/m, withBox);
    assert.ok(withBox.startsWith("---\ntitle: Report # keep\ncustom: { keep: true }\n"), "other frontmatter untouched");
    await p.waitForTimeout(300);
    const nudgeBase = await p.evaluate(() => (window as any).__edits.length);
    for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(900);
    const nudges = await p.evaluate((n: number) => (window as any).__edits.length - n, nudgeBase);
    assert.equal(nudges, 1, "five nudges = one edit");
    assert.match(await p.evaluate(() => (window as any).__doc.text as string), /box: \{ x: 5, y: 6, width: 200, height: 70 \}/);
    // Drag the selection frame: transient movement, one commit.
    const frame = p.locator(".ms-sel-frame");
    const box = await frame.boundingBox();
    const dragBase = await p.evaluate(() => (window as any).__edits.length);
    await p.mouse.move(box!.x + 40, box!.y + 30);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(box!.x + 40 + i * 6, box!.y + 30 + i);
    await p.mouse.up();
    await p.waitForTimeout(700);
    assert.equal(await p.evaluate((n: number) => (window as any).__edits.length - n, dragBase), 1, "one drag = one edit");
    if (shots) await p.screenshot({ path: path.join(shots, "studio-object.png") });
    // Copy / paste of an object: the copy gets a fresh id and its own descriptor.
    // Headless Chromium has no system clipboard: keep what the editor copies, paste it back.
    await p.evaluate(() => document.addEventListener("copy", (e) => ((window as any).__copied = { html: e.clipboardData!.getData("text/html"), text: e.clipboardData!.getData("text/plain") })));
    const selectedBefore = await p.evaluate(() => document.querySelector(".ms-object.is-selected")?.getAttribute("data-id"));
    await p.keyboard.press("Control+c");
    await p.waitForFunction(() => !!(window as any).__copied?.html, null, { timeout: 2000 }).catch(async (e: Error) => {
      throw new Error(`${e.message}: selected=${selectedBefore} ${JSON.stringify(await p.evaluate(() => ({ active: document.activeElement?.className, copied: (window as any).__copied })))}`);
    });
    await p.locator(".ProseMirror p", { hasText: "Paragraph 6:" }).click();
    await p.keyboard.press("Control+v");
    await p.waitForTimeout(300);
    if (!(await p.evaluate(() => /^::: textbox-2$/m.test((window as any).__doc.text) || document.querySelectorAll(".ms-object").length > 1))) {
      await p.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData("text/html", (window as any).__copied.html);
        dt.setData("text/plain", (window as any).__copied.text);
        document.querySelector(".tiptap-editor")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      });
    }
    await p.waitForFunction(() => /^::: textbox-2$/m.test((window as any).__doc.text), null, { timeout: 5000 }).catch(async (e: Error) => {
      const dbg = await p.evaluate(() => ({ copied: (window as any).__copied?.html?.slice(0, 200), objects: document.querySelectorAll(".ms-object").length, ids: [...((window as any).__doc.text as string).matchAll(/^::: ([A-Za-z][\w-]*)$/gm)].map((m) => m[1]), around: (window as any).__doc.text.split("Paragraph 6:")[0].slice(-120) }));
      throw new Error(`${e.message}; selected before copy: ${selectedBefore}; ${JSON.stringify(dbg)}`);
    });
    await p.waitForFunction(() => /\n\s+textbox-2:\n/.test((window as any).__doc.text), null, { timeout: 5000 });
    const ids = await p.evaluate(() => [...((window as any).__doc.text as string).matchAll(/^::: ([A-Za-z][\w-]*)$/gm)].map((m) => m[1]));
    assert.deepEqual(ids.sort(), ["textbox", "textbox-2"], "pasted object has a unique id");

    // 5b. Right-click a paragraph: Slides Studio's menu (clipboard bar, submenus); Position ›
    // Floating turns the block into a positioned object around the same Markdown.
    await p.keyboard.press("Escape");
    const target = p.locator(".ProseMirror p", { hasText: "Paragraph 8:" });
    await target.scrollIntoViewIfNeeded();
    await target.click({ button: "right" });
    const menu = p.getByTestId("context-menu");
    await menu.waitFor();
    assert.equal(await menu.locator(".ctx-quick button").count(), 4, "clipboard quick bar");
    await p.getByTestId("ctx-position").hover();
    await p.getByTestId("context-submenu").waitFor();
    const floatBase = await p.evaluate(() => (window as any).__edits.length);
    await p.getByTestId("ctx-float").click();
    await p.waitForFunction((n: number) => (window as any).__edits.length > n && /^::: frame\nParagraph 8:/m.test((window as any).__doc.text), floatBase, { timeout: 5000 });
    assert.match(await p.evaluate(() => (window as any).__doc.text as string), /\n\s+frame:\n\s+type: textbox\n\s+placement: anchored/);
    assert.equal(await p.locator("[data-testid=context-menu]").count(), 0, "menu closed");

    // 5c. Ruler: dragging the left margin writes the page setup once, on release.
    await p.keyboard.press("Escape");
    await p.locator(".ProseMirror p", { hasText: "Paragraph 9:" }).click();
    const edge = p.getByRole("slider", { name: "Left margin" }).first();
    const eb = await edge.boundingBox();
    const rulerBase = await p.evaluate(() => (window as any).__edits.length);
    await p.mouse.move(eb!.x + eb!.width / 2, eb!.y + eb!.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(eb!.x + eb!.width / 2 + i * 5, eb!.y + eb!.height / 2);
    assert.equal(await p.evaluate((n: number) => (window as any).__edits.length - n, rulerBase), 0, "no edit while dragging");
    await p.mouse.up();
    await p.waitForFunction((n: number) => (window as any).__edits.length > n, rulerBase, { timeout: 5000 });
    assert.match(await p.evaluate(() => (window as any).__doc.text as string), /page:\n\s+margins:[\s\S]*?left: \d/);

    // 5d. Master edit on the canvas: banner, add a text box from the page menu, drag it, finish.
    await p.getByTestId("tab-design").click();
    await p.getByTestId("toggle-master-edit").click();
    await p.getByTestId("master-banner").waitFor();
    await p.evaluate(() => document.querySelector(".editor-container")!.scrollTo(0, 0));
    await p.waitForTimeout(200);
    const page1 = await p.locator(".ms-page").first().boundingBox();
    await p.mouse.click(page1!.x + page1!.width / 2, page1!.y + 320, { button: "right" });
    await p.getByTestId("ctx-add").hover();
    await p.getByTestId("ctx-add-text").click();
    const furniture = p.locator(".ms-furniture.is-editable").first();
    await furniture.waitFor();
    const fb = await furniture.boundingBox();
    await p.mouse.move(fb!.x + 10, fb!.y + 10);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) await p.mouse.move(fb!.x + 10 + i * 8, fb!.y + 10 + i * 4);
    await p.mouse.up();
    const moved = await p.evaluate(() => Object.values((window as any).__studio.get().masterEdit.background as Record<string, any>).find((d) => d.text === "Texte" || d.type === "textbox"));
    assert.ok(moved && moved.box.x > 0, "master object moved");
    if (shots) await p.screenshot({ path: path.join(shots, "studio-master.png") });
    await p.getByTestId("close-master-edit").click();
    await p.waitForFunction(() => !(window as any).__studio.get().masterEdit, null, { timeout: 5000 });
    assert.ok(await p.evaluate(() => ((window as any).__masters ?? []).some((m: any) => m.id.endsWith("-custom"))), "starter edited as a library copy");
    assert.deepEqual(errors.filter((e) => !/favicon|ERR_|net::/.test(e)), [], "no page errors");
    await p.close();

    // 6. Corporate report fixture: master furniture, anchored image / text box, page-relative stamp,
    // group with a connector, landscape section.
    state.baseUri = `${origin()}/fixture`;
    const fx = await open(browser, fs.readFileSync(path.join(fixtureDir, "report.md"), "utf8"));
    await fx.p.waitForTimeout(1500);
    const fxInfo = await fx.p.evaluate(() => ({
      pages: document.querySelectorAll(".ms-page").length,
      landscape: [...document.querySelectorAll<HTMLElement>(".ms-page")].some((el) => el.offsetWidth > el.offsetHeight),
      objects: [...document.querySelectorAll<HTMLElement>(".ms-object")].map((el) => ({ id: el.dataset.id, left: parseFloat(el.style.left), top: parseFloat(el.style.top), hidden: el.classList.contains("is-hidden"), flow: el.classList.contains("ms-object-flow") })),
      connectors: document.querySelectorAll(".ms-connectors polyline").length,
      floats: document.querySelectorAll(".ms-wrap-float").length,
      footer: document.querySelector(".ms-story-footers .ms-story-text")?.textContent,
      header: document.querySelector(".ms-story-headers .ms-story-text")?.textContent,
      images: [...document.querySelectorAll<HTMLImageElement>(".ms-object img")].map((i) => i.complete && i.naturalWidth > 0),
    }));
    assert.ok(fxInfo.pages >= 4, `fixture paginated (${fxInfo.pages})`);
    assert.ok(fxInfo.landscape, "landscape appendix section");
    assert.equal(fxInfo.connectors, 1, "connector drawn between its objects");
    assert.ok(fxInfo.floats >= 2, "anchored objects reserve wrap areas");
    assert.ok(fxInfo.objects.every((o: any) => o.flow || Number.isFinite(o.left)), "objects positioned");
    assert.ok(fxInfo.objects.find((o: any) => o.id === "ghost")?.hidden, "hidden object hidden");
    assert.match(fxInfo.footer ?? "", /^Page 1 of \d+$/);
    assert.equal(fxInfo.header, "Quarterly review");
    assert.ok(fxInfo.images.every(Boolean), "anchored picture loaded");
    assert.equal(await fx.p.evaluate(() => (window as any).__edits.length), 0, "opening the fixture writes nothing");
    if (shots) {
      await fx.p.screenshot({ path: path.join(shots, "fixture-p1.png") });
      await fx.p.evaluate(() => document.querySelector(".editor-container")!.scrollTo(0, (document.querySelectorAll<HTMLElement>(".ms-page")[1].offsetTop) * 1));
      await fx.p.waitForTimeout(300);
      await fx.p.screenshot({ path: path.join(shots, "fixture-p2.png") });
      await fx.p.evaluate(() => document.querySelector(".editor-container")!.scrollTo(0, 1e6));
      await fx.p.waitForTimeout(300);
      await fx.p.screenshot({ path: path.join(shots, "fixture-last.png") });
    }
    assert.deepEqual(fx.errors.filter((e) => !/favicon|net::/.test(e)), [], "no page errors on the fixture");
    await fx.p.close();
    state.baseUri = "https://file+.vscode-resource.vscode-cdn.net/c%3A/docs";

    // 6b. Regressions of the object / text editing fixes.
    await regressions(browser);

    // 7. Responsiveness on long documents (typing → edit sent, pagination pass time).
    for (const n of [20, 100]) {
      const long = ["# Long", "", ...Array.from({ length: n * 9 }, (_, i) => (i % 40 === 0 ? `## Part ${i}\n\n` : "") + para(i) + "\n")].join("\n");
      const lp = await open(browser, long);
      await lp.p.waitForTimeout(1500);
      const pagesN = await lp.p.locator(".ms-page").count();
      await lp.p.locator(".ProseMirror p", { hasText: "Paragraph 3:" }).click();
      const t0 = Date.now();
      await lp.p.keyboard.type("abcdefghij", { delay: 0 });
      const typeMs = Date.now() - t0;
      await lp.p.waitForFunction(() => (window as any).__edits.length > 0, null, { timeout: 10000 });
      await lp.p.waitForTimeout(800);
      const layoutMs = await lp.p.evaluate(() => (window as any).__studio.get().layout?.ms);
      const frame = await lp.p.evaluate(() => new Promise<number>((r) => {
        const t = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t)));
      }));
      console.log(`perf: ${n}-page target → ${pagesN} pages; typing 10 chars ${typeMs} ms; pagination pass ${layoutMs} ms; idle frame ${frame.toFixed(1)} ms`);
      assert.ok(pagesN >= n * 0.8, `long document paginated (${pagesN})`);
      await lp.p.close();
    }

    // 8. Dark chrome, narrow panel.
    const dark = await open(browser, "# Dark\n\nText.\n", { theme: "dark", width: 640 });
    if (shots) await dark.p.screenshot({ path: path.join(shots, "studio-dark-narrow.png") });
    assert.equal(await dark.p.locator(".navigator").count(), 0, "navigation collapsed in a narrow panel");
    await dark.p.close();
    console.log("studio browser checks passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  server.close();
});
