/**
 * Extensive conversion tests: markdown ↔ HTML round-trips + unit tests.
 *
 * Test categories:
 *   A. Headings (h1-h6)
 *   B. Inline formatting (bold, italic, code, strike)
 *   C. Lists (unordered, ordered, nested, mixed)
 *   D. Task lists (GFM ↔ Tiptap conversion)
 *   E. Tables (incl. `|` in code spans, `\|` escape protection)
 *   F. Code blocks (language labels, shellscript → bash)
 *   G. Images (alt text, separation)
 *   H. Blockquotes
 *   I. Horizontal rules
 *   J. Special characters / escaping
 *   K. (removed — metadata no longer needed)
 *   L. normalizeMarkdown unit tests
 *   L2. Frontmatter preservation
 *   M. Known-failing cases (documented, expected to fail)
 *   O. Math (inline and block)
 *   P. Embeds (GitHub)
 *   Q. Mermaid diagrams
 *   R. Raw HTML blocks
 *   N. Settings-driven behavior
 *
 * Usage: npx tsx test/test-conversions.ts
 */

import { roundTrip, mdToHtml, htmlToMd } from "./pipeline";
import { encodeFenceMeta, restoreFenceMeta, restoreRawHtml } from "../webview/conversion-utils";
import { normalizeMarkdown, buildMarkdownConfig } from "../webview/markdown.config";
import { DEFAULT_SETTINGS, SETTING_KEYS, THEMES, mergeSettings } from "../webview/settings";
import packageJson from "../../package.json";
import { sourceBlockLines } from "../webview/sourceLines";
import { splitBlocks, diffBlocks, similarity } from "../webview/renderedDiff";
import { parseDirective, setDirectiveAttr, gmcEmbedDirective, gmcViewNames, setFenceOption, parseTableLayout, formatTableLayout } from "../webview/conversion-utils";
import { AlignBlock, Highlight, HASHTAG_RE, highlightBlockTr, setBlockAlignTr } from "../webview/extensions/BlockStyle";
import { isMetaComment } from "../webview/extensions/RawHtmlBlock";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  TableFilter,
  columnValues,
  sortTableTr,
  setColumnFilterTr,
  tableFilterKey,
  alignColumnsTr,
  syncColumnAlignTr,
  fillValue,
  fillTr,
  sliceToTsv,
  tsvToTable,
} from "../webview/extensions/TableFilter";
import { CellSelection } from "@tiptap/pm/tables";
import { rangeStats } from "../webview/components/TableControls";
import { extractFrontmatter, prependFrontmatter, frontmatterBody, buildFrontmatter, defaultFrontmatter } from "../webview/frontmatter";
import {
  isGitHubUrl,
  parseGitHubUrl,
} from "../webview/extensions/GitHubEmbed";

// ============================================================================
// Mini test harness
// ============================================================================

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  known?: boolean;
}

const results: TestResult[] = [];
let currentCategory = "";

function category(name: string) {
  currentCategory = name;
}

function normalize(s: string): string {
  // Trim trailing newlines so "foo" and "foo\n" compare equal.
  // remark-stringify always appends a newline; test inputs usually don't.
  return s.replace(/\n+$/, "");
}

async function roundtripCase(
  name: string,
  input: string,
  expected?: string,
  opts: { known?: boolean } = {}
) {
  const actual = await roundTrip(input);
  const exp = expected ?? input;
  const passed = normalize(actual) === normalize(exp);
  results.push({
    name,
    category: currentCategory,
    passed,
    expected: exp,
    actual,
    known: opts.known,
  });
}

function eq(name: string, actual: string, expected: string, opts: { known?: boolean } = {}) {
  const passed = normalize(actual) === normalize(expected);
  results.push({
    name,
    category: currentCategory,
    passed,
    expected,
    actual,
    known: opts.known,
  });
}

function assert(name: string, condition: boolean, detail?: string, opts: { known?: boolean } = {}) {
  results.push({
    name,
    category: currentCategory,
    passed: condition,
    actual: condition ? "OK" : detail ?? "(no detail)",
    expected: "OK",
    known: opts.known,
  });
}

// ============================================================================
// Tests
// ============================================================================

async function run() {
  // --------------------------------------------------------------------------
  category("A. Headings");
  // --------------------------------------------------------------------------

  await roundtripCase("h1 round-trip", "# Hello");
  await roundtripCase("h2 round-trip", "## Hello");
  await roundtripCase("h3 round-trip", "### Hello");

  // h4-h6 round-trip natively (Tiptap supports all 6 levels)
  await roundtripCase("h4 round-trip", "#### Heading 4");
  await roundtripCase("h5 round-trip", "##### Heading 5");
  await roundtripCase("h6 round-trip", "###### Heading 6");
  await roundtripCase(
    "mixed h1-h6 preserved",
    "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6"
  );

  // --------------------------------------------------------------------------
  category("B. Inline formatting");
  // --------------------------------------------------------------------------

  await roundtripCase("bold", "This has **bold text** in it.");
  await roundtripCase("italic", "This has _italic text_ in it.");
  await roundtripCase("inline code", "This has `code` in it.");
  await roundtripCase("strikethrough", "This has ~~strike~~ text.");
  await roundtripCase(
    "bold italic code strike together",
    "This has **bold text** and _italic text_ and `inline code` and ~~strikethrough~~."
  );
  await roundtripCase(
    "nested bold+italic",
    "Mixed: **bold and _italic_ together** and more text."
  );
  await roundtripCase(
    "bold mid-sentence",
    "A sentence with **bold** in the middle and _emphasis_ too."
  );
  // Regression: `**`bold code`**` lost its bold wrapper because Tiptap's
  // default Code mark has `excludes: '_'` (drops all other marks). Issue #3.
  await roundtripCase("bold around inline code", "**`bold code`**");
  eq(
    "html→md: <strong><code>x</code></strong> keeps bold",
    (await htmlToMd("<p><strong><code>bold code</code></strong></p>")).trim(),
    "**`bold code`**"
  );
  // Regression: when bold-around-code abuts a word with no space between,
  // remark-stringify emits `&#x41;` to disambiguate. We post-process that
  // into `<!---->` + literal char, which is valid CommonMark and re-parses
  // identically. Issue #3 follow-up.
  eq(
    "html→md: <strong><code>x</code></strong>Apples uses HTML-comment separator",
    (await htmlToMd("<p><strong><code>bold code</code></strong>Apples</p>")).trim(),
    "**`bold code`**<!---->Apples"
  );
  eq(
    "html→md: <em>x</em>after uses HTML-comment separator",
    (await htmlToMd("<p><em>x</em>after</p>")).trim(),
    "_<!---->x_<!---->after"
  );
  await roundtripCase(
    "bold-code adjacent to word round-trips with comment separator",
    "**`bold code`**<!---->Apples"
  );

  // --------------------------------------------------------------------------
  category("C. Lists");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "unordered simple",
    "- Item one\n- Item two\n- Item three"
  );
  await roundtripCase(
    "unordered with bold",
    "- Item one\n- Item two\n- Item three with **bold**\n- Item with `code`"
  );
  await roundtripCase(
    "unordered nested 2 levels",
    "- Parent item\n  - Child item\n  - Another child\n- Back to parent"
  );
  await roundtripCase(
    "unordered nested 3 levels",
    "- Parent item\n  - Child item\n  - Another child\n    - Grandchild\n- Back to parent"
  );
  await roundtripCase("ordered simple", "1. First\n2. Second\n3. Third");
  await roundtripCase(
    "ordered nested",
    "1. First\n   1. Sub-first\n   2. Sub-second\n2. Second"
  );
  await roundtripCase(
    "mixed ul+ol",
    "- Unordered\n  1. Ordered child\n  2. Another ordered\n- Back to unordered"
  );
  await roundtripCase(
    "list with inline link",
    "- List with [link](https://example.com)\n  - Nested [link](https://example.com/nested)"
  );

  // --------------------------------------------------------------------------
  category("D. Task lists");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "task list all states",
    "- [ ] Unchecked task\n- [x] Checked task\n- [ ] Another unchecked\n- [x] Another checked"
  );
  await roundtripCase(
    "task list with formatting",
    "- [ ] Task with **bold**\n- [x] Done with `code`"
  );

  // --------------------------------------------------------------------------
  category("E. Tables");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "simple 3-col table",
    "| Header 1 | Header 2 | Header 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |"
  );

  // `|` inside code span in table cell — the critical protectTableCodePipes test.
  // Output canonicalizes to GFM-escaped `\|` (which is the correct markdown).
  await roundtripCase(
    "table with | in code span → escapes to \\|",
    "| Syntax | Example |\n| ------ | ------- |\n| pipe   | `a|b`   |",
    "| Syntax | Example |\n| ------ | ------- |\n| pipe   | `a\\|b`  |\n"
  );

  // `\|` already escaped — must stay `\|`, NOT become `\\|`
  await roundtripCase(
    "table with escaped \\| in code span (no double-escape)",
    "| Syntax | Example |\n| ------ | ------- |\n| escape | `a\\|b`  |",
    "| Syntax | Example |\n| ------ | ------- |\n| escape | `a\\|b`  |\n"
  );

  // Multiple pipes in single code span
  await roundtripCase(
    "table cell with multiple | in code span",
    "| col     |\n| ------- |\n| `a|b|c` |",
    "| col       |\n| --------- |\n| `a\\|b\\|c` |\n"
  );

  // --------------------------------------------------------------------------
  category("F. Code blocks");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "code block javascript",
    '```javascript\nfunction hello() {\n  console.log("world");\n}\n```'
  );
  await roundtripCase(
    "code block python",
    '```python\ndef hello():\n    print("world")\n```'
  );
  await roundtripCase(
    "code block bash",
    '```bash\necho "hello world"\n```'
  );
  await roundtripCase(
    "code block no language stays bare",
    "```\nplain code\nno language\n```"
  );

  // Fence info after the language (meta) must survive the round-trip —
  // GMC diagrams rely on ```gmc id=… view=… attributes.
  await roundtripCase(
    "code fence meta preserved",
    '```js title="a.js" {1,3}\nconst a = 1;\n```'
  );
  await roundtripCase(
    "gmc fence attributes preserved",
    "```gmc id=system-context view=context theme=dark width=1600\nmodel {\n  user = person \"User\"\n}\n```"
  );
  {
    const html = await mdToHtml("```gmc id=a view=v\nmodel {}\n```");
    assert(
      "md→html: fence meta lands in data-meta",
      html.includes('class="language-gmc"') && html.includes('data-meta="id=a view=v"'),
      html
    );
  }
  eq(
    "restoreFenceMeta: decodes placeholder",
    restoreFenceMeta("```" + encodeFenceMeta("gmc", 'id=a title="x y"') + "\nm\n```\n"),
    '```gmc id=a title="x y"\nm\n```\n'
  );

  // shellscript → bash normalization
  eq(
    "normalizeMarkdown: shellscript → bash",
    normalizeMarkdown("```shellscript\necho hi\n```\n"),
    "```bash\necho hi\n```\n"
  );

  // --------------------------------------------------------------------------
  category("G. Images");
  // --------------------------------------------------------------------------

  await roundtripCase("image with alt", "![Alt text](image.png)");
  await roundtripCase("image without alt", "![](no-alt.png)");
  await roundtripCase(
    "two images separate blocks",
    "![First](one.png)\n\n![Second](two.png)"
  );

  // --------------------------------------------------------------------------
  category("H. Blockquotes");
  // --------------------------------------------------------------------------

  await roundtripCase("blockquote simple", "> This is a blockquote.");
  await roundtripCase(
    "blockquote multi-paragraph",
    "> This is a blockquote.\n>\n> With multiple paragraphs."
  );
  await roundtripCase(
    "blockquote nested",
    "> Nested:\n>\n> > Inner quote"
  );

  // --------------------------------------------------------------------------
  category("I. Horizontal rules");
  // --------------------------------------------------------------------------

  await roundtripCase(
    "horizontal rule between sections",
    "## Section 1\n\n---\n\n## Section 2"
  );

  // --------------------------------------------------------------------------
  category("J. Special characters / escaping");
  // --------------------------------------------------------------------------

  // Unescape \~ → ~
  await roundtripCase(
    "bare tilde preserved",
    "Tildes: ~ single tilde and ~~ double tildes ~~."
  );

  // Unescape standalone \*
  await roundtripCase(
    "bare asterisk preserved",
    "Asterisks in text: 2 * 3 = 6."
  );

  // Currency $ must not be paired as math by remarkMath
  await roundtripCase(
    "bold with currency $ preserved",
    "**$14B**, $1.4B raised"
  );
  await roundtripCase(
    "multiple currency amounts in paragraph",
    "costs $100 or $200"
  );
  await roundtripCase(
    "bold currency in table cell",
    "| Company | Valuation |\n| --- | --- |\n| **Skild AI** | **$14B**, $1.4B raised |",
    "| Company      | Valuation              |\n| ------------ | ---------------------- |\n| **Skild AI** | **$14B**, $1.4B raised |\n"
  );

  // Unescape escaped bold markers (\*\* → **) — safety-net normalizeMarkdown rule
  eq(
    "normalizeMarkdown: unescape \\*\\* bold opener before $",
    normalizeMarkdown("\\*\\*$14B**, $1.4B raised\n"),
    "**$14B**, $1.4B raised\n"
  );
  eq(
    "normalizeMarkdown: unescape \\*\\* bold with $ inside",
    normalizeMarkdown("\\*\\*LeCun's $1B bet.**\n"),
    "**LeCun's $1B bet.**\n"
  );

  // Unescape \_ in words (ASCII)
  eq(
    "normalizeMarkdown: unescape \\_ in words",
    normalizeMarkdown("future\\_relevance check\n"),
    "future_relevance check\n"
  );

  // Unescape \_ in words (Unicode — Greek, CJK)
  eq(
    "normalizeMarkdown: unescape \\_ around Unicode (β\\_kl)",
    normalizeMarkdown("β\\_kl\n"),
    "β_kl\n"
  );
  eq(
    "normalizeMarkdown: unescape \\_ around CJK (日\\_本)",
    normalizeMarkdown("日\\_本\n"),
    "日_本\n"
  );

  // Unescape \[ brackets
  eq(
    "normalizeMarkdown: unescape \\[",
    normalizeMarkdown("see \\[note] here\n"),
    "see [note] here\n"
  );

  // Unescape \~
  eq(
    "normalizeMarkdown: unescape \\~",
    normalizeMarkdown("use \\~ for home\n"),
    "use ~ for home\n"
  );

  // Unescape \= before non-= content (e.g. => arrows)
  eq(
    "normalizeMarkdown: unescape \\=> arrow",
    normalizeMarkdown("\\=> leads to something\n"),
    "=> leads to something\n"
  );

  // Strip <autolinks> back to bare URLs
  eq(
    "normalizeMarkdown: strip <https://...> autolink",
    normalizeMarkdown("see <https://arxiv.org/pdf/1602.04938>\n"),
    "see https://arxiv.org/pdf/1602.04938\n"
  );

  // Autolinks inside code spans must NOT be stripped
  eq(
    "normalizeMarkdown: keep <url> inside code span",
    normalizeMarkdown("use `<https://example.com>` in code\n"),
    "use `<https://example.com>` in code\n"
  );

  // --------------------------------------------------------------------------
  // K. (removed — metadata system no longer needed, Tiptap supports h4-h6)
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  category("L. normalizeMarkdown unit tests");
  // --------------------------------------------------------------------------

  eq(
    "bullet * → -",
    normalizeMarkdown("* one\n* two\n* three\n"),
    "- one\n- two\n- three\n"
  );

  eq(
    "renumber ordered list",
    normalizeMarkdown("1. first\n1. second\n1. third\n"),
    "1. first\n2. second\n3. third\n"
  );

  eq(
    "orphaned list marker merging",
    normalizeMarkdown("- \n\n  text here\n"),
    "- text here\n"
  );

  // Task list checkbox fix patterns from BlockNote era
  eq(
    "task list: fix \\[ ] → [ ]",
    normalizeMarkdown("- \\[ ] todo item\n"),
    "- [ ] todo item\n"
  );

  eq(
    "task list: fix \\[x] → [x]",
    normalizeMarkdown("- \\[x] done item\n"),
    "- [x] done item\n"
  );

  // Image + duplicate alt text dedup
  eq(
    "image followed by alt text dedup",
    normalizeMarkdown("![pic](a.png)\npic\n"),
    "![pic](a.png)\n"
  );

  // compactLists: removes blank lines between list items
  eq(
    "compactLists: removes blank lines between items",
    normalizeMarkdown("- one\n\n- two\n\n- three\n"),
    "- one\n- two\n- three\n"
  );

  // compactLists preserves blanks between different list types at top level
  const mixedListOut = normalizeMarkdown("- bullet\n\n1. number\n");
  assert(
    "compactLists: keeps blank between ul and ol at top level",
    mixedListOut.includes("- bullet\n\n1. number"),
    mixedListOut
  );

  // compactLists preserves blanks between list item and indented paragraph
  // (structural: blank + indent = paragraph IS part of the list item)
  eq(
    "compactLists: preserves blank between list item and indented para (2sp)",
    normalizeMarkdown("- item\n\n  indented para\n"),
    "- item\n\n  indented para\n"
  );
  eq(
    "compactLists: preserves blank between list item and 4-sp indent (code)",
    normalizeMarkdown("- item\n\n    code-indented\n"),
    "- item\n\n    code-indented\n"
  );
  eq(
    "compactLists: preserves blank between list and following unindented para",
    normalizeMarkdown("- one\n- two\n\nparagraph after\n"),
    "- one\n- two\n\nparagraph after\n"
  );

  // Table header reconstruction: empty header row + separator → first row becomes header
  const tableFixed = normalizeMarkdown(
    "|   |   |\n| - | - |\n| A | B |\n| C | D |\n"
  );
  assert(
    "fixTableHeaders: empty header row reconstructed from first data row",
    /\| A\s+\| B\s+\|/.test(tableFixed) &&
      !tableFixed.match(/^\|\s+\|\s+\|\s*$/m),
    tableFixed
  );

  // Table separator widths match unescaped content (not pre-unescape widths)
  eq(
    "fixTableHeaders: separator width matches after unescape",
    normalizeMarkdown(
      "|   |   |\n| - | - |\n| Company | \\*\\*$14B** |\n"
    ),
    "| Company | **$14B** |\n| ------- | -------- |\n"
  );

  // HTML entity cleanup
  eq(
    "HTML entity cleanup: &#x20; → space",
    "foo&#x20;bar".replace(/&#x20;/g, " "),
    "foo bar"
  );
  eq(
    "HTML entity cleanup: &amp; → &",
    "a &amp; b".replace(/&amp;/g, "&"),
    "a & b"
  );

  // Bold in lists (regression test for list item serialization)
  await roundtripCase(
    "bold in lists",
    "- **Bold list item**\n- **Another bold** with trailing text\n- Normal then **bold part**\n- _Italic item_"
  );

  // Nested bold/italic preservation
  await roundtripCase(
    "bold containing italic",
    "**outer _inner_ text**"
  );

  // --------------------------------------------------------------------------
  category("L2. Frontmatter preservation");
  // --------------------------------------------------------------------------

  // extractFrontmatter unit tests
  {
    const { content, frontmatter } = extractFrontmatter(
      "---\nname: test\ndescription: hello\n---\n\n# Heading\n\nBody text.\n"
    );
    eq("extractFrontmatter: strips frontmatter", content, "\n# Heading\n\nBody text.\n");
    eq("extractFrontmatter: captures raw block", frontmatter, "---\nname: test\ndescription: hello\n---\n");
  }

  {
    const { content, frontmatter } = extractFrontmatter("# No frontmatter\n\nJust content.\n");
    eq("extractFrontmatter: no frontmatter returns content unchanged", content, "# No frontmatter\n\nJust content.\n");
    eq("extractFrontmatter: no frontmatter returns empty string", frontmatter, "");
  }

  eq(
    "prependFrontmatter: restores block with blank line",
    prependFrontmatter("# Heading\n", "---\nfoo: bar\n---\n"),
    "---\nfoo: bar\n---\n\n# Heading\n"
  );

  eq(
    "prependFrontmatter: noop when empty",
    prependFrontmatter("# Heading\n", ""),
    "# Heading\n"
  );

  // Frontmatter creation / editing helpers
  eq("frontmatterBody: extracts YAML body", frontmatterBody("---\nfoo: bar\n---\n") ?? "", "foo: bar");
  assert("frontmatterBody: null when absent", frontmatterBody("") === null);
  eq("frontmatterBody: empty body", frontmatterBody(buildFrontmatter("")) ?? "x", "");
  eq("buildFrontmatter: wraps body in fences", buildFrontmatter("a: 1"), "---\na: 1\n---\n");
  eq("buildFrontmatter: null removes block", buildFrontmatter(null), "");
  eq(
    "defaultFrontmatter: title/date/tags",
    defaultFrontmatter('My "Doc"', new Date("2026-10-15T12:00:00Z")),
    'title: "My \\"Doc\\""\ndate: 2026-10-15\ntags: []'
  );
  {
    const raw = buildFrontmatter(defaultFrontmatter("T", new Date("2026-01-02T00:00:00Z")));
    const { content, frontmatter } = extractFrontmatter(prependFrontmatter("# T\n", raw));
    eq("created frontmatter round-trips through extract", frontmatter, raw);
    eq("created frontmatter leaves body intact", content, "\n# T\n");
  }

  // Full round-trip with frontmatter
  await roundtripCase(
    "YAML frontmatter preserved through round-trip",
    "---\nname: games-vm\ndescription: SSH into the games VM\nallowed-tools: Bash\n---\n\n## Games VM\n\nSome content here.\n"
  );

  await roundtripCase(
    "frontmatter with special chars preserved",
    "---\ntitle: My <Project>\ntags: [a, b, c]\n---\n\n# Title\n\nParagraph.\n"
  );

  // Exact reproduction of the reported bug: angle-bracket value + multi-line YAML
  await roundtripCase(
    "frontmatter with angle-bracket value (reported issue)",
    "---\nname: games-vm\ndescription: SSH into the games VM (A100 GPU) on GCP to run commands, check training runs, or manage experiments\nargument-hint: <command-to-run>\nallowed-tools: Bash\n---\n\n## Games VM\n\nSome content here.\n"
  );

  // --------------------------------------------------------------------------
  category("M. Known failing / limitations (documented)");
  // --------------------------------------------------------------------------

  // Escaped markdown characters in plain text lose backslash on round-trip
  // because Tiptap stores the rendered text, not the source.
  // The remark/rehype pipeline alone ALSO loses them.
  await roundtripCase(
    "\\* literal asterisk in text (LOSSY)",
    "Escape: \\* should stay",
    "Escape: * should stay",
    { known: true }
  );

  // (was: "β\\_kl not unescaped (Unicode)" — now fixed, see category J below)
  // (was: "compactLists: indented para after list loses blank" — now fixed,
  //  see L.compactLists positive assertions below)

  // Empty fenced code block round-trips to itself (no language label
  // added or removed — we only touch labels when the user opts in via
  // defaultCodeBlockLang).
  await roundtripCase("empty fenced code block stays bare", "```\n```");

  // --------------------------------------------------------------------------
  category("O. Math (inline and block)");
  // --------------------------------------------------------------------------

  await roundtripCase("inline math simple", "Einstein wrote $E=mc^2$ in 1905.");
  await roundtripCase("inline math with subscript", "The variable $x_1$ is defined.");
  await roundtripCase("inline math with braces", "We have $\\frac{a}{b}$ here.");
  await roundtripCase("block math simple", "$$\na^2 + b^2 = c^2\n$$");
  await roundtripCase(
    "block math multiline",
    "$$\n\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n\n$$"
  );
  await roundtripCase(
    "inline math in paragraph",
    "The formula $a + b = c$ is basic arithmetic."
  );
  await roundtripCase(
    "multiple inline math in one line",
    "Both $\\alpha$ and $\\beta$ are Greek."
  );
  await roundtripCase(
    "block math surrounded by text",
    "Before math:\n\n$$\nf(x) = x^2\n$$\n\nAfter math."
  );

  // Inline math whose content starts AND ends with a digit must not be
  // mis-protected by protectCurrencyDollars (regression: the leading `$`
  // matched the `$<digit>` currency pattern, breaking the math pair).
  await roundtripCase(
    "inline math digit boundaries with LaTeX command",
    "So 5 cats would have $24 \\times 5 = 120$ whiskers between them."
  );
  await roundtripCase(
    "inline math digit boundaries with operator",
    "Result: $2x + 3 = 5$ is the answer."
  );

  // Currency must still be protected even when math also appears nearby
  await roundtripCase(
    "currency and inline math on same line",
    "It costs $100 but $E=mc^2$ stays."
  );

  // Verify md→html produces correct data attributes
  {
    const html = await mdToHtml("$E=mc^2$");
    assert(
      "md→html: inline math produces data-type='mathInline'",
      html.includes('data-type="mathInline"') && html.includes('data-latex="E=mc^2"'),
      html
    );
  }
  {
    const html = await mdToHtml("$$\na^2 + b^2 = c^2\n$$");
    assert(
      "md→html: block math produces data-type='mathBlock'",
      html.includes('data-type="mathBlock"'),
      html
    );
  }

  // --------------------------------------------------------------------------
  category("P. Embeds (GitHub)");
  // --------------------------------------------------------------------------

  // URL detection

  assert("isGitHubUrl: repo", isGitHubUrl("https://github.com/foo/bar"));
  assert("isGitHubUrl: PR", isGitHubUrl("https://github.com/foo/bar/pull/42"));
  assert("isGitHubUrl: issue", isGitHubUrl("https://github.com/foo/bar/issues/7"));
  assert("isGitHubUrl: file blob", isGitHubUrl("https://github.com/foo/bar/blob/main/src/a.ts"));
  assert("isGitHubUrl: user profile rejected", !isGitHubUrl("https://github.com/foo"));
  assert("isGitHubUrl: non-GH rejected", !isGitHubUrl("https://gitlab.com/foo/bar"));

  // GitHub URL parsing — kind classification
  const prInfo = parseGitHubUrl("https://github.com/foo/bar/pull/42");
  assert(
    "parseGitHubUrl: PR → kind='pr', owner, repo, number",
    prInfo?.kind === "pr" &&
      (prInfo as any).owner === "foo" &&
      (prInfo as any).repo === "bar" &&
      (prInfo as any).number === "42",
    JSON.stringify(prInfo)
  );
  const fileInfo = parseGitHubUrl("https://github.com/foo/bar/blob/main/src/a.ts");
  assert(
    "parseGitHubUrl: file → kind='file' with path",
    fileInfo?.kind === "file" && (fileInfo as any).path === "src/a.ts",
    JSON.stringify(fileInfo)
  );

  // md→html: standalone autolink becomes embed paragraph
  {
    const html = await mdToHtml("https://github.com/foo/bar/pull/42\n");
    assert(
      "md→html: GitHub URL becomes data-type='githubEmbed' paragraph",
      html.includes('data-type="githubEmbed"') &&
        html.includes('data-url="https://github.com/foo/bar/pull/42"'),
      html
    );
  }
  {
    // URL inside sentence should NOT be rewritten as an embed
    const html = await mdToHtml("Check https://github.com/foo/bar here.\n");
    assert(
      "md→html: URL inside sentence is NOT embedded",
      !html.includes('data-type="githubEmbed"'),
      html
    );
  }

  // Round-trip: bare URL survives as bare URL
  await roundtripCase(
    "YouTube URL stays a plain autolink",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );
  {
    const html = await mdToHtml("https://www.youtube.com/watch?v=dQw4w9WgXcQ\n");
    assert("md→html: YouTube URL is no longer an embed", !html.includes("youtubeEmbed"), html);
  }
  await roundtripCase(
    "GitHub PR URL on its own line round-trips",
    "https://github.com/foo/bar/pull/42"
  );
  await roundtripCase(
    "GitHub file URL on its own line round-trips",
    "https://github.com/foo/bar/blob/main/src/a.ts"
  );

  // --------------------------------------------------------------------------
  category("Q. Mermaid diagrams");
  // --------------------------------------------------------------------------

  // Mermaid blocks are plain fenced code blocks on disk — the rich editor
  // renders them via a dedicated Tiptap node, but round-trip goes through
  // the standard code-block path (no placeholder machinery).
  await roundtripCase(
    "mermaid simple graph",
    "```mermaid\ngraph TD\nA-->B\n```"
  );
  await roundtripCase(
    "mermaid sequence diagram",
    "```mermaid\nsequenceDiagram\nAlice->>Bob: Hi\n```"
  );
  await roundtripCase(
    "mermaid block surrounded by text",
    "Before:\n\n```mermaid\ngraph LR\nA-->B\n```\n\nAfter."
  );
  await roundtripCase(
    "mermaid alongside a regular code block",
    "```mermaid\ngraph TD\nA-->B\n```\n\n```javascript\nconsole.log(1);\n```"
  );

  // md→html: mermaid fence produces a standard <pre><code class="language-mermaid">
  // (the custom Tiptap parseHTML hook picks this up client-side).
  {
    const html = await mdToHtml("```mermaid\ngraph TD\nA-->B\n```");
    assert(
      "md→html: mermaid fence produces <pre><code class='language-mermaid'>",
      html.includes('<code class="language-mermaid">') &&
        html.includes("graph TD"),
      html
    );
  }

  // --------------------------------------------------------------------------
  category("R. Raw HTML blocks (embed directives)");
  // --------------------------------------------------------------------------

  // Block HTML used to be dropped by remark-rehype, silently deleting
  // `<!-- embed:… -->` directives on open.
  await roundtripCase(
    "HTML comment directive survives",
    "# A\n\n<!-- embed:toc -->\n\n- x\n\n<!-- embed:end -->\n\ntext"
  );
  await roundtripCase(
    "details/summary block survives",
    "<details>\n<summary>Hi</summary>\n\nbody\n\n</details>"
  );
  await roundtripCase(
    "compact embed gets blank lines once, then stable",
    '<!-- embed:file="./a.ts" -->\n```ts\nconst a = 1;\n```\n<!-- embed:end -->',
    '<!-- embed:file="./a.ts" -->\n\n```ts\nconst a = 1;\n```\n\n<!-- embed:end -->'
  );
  {
    const once = await roundTrip('<!-- embed:file="./a.ts" -->\n```ts\nx\n```\n<!-- embed:end -->\n');
    eq("compact embed round-trip is idempotent", await roundTrip(once), once);
  }
  {
    const html = await mdToHtml('<!-- embed:file="./a.ts" -->\n\n```ts\nx\n```\n\n<!-- embed:end -->\n\nafter');
    assert("directive + content grouped into one block",
      /^<div data-type="directive" data-open="<!-- embed:file=&#x22;.\/a.ts&#x22; -->" data-close="<!-- embed:end -->">\s*<pre><code class="language-ts">x<\/code><\/pre>\s*<\/div>\s*<p>after<\/p>$/.test(html), html);
    const unfilled = await mdToHtml('<!-- embed:file="./a.ts" -->\n\ntext');
    assert("unfilled directive does not swallow following blocks",
      /data-close="">\s*<\/div>\s*<p>text<\/p>/.test(unfilled), unfilled);
    const toc = await mdToHtml("<!-- embed:toc -->\n\n- [a](#a)\n\n<!-- embed:toc:end -->\n\n<!-- embed:end -->");
    assert("toc pairs with embed:toc:end, stray embed:end stays raw",
      /data-close="<!-- embed:toc:end -->">[\s\S]*<\/div>\s*<pre><code class="language-btrmk-raw-html">&#x3C;!-- embed:end -->/.test(toc), toc);
  }
  await roundtripCase(
    "nested directive inside markdown embed survives",
    '<!-- embed:file="./a.md" -->\n\n# A\n\n<!-- embed:file="./b.ts" -->\n\n```ts\nb\n```\n\n<!-- embed:end -->\n\n<!-- embed:end -->'
  );
  await roundtripCase(
    "link directive survives",
    '<!-- link:file="./b.md" -->\n\n[B](<./b.md>)\n\n<!-- link:end -->',
    '<!-- link:file="./b.md" -->\n\n[B](./b.md)\n\n<!-- link:end -->\n'
  );
  eq("sourceBlockLines: directive group is one block",
    sourceBlockLines("# T\n\n<!-- embed:toc -->\n\n- [T](#t)\n\n<!-- embed:toc:end -->\n\npara\n").join(","), "1,3,9");
  eq("parseDirective: kind + attrs",
    JSON.stringify(parseDirective('<!-- embed:file="./a b.ts" line="1-3" lock="true" -->')),
    JSON.stringify({ kind: "embed", attrs: { file: "./a b.ts", line: "1-3", lock: "true" } }));
  eq("parseDirective: toc", parseDirective('<!-- embed:toc depth="2" -->').kind, "toc");
  eq("gmcViewNames: names of the views block",
    gmcViewNames('model {}\nviews {\n  view context {}\n  view deploy "Deploy" {}\n}').join(","), "context,deploy");
  eq("setFenceOption: set, replace, remove, quote",
    [setFenceOption("id=a", "view", "ctx"), setFenceOption("id=a view=x", "view", "y"),
      setFenceOption("id=a view=x theme=dark", "view", null), setFenceOption("", "id", "a b")].join(" | "),
    'id=a view=ctx | id=a view=y | id=a theme=dark | id="a b"');
  eq("gmcEmbedDirective: view + theme, empty left out",
    [gmcEmbedDirective("./d.gmc", "context", "dark"), gmcEmbedDirective("./d.gmc")].join(" | "),
    '<!-- embed:file="./d.gmc" view="context" theme="dark" --> | <!-- embed:file="./d.gmc" -->');
  eq("setDirectiveAttr: replace primary file",
    setDirectiveAttr('<!-- link:file="./a.md" -->', "file", "./b.md"), '<!-- link:file="./b.md" -->');
  eq("setDirectiveAttr: add + remove lock",
    setDirectiveAttr(setDirectiveAttr('<!-- embed:file="./a.ts" -->', "lock", "true"), "lock", null),
    '<!-- embed:file="./a.ts" -->');
  // Block alignment, highlights, #tags, metadata comments
  {
    const html = await mdToHtml('<div align="center">\n\n# T\n\n</div>\n\n<div class="x">\n\n<div align="right">\n\np\n\n</div>\n\n</div>');
    assert("align div grouped; other divs pair but stay raw",
      /^<div data-type="align" data-align="center">\s*<h1>T<\/h1>\s*<\/div>\s*<pre><code class="language-btrmk-raw-html">&#x3C;div class="x">[\s\S]*<div data-type="align" data-align="right">\s*<p>p<\/p>\s*<\/div>\s*<pre><code class="language-btrmk-raw-html">&#x3C;\/div>/.test(html), html);
  }
  await roundtripCase("align block survives", '<div align="center">\n\n# Title\n\n</div>\n\ntext');
  await roundtripCase("unclosed align div stays raw", '<div align="center">\n\ntext');
  {
    const html = await mdToHtml('a <mark>b **c**</mark> <mark data-color="red">d</mark> e');
    assert("inline <mark> pairs become highlights",
      html === '<p>a <mark>b <strong>c</strong></mark> <mark data-color="red">d</mark> e</p>', html);
  }
  await roundtripCase("highlights survive", 'a <mark>b **c**</mark> and <mark data-color="red">d</mark>');
  await roundtripCase("unpaired <mark> is dropped as before", "a <mark>b", "a b\n");
  eq("HASHTAG_RE: tags, not headings/anchors/numbers",
    [..."#tag x (#a-b) url#frag #1 # no #é".matchAll(HASHTAG_RE)].map((m) => m[2]).join(","), "#tag,#a-b,#é");
  eq("isMetaComment: tool hash vs directive vs prose",
    [isMetaComment("<!-- gmc-source-sha256:8d80 -->"), isMetaComment("<!-- embed:end -->"), isMetaComment("<!-- a note -->")].join(","),
    "true,false,false");
  {
    const schema = getSchema([StarterKit, AlignBlock, Highlight]);
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text("hi"))]);
    let state = EditorState.create({ schema, doc });
    state = state.apply(setBlockAlignTr(state, 0, "center")!);
    eq("setBlockAlignTr: wraps", `${state.doc.child(0).type.name}:${state.doc.child(0).attrs.align}`, "alignBlock:center");
    state = state.apply(setBlockAlignTr(state, 0, "right")!);
    eq("setBlockAlignTr: re-aligns in place", `${state.doc.child(0).attrs.align}:${state.doc.child(0).childCount}`, "right:1");
    state = state.apply(highlightBlockTr(state, 0, "green")!);
    eq("highlightBlockTr: whole block", state.doc.textBetween(0, state.doc.content.size) + ":" +
      state.doc.child(0).child(0).child(0).marks.map((m) => m.attrs.color).join(), "hi:green");
    state = state.apply(setBlockAlignTr(state, 0, "left")!);
    eq("setBlockAlignTr: left unwraps", state.doc.child(0).type.name, "paragraph");
  }
  eq(
    "restoreRawHtml: indented fence inside list",
    restoreRawHtml("- a\n\n  ```btrmk-raw-html\n  <!-- c -->\n  ```\n"),
    "- a\n\n  <!-- c -->\n"
  );

  // --------------------------------------------------------------------------
  category("S. Table sort / filter / range");
  // --------------------------------------------------------------------------
  {
    const schema = getSchema([StarterKit, Table, TableRow, TableHeader, TableCell, TableFilter]);
    const cell = (type: "tableHeader" | "tableCell", text: string) =>
      schema.nodes[type].create(null, schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined));
    const row = (type: "tableHeader" | "tableCell", ...texts: string[]) =>
      schema.nodes.tableRow.create(null, texts.map((t) => cell(type, t)));
    const table = schema.nodes.table.create(null, [
      row("tableHeader", "Name", "Qty"),
      row("tableCell", "pear", "10"),
      row("tableCell", "apple", "2"),
      row("tableCell", "fig", ""),
      row("tableCell", "apple", "9"),
    ]);
    const doc = schema.nodes.doc.create(null, [table]);
    const plugins = [TableFilter.config.addProseMirrorPlugins!.call({} as any)].flat();
    let state = EditorState.create({ schema, doc, plugins });
    const col = (s: EditorState, c: number) => {
      const out: string[] = [];
      s.doc.child(0).forEach((r, _o, i) => { if (i > 0) out.push(r.child(c).textContent); });
      return out.join(",");
    };

    eq("columnValues: distinct with counts", JSON.stringify(columnValues(table, 0)),
      JSON.stringify([{ value: "apple", count: 2 }, { value: "fig", count: 1 }, { value: "pear", count: 1 }]));
    eq("sort numeric asc, empty last, stable", col(state.apply(sortTableTr(state, 0, 1, 1)!), 1), "2,9,10,");
    eq("sort desc", col(state.apply(sortTableTr(state, 0, 0, -1)!), 0), "pear,fig,apple,apple");

    state = state.apply(setColumnFilterTr(state, { tablePos: 0, col: 0, hidden: ["apple"], text: "" }));
    eq("filter state stored", JSON.stringify(tableFilterKey.getState(state)?.map((f) => f.hidden)), JSON.stringify([["apple"]]));
    const sorted = state.apply(sortTableTr(state, 0, 0, 1)!);
    eq("filter survives sort (mapped to same table)", String(tableFilterKey.getState(sorted)?.length ?? 0), "1");
    eq("filter leaves document unchanged", state.doc.eq(doc) ? "same" : "changed", "same");

    // Excel-like ranges: copy B2:B3 → TSV; TSV text → table slice.
    const base = EditorState.create({ schema, doc, plugins });
    const cellPos = (r: number, c: number) => {
      let pos = 1;
      for (let i = 0; i < r; i++) pos += table.child(i).nodeSize;
      pos += 1;
      for (let j = 0; j < c; j++) pos += table.child(r).child(j).nodeSize;
      return pos;
    };
    const range = CellSelection.create(base.doc, cellPos(1, 1), cellPos(2, 1));
    eq("sliceToTsv: copied column range", sliceToTsv(range.content()), "10\n2");
    eq("sliceToTsv: 2x2 range", sliceToTsv(CellSelection.create(base.doc, cellPos(1, 0), cellPos(2, 1)).content()), "pear\t10\napple\t2");
    const pasted = tsvToTable(schema, "a\tb\r\nc\td\r\n")!;
    eq("tsvToTable: rows x cols", `${pasted.childCount}x${pasted.child(0).childCount}:${pasted.textContent}`, "2x2:abcd");
    eq("tsvToTable: plain single line is not a table", String(tsvToTable(schema, "hello")), "null");

    // Column alignment: every cell of the selected column, toggles off with null.
    const inCell = base.apply(base.tr.setSelection(TextSelection.create(base.doc, cellPos(2, 1) + 2)));
    const aligned = inCell.apply(alignColumnsTr(inCell, "center")!);
    const aligns = (s: EditorState, c: number) => {
      const out: string[] = [];
      s.doc.child(0).forEach((r) => out.push(String(r.child(c).attrs.align)));
      return out.join(",");
    };
    eq("alignColumnsTr: whole column incl. header", aligns(aligned, 1), "center,center,center,center,center");
    eq("alignColumnsTr: other columns untouched", aligns(aligned, 0), "null,null,null,null,null");
    const pos = cellPos(3, 1);
    const drifted = aligned.apply(aligned.tr.setNodeMarkup(pos, undefined, { ...aligned.doc.nodeAt(pos)!.attrs, align: "left" }));
    eq("syncColumnAlignTr: pasted/new cell takes header alignment",
      aligns(drifted, 1), "center,center,center,center,center");
    eq("syncColumnAlignTr: consistent table is a no-op", String(syncColumnAlignTr(aligned)), "null");
  }
  {
    const series = (src: string[], ks: number[]) => ks.map((k) => fillValue(src, k).value).join(",");
    eq("fillValue: single number copies (Excel)", series(["5"], [1, 2]), "5,5");
    eq("fillValue: numeric step continues, both ways", series(["1", "3"], [2, 3, -1]), "5,7,-1");
    eq("fillValue: text+number increments", series(["Item 1"], [1, 2]), "Item 2,Item 3");
    eq("fillValue: decimals kept", series(["0.5", "1.0"], [2]), "1.5");
    eq("fillValue: text repeats pattern", series(["a", "b"], [2, 3, 4]), "a,b,a");

    const schema = getSchema([StarterKit, Table, TableRow, TableHeader, TableCell, TableFilter]);
    const c = (t: string) => schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, t ? schema.text(t) : undefined));
    const r = (...ts: string[]) => schema.nodes.tableRow.create(null, ts.map(c));
    const t = schema.nodes.table.create(null, [r("1", "x"), r("2", ""), r("", ""), r("", "")]);
    const s0 = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [t]) });
    const grid = (s: EditorState) => {
      const rows: string[] = [];
      s.doc.child(0).forEach((row) => { const cs: string[] = []; row.forEach((x) => cs.push(x.textContent)); rows.push(cs.join("|")); });
      return rows.join(";");
    };
    const down = s0.apply(fillTr(s0, 0, { left: 0, top: 0, right: 1, bottom: 2 }, { left: 0, top: 0, right: 1, bottom: 4 })!);
    eq("fillTr: drag A1:A2 down continues series", grid(down), "1|x;2|;3|;4|");
    const right = s0.apply(fillTr(s0, 0, { left: 1, top: 0, right: 2, bottom: 1 }, { left: 0, top: 0, right: 2, bottom: 1 })!);
    eq("fillTr: drag B1 left copies text", grid(right), "x|x;2|;|;|");
    eq("fillTr: diagonal target refused", String(fillTr(s0, 0, { left: 0, top: 0, right: 1, bottom: 1 }, { left: 0, top: 0, right: 2, bottom: 2 })), "null");
  }
  eq("parseTableLayout / formatTableLayout",
    JSON.stringify(parseTableLayout(formatTableLayout([120, null, 80], [null, 40])!)),
    JSON.stringify({ cols: [120, null, 80], rows: [null, 40] }));
  eq("formatTableLayout: nothing to save", String(formatTableLayout([null], [null])), "null");
  {
    const html = await mdToHtml("| a | b |\n| - | - |\n| 1 | 2 |\n\n<!-- ms-table:cols=120,;rows=,40 -->\n\nafter");
    assert("table layout comment applied to cells/rows and removed",
      /<th colwidth="120">a<\/th>/.test(html) && /<tr data-height="40">/.test(html) && !/ms-table/.test(html), html);
    eq("table layout comment round-trips", await htmlToMd(html),
      "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n<!-- ms-table:cols=120,;rows=,40 -->\n\nafter\n");
  }
  await roundtripCase("table column alignment survives",
    "| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |",
    "| a   | b   | c   |\n| :-- | :-: | --: |\n| 1   | 2   | 3   |\n");
  eq("rangeStats: numbers, currency, commas, text ignored",
    JSON.stringify(rangeStats(["1,000", "$2.5", "abc", "", "10%"])),
    JSON.stringify({ count: 5, numeric: 3, sum: 1012.5 }));

  // --------------------------------------------------------------------------
  category("U. Rendered diff (block diff)");
  // --------------------------------------------------------------------------
  {
    const split = splitBlocks('---\ntitle: x\n---\n# A\n\npara [l][r]\n\n<!-- embed:toc -->\n\n- [A](#a)\n\n<!-- embed:toc:end -->\n\n| a |\n| - |\n| 1 |\n\n<!-- ms-table:cols=90 -->\n\n[r]: http://x\n');
    eq("splitBlocks: frontmatter, directive and table+layout as single blocks, defs aside",
      JSON.stringify(split),
      JSON.stringify({
        blocks: ["```yaml\ntitle: x\n```", "# A", "para [l][r]", "<!-- embed:toc -->\n\n- [A](#a)\n\n<!-- embed:toc:end -->", "| a |\n| - |\n| 1 |\n\n<!-- ms-table:cols=90 -->"],
        defs: ["[r]: http://x"],
      }));
    const kinds = (o: string, n: string, ctx = 1) => diffBlocks(o, n, ctx).entries.map((e) => e.kind + (e.far ? "*" : "") + (e.pair !== undefined ? e.pair : "")).join(",");
    eq("diffBlocks: modified block paired, added/removed kept",
      kinds("# A\n\nhello world\n\nbye", "# A\n\nhello there world\n\nnew one\n\n![i](x.png)"),
      "same,old0,new0,del,ins,ins");
    eq("diffBlocks: far unchanged blocks folded behind a gap",
      kinds("a\n\nb\n\nc\n\nd\n\ne", "a\n\nb\n\nc\n\nd\n\nE!"),
      "gap,same*,same*,same*,same,del,ins");
    eq("similarity: identical / disjoint", `${similarity("a b", "a b")},${similarity("abc", "xyz")}`, "1,0");
  }

  // --------------------------------------------------------------------------
  category("N. Settings-driven behavior");
  // --------------------------------------------------------------------------

  // Line-number gutter: top-level block start lines, frontmatter offset
  // included, link definitions skipped.
  eq(
    "sourceBlockLines: blocks with frontmatter offset",
    sourceBlockLines("---\na: 1\n---\n\n# T\n\npara\nmore\n\n[x]: http://x\n\n- a\n- b\n").join(","),
    "5,7,12"
  );
  eq(
    "mergeSettings: clamps layout values, rejects bad outlineStyle",
    JSON.stringify(((s) => [s.contentWidth, s.fontSize, s.lineHeight, s.outlineStyle])(mergeSettings({ contentWidth: 99999, fontSize: 2, lineHeight: NaN, outlineStyle: "x" as any }))),
    JSON.stringify([1600, 8, 1.6, "rail"])
  );

  // --------------------------------------------------------------------------

  // mergeSettings with nothing returns defaults
  eq(
    "mergeSettings: null/undefined → defaults",
    JSON.stringify(mergeSettings(null)),
    JSON.stringify(DEFAULT_SETTINGS)
  );

  // Schema sync: package.json, DEFAULT_SETTINGS, and SETTING_KEYS agree
  const schema = packageJson.contributes.configuration[0].properties as Record<
    string,
    { default: unknown; enum?: unknown[] }
  >;
  eq(
    "settings: SETTING_KEYS matches DEFAULT_SETTINGS keys",
    [...SETTING_KEYS].sort().join(","),
    Object.keys(DEFAULT_SETTINGS).sort().join(",")
  );
  eq(
    "settings: package.json schema keys match SETTING_KEYS",
    Object.keys(schema).sort().join(","),
    SETTING_KEYS.map((key) => `markdownStudio.${key}`).sort().join(",")
  );
  const mismatchedDefaults = SETTING_KEYS.filter(
    (key) => schema[`markdownStudio.${key}`]?.default !== DEFAULT_SETTINGS[key]
  );
  assert(
    "settings: package.json defaults match DEFAULT_SETTINGS",
    mismatchedDefaults.length === 0,
    mismatchedDefaults.join(",")
  );
  eq(
    "settings: theme enum matches THEMES",
    JSON.stringify(schema["markdownStudio.theme"]?.enum),
    JSON.stringify(THEMES)
  );
  eq(
    "settings: unknown theme falls back to default",
    mergeSettings({ theme: "high-contrast-dark" as any }).theme,
    "default"
  );

  // Partial settings merge onto defaults
  const partial = mergeSettings({ bullet: "*" });
  assert(
    "mergeSettings: partial settings keep defaults for missing keys",
    partial.bullet === "*" && partial.emphasis === "_" && partial.compactLists === true,
    JSON.stringify(partial)
  );

  // buildMarkdownConfig maps user-friendly "**"/"__" down to remark's single char
  const cfgStarStar = buildMarkdownConfig(mergeSettings({ strong: "**" }));
  const cfgUnderUnder = buildMarkdownConfig(mergeSettings({ strong: "__" }));
  assert(
    "buildMarkdownConfig: strong ** → remark strong='*'",
    cfgStarStar.strong === "*",
    `got '${cfgStarStar.strong}'`
  );
  assert(
    "buildMarkdownConfig: strong __ → remark strong='_'",
    cfgUnderUnder.strong === "_",
    `got '${cfgUnderUnder.strong}'`
  );

  // bulletOther is the complement of bullet
  assert(
    "buildMarkdownConfig: bullet='-' → bulletOther='*'",
    buildMarkdownConfig(mergeSettings({ bullet: "-" })).bulletOther === "*"
  );
  assert(
    "buildMarkdownConfig: bullet='*' → bulletOther='-'",
    buildMarkdownConfig(mergeSettings({ bullet: "*" })).bulletOther === "-"
  );

  // compactLists toggle: when disabled, blank lines between list items remain
  eq(
    "settings: compactLists=false preserves blanks between items",
    normalizeMarkdown("- a\n\n- b\n\n- c\n", mergeSettings({ compactLists: false })),
    "- a\n\n- b\n\n- c\n"
  );
  eq(
    "settings: compactLists=true compacts blanks between items (default)",
    normalizeMarkdown("- a\n\n- b\n\n- c\n", DEFAULT_SETTINGS),
    "- a\n- b\n- c\n"
  );

  // unescapeSpecialChars toggle
  eq(
    "settings: unescapeSpecialChars=false keeps \\_ in words",
    normalizeMarkdown("foo\\_bar\n", mergeSettings({ unescapeSpecialChars: false })),
    "foo\\_bar\n"
  );
  eq(
    "settings: unescapeSpecialChars=true unescapes \\_ in words (default)",
    normalizeMarkdown("foo\\_bar\n", DEFAULT_SETTINGS),
    "foo_bar\n"
  );

  // shellscriptToBash toggle
  eq(
    "settings: shellscriptToBash=true rewrites label (default)",
    normalizeMarkdown("```shellscript\necho hi\n```\n", DEFAULT_SETTINGS),
    "```bash\necho hi\n```\n"
  );
  eq(
    "settings: shellscriptToBash=false keeps shellscript",
    normalizeMarkdown("```shellscript\necho hi\n```\n", mergeSettings({ shellscriptToBash: false })),
    "```shellscript\necho hi\n```\n"
  );

  // renumberOrderedLists toggle
  eq(
    "settings: renumberOrderedLists=true renumbers (default)",
    normalizeMarkdown("1. a\n1. b\n1. c\n", DEFAULT_SETTINGS),
    "1. a\n2. b\n3. c\n"
  );
  eq(
    "settings: renumberOrderedLists=false keeps original numbers",
    normalizeMarkdown("1. a\n1. b\n1. c\n", mergeSettings({ renumberOrderedLists: false })),
    "1. a\n1. b\n1. c\n"
  );

  // bullet setting: normalizeMarkdown rewrites other bullets to preferred
  eq(
    "settings: bullet='*' converts - to *",
    normalizeMarkdown("- one\n- two\n", mergeSettings({ bullet: "*" })),
    "* one\n* two\n"
  );
  eq(
    "settings: bullet='+' converts - to +",
    normalizeMarkdown("- one\n- two\n", mergeSettings({ bullet: "+" })),
    "+ one\n+ two\n"
  );

  // defaultCodeBlockLang
  eq(
    "settings: defaultCodeBlockLang='' leaves bare fences alone (default)",
    normalizeMarkdown("```\nhello\n```\n", DEFAULT_SETTINGS),
    "```\nhello\n```\n"
  );
  eq(
    "settings: defaultCodeBlockLang='text' labels bare fences when user opts in",
    normalizeMarkdown("```\nhello\n```\n", mergeSettings({ defaultCodeBlockLang: "text" })),
    "```text\nhello\n```\n"
  );
  eq(
    "settings: defaultCodeBlockLang='' strips text label",
    normalizeMarkdown("```text\nhello\n```\n", mergeSettings({ defaultCodeBlockLang: "" })),
    "```\nhello\n```\n"
  );
  eq(
    "settings: defaultCodeBlockLang leaves real languages alone",
    normalizeMarkdown("```python\nprint('x')\n```\n", mergeSettings({ defaultCodeBlockLang: "" })),
    "```python\nprint('x')\n```\n"
  );

  // --------------------------------------------------------------------------
  // Print report
  // --------------------------------------------------------------------------

  const groups = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!groups.has(r.category)) groups.set(r.category, []);
    groups.get(r.category)!.push(r);
  }

  let passed = 0;
  let failed = 0;
  let knownFailed = 0;
  let unexpectedFailed = 0;

  for (const [cat, items] of groups) {
    console.log(`\n\x1b[1m${cat}\x1b[0m`);
    for (const r of items) {
      if (r.passed) {
        passed++;
        console.log(`  \x1b[32m✓\x1b[0m ${r.name}`);
      } else {
        failed++;
        if (r.known) {
          knownFailed++;
          console.log(`  \x1b[33m○\x1b[0m ${r.name} \x1b[90m(known)\x1b[0m`);
        } else {
          unexpectedFailed++;
          console.log(`  \x1b[31m✗\x1b[0m ${r.name}`);
          console.log(`    \x1b[90mexpected:\x1b[0m ${JSON.stringify(r.expected)}`);
          console.log(`    \x1b[90m  actual:\x1b[0m ${JSON.stringify(r.actual)}`);
        }
      }
    }
  }

  console.log(
    `\n\x1b[1mResult:\x1b[0m \x1b[32m${passed} passed\x1b[0m, ` +
      (unexpectedFailed
        ? `\x1b[31m${unexpectedFailed} failed\x1b[0m, `
        : "") +
      `\x1b[33m${knownFailed} known-failing\x1b[0m`
  );

  if (unexpectedFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
