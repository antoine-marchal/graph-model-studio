"use strict";

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const renderCalls = [];
const vscodeStub = {
    Uri: {
        file(fsPath) {
            return { fsPath, toString: () => `file:///${fsPath.replace(/\\/g, '/')}` };
        },
        parse(value) {
            return { fsPath: value, toString: () => value };
        },
    },
    commands: {
        async executeCommand(command, source, target, view) {
            renderCalls.push({ command, source: source.fsPath, target: target.fsPath, view });
            fs.writeFileSync(target.fsPath, 'png');
        },
    },
    workspace: {
        getWorkspaceFolder() { return undefined; },
    },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeStub;
    return originalLoad.call(this, request, parent, isMain);
};
const { MarkdownEmbedder } = require('../integrations/markdown-code-embedder/embedder');
const { prepareExportSource } = require('../integrations/markdown-toolkit/source/export');
Module._load = originalLoad;

test('a GMC embed renders a sibling PNG and emits a Markdown image', async () => {
    renderCalls.length = 0;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gmc-embed-'));
    try {
        const modelsDir = path.join(tempRoot, 'models');
        fs.mkdirSync(modelsDir);
        const rootDocument = path.join(tempRoot, 'index.md');
        const source = path.join(modelsDir, 'workflow.gmc');
        fs.writeFileSync(source, 'model { a = node "A" }', 'utf8');
        const document = { uri: vscodeStub.Uri.file(rootDocument) };
        const embedder = new MarkdownEmbedder();

        const rendered = await embedder.buildNewContent(document, { file: './models/workflow.gmc' });
        assert.match(rendered, /^\n!\[workflow\]\(\.\/models\/workflow\.png\)\n<!-- gmc-source-sha256:[a-f0-9]{64} -->\n<!-- embed:end -->$/);
        assert.deepEqual(renderCalls.at(-1), {
            command: 'gmc.renderFilePng',
            source,
            target: path.join(modelsDir, 'workflow.png'),
            view: undefined,
        });

        const callCount = renderCalls.length;
        const unchanged = await embedder.buildNewContent(
            document,
            { file: './models/workflow.gmc' },
            new Set(),
            undefined,
            true,
            rendered,
        );
        assert.equal(unchanged, rendered);
        assert.equal(renderCalls.length, callCount, 'unchanged GMC files must reuse the existing PNG');

        const staleCheck = await embedder.buildNewContent(
            document,
            { file: './models/workflow.gmc' },
            new Set(),
            undefined,
            false,
        );
        assert.equal(staleCheck, rendered);
        assert.equal(renderCalls.length, callCount, 'stale checks must not regenerate PNG files');

        fs.writeFileSync(source, 'model { a = node "Changed" }', 'utf8');
        const changed = await embedder.buildNewContent(
            document,
            { file: './models/workflow.gmc' },
            new Set(),
            undefined,
            true,
            rendered,
        );
        assert.notEqual(changed, rendered);
        assert.equal(renderCalls.length, callCount + 1, 'changed GMC files must regenerate their PNG');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('a GMC embed forwards view and invalidates the PNG when view changes', async () => {
    renderCalls.length = 0;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gmc-embed-view-'));
    try {
        const source = path.join(tempRoot, 'workflow.gmc');
        const rootDocument = path.join(tempRoot, 'index.md');
        fs.writeFileSync(source, 'model { views { overview = view "Overview" } }', 'utf8');
        const document = { uri: vscodeStub.Uri.file(rootDocument) };
        const embedder = new MarkdownEmbedder();
        assert.deepEqual(
            embedder.parseAttributes('file="./workflow.gmc" view="overview"'),
            { file: './workflow.gmc', view: 'overview' },
        );

        const overview = await embedder.buildNewContent(document, { file: './workflow.gmc', view: 'overview' });
        assert.equal(renderCalls.at(-1).view, 'overview');
        assert.equal(renderCalls.at(-1).target, path.join(tempRoot, 'workflow-overview.png'));
        assert.match(overview, /!\[workflow\]\(\.\/workflow-overview\.png\)/);

        const details = await embedder.buildNewContent(
            document,
            { file: './workflow.gmc', view: 'details' },
            new Set(),
            undefined,
            true,
            overview,
        );
        assert.equal(renderCalls.at(-1).view, 'details');
        assert.equal(renderCalls.at(-1).target, path.join(tempRoot, 'workflow-details.png'));
        assert.notEqual(details, overview, 'the cached render hash must include the requested view');

        const callCount = renderCalls.length;
        const unchanged = await embedder.buildNewContent(
            document,
            { file: './workflow.gmc', view: 'details' },
            new Set(),
            undefined,
            true,
            details,
        );
        assert.equal(unchanged, details);
        assert.equal(renderCalls.length, callCount, 'the same source and view must reuse the PNG');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});


test('link labels use only the first line after optional YAML, otherwise the filename stem', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-link-title-'));
    try {
        const document = { uri: vscodeStub.Uri.file(path.join(root, 'index.md')) };
        const embedder = new MarkdownEmbedder();
        for (const [content, label] of [
            ['# First title\n# Second title', 'First title'],
            ['\uFEFF---\r\ntitle: Ignored\r\n...\r\n## Heading [one] ##\r\n', 'Heading \\[one\\]'],
            ['Plain text\n# Later heading', 'child.notes'],
            ['---\ntitle: Ignored\n---\n\n# Later heading', 'child.notes'],
            ['', 'child.notes'],
        ]) {
            fs.writeFileSync(path.join(root, 'child.notes.md'), content);
            assert.equal(await embedder.buildNewContent(document, { file: './child.notes.md', link: true }), `\n[${label}](<./child.notes.md>)\n<!-- link:end -->`);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Markdown link mode uses the first heading; inclusion strips YAML and shifts headings', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-embed-'));
    try {
        const filename = path.join(root, 'index.md');
        const document = { uri: vscodeStub.Uri.file(filename) };
        const embedder = new MarkdownEmbedder();
        const link = await embedder.buildNewContent(document, { file: './missing.md', link: true });
        assert.equal(link, '\n[missing](<./missing.md>)\n<!-- link:end -->');
        fs.writeFileSync(path.join(root, 'child.md'), '---\ntitle: Hidden\n---\n# Child\n\n```md\n# Example\n```\n');
        assert.equal(await embedder.buildNewContent(document, { file: './child.md', link: true }), '\n[Child](<./child.md>)\n<!-- link:end -->');
        const included = await embedder.buildNewContent(document, { file: './child.md', indent: '2' });
        assert.match(included, /### Child/);
        assert.match(included, /```md\n# Example\n```/);
        assert.doesNotMatch(included, /Hidden|---/);
        embedder.expandLinkEmbeds = true;
        const expanded = await embedder.expandNestedMarkdown('  <!-- link:file="./child.md" -->', filename, new Set([filename]), filename);
        assert.match(expanded, /\n  # Child/);
        assert.doesNotMatch(expanded, /Hidden|\[child.md\]/);
        const exportDocument = {
            fileName: filename,
            getText: () => '<!-- link:file="./child.md" -->\nOld generated content\n<!-- link:end -->',
        };
        assert.match(await prepareExportSource(exportDocument, false), /\[Child\]/);
        const exported = await prepareExportSource(exportDocument, true);
        assert.match(exported, /# Child/);
        assert.doesNotMatch(exported, /Hidden|Old generated content/);
        fs.writeFileSync(path.join(root, 'child.md'), '<!-- link:file="./index.md" -->');
        fs.writeFileSync(filename, 'root');
        await assert.rejects(embedder.buildNewContent(document, { file: './child.md', link: true }, new Set([filename])), /Circular Markdown embed/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
const { getCodeFenceRanges, isInCodeFence } = require('../integrations/markdown-code-embedder/utils');
vscodeStub.Range = class { constructor(start, end) { this.start = start; this.end = end; } };
vscodeStub.TextEdit = { replace: (range, newText) => ({ range, newText }) };
function textDocument(filename, text) {
    return {
        uri: vscodeStub.Uri.file(filename),
        getText: range => range ? text.slice(range.start, range.end) : text,
        positionAt: offset => offset,
    };
}

test('indented link directives update once, become fresh, and preserve surrounding embeds', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'link-update-'));
    try {
        fs.writeFileSync(path.join(root, 'child.md'), '# Child');
        const filename = path.join(root, 'index.md');
        const embedder = new MarkdownEmbedder();
        let text = '  <!-- link:file="./child.md" indent="2" -->\n  old\n  <!-- link:end -->\nTrailing';
        const edits = await embedder.generateEdits(textDocument(filename, text));
        assert.equal(edits.length, 1);
        assert.equal(edits[0].newText, '\n    [Child](<./child.md>)\n    <!-- link:end -->');
        const edit = edits[0];
        text = text.slice(0, edit.range.start) + edit.newText + text.slice(edit.range.end);
        assert.equal((await embedder.generateEdits(textDocument(filename, text))).length, 0);
        assert.equal((await embedder.getStaleMatchIndices(textDocument(filename, text))).size, 0);
        assert.ok(text.endsWith('\nTrailing'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('repeated sources share one read per update and refresh on the next update', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-perf-'));
    const originalRead = fs.promises.readFile;
    let reads = 0;
    fs.promises.readFile = (...args) => { reads++; return originalRead(...args); };
    try {
        fs.writeFileSync(path.join(root, 'child.md'), '# First');
        const filename = path.join(root, 'index.md');
        const text = Array(100).fill('<!-- link:file="./child.md" -->\n<!-- link:end -->').join('\n');
        const embedder = new MarkdownEmbedder();
        assert.equal((await embedder.generateEdits(textDocument(filename, text))).length, 100);
        assert.equal(reads, 1);
        fs.writeFileSync(path.join(root, 'child.md'), '# Second');
        const edits = await embedder.generateEdits(textDocument(filename, text));
        assert.equal(reads, 2);
        assert.ok(edits.every(edit => edit.newText.includes('[Second]')));
    } finally {
        fs.promises.readFile = originalRead;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('mixed nested link/embed markers ignore fenced examples and unmatched openers', () => {
    const text = '<!-- embed:file="outer.md" -->\n<!-- link:file="inner.md" -->\n<!-- link:end -->\n```md\n<!-- embed:end -->\n```\n<!-- embed:end -->\n<!-- link:file="unfinished.md" -->';
    const embedder = new MarkdownEmbedder();
    const ranges = getCodeFenceRanges(text);
    const tags = [...text.matchAll(embedder.embedRegex)];
    assert.equal(embedder.findMatchingEnd(text, tags[0].index + tags[0][0].length, ranges).index, text.lastIndexOf('<!-- embed:end -->'));
    assert.equal(embedder.findMatchingEnd(text, tags[1].index + tags[1][0].length, ranges).index, text.indexOf('<!-- link:end -->'));
    const last = tags.at(-1);
    assert.equal(embedder.findMatchingEnd(text, last.index + last[0].length, ranges), undefined);
    assert.equal(isInCodeFence(ranges[0][0], ranges), true);
    assert.equal(isInCodeFence(ranges[0][1], ranges), false);
});

test('indented and unclosed code fences never execute link directives', async () => {
    const embedder = new MarkdownEmbedder();
    const text = '  ````md\n  <!-- link:file="missing.md" -->\n  `````\n~~~md\n<!-- link:file="missing.md" -->';
    const document = textDocument(path.resolve('example.md'), text);
    assert.deepEqual(await embedder.generateEdits(document), []);
    assert.equal((await embedder.getStaleMatchIndices(document)).size, 0);
});
