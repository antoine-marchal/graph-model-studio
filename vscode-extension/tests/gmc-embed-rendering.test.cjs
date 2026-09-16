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
            assert.equal(await embedder.buildNewContent(document, { file: './child.notes.md', mode: 'link' }), `\n[${label}](<./child.notes.md>)\n<!-- embed:end -->`);
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
        const link = await embedder.buildNewContent(document, { file: './missing.md', mode: 'link' });
        assert.equal(link, '\n[missing](<./missing.md>)\n<!-- embed:end -->');
        fs.writeFileSync(path.join(root, 'child.md'), '---\ntitle: Hidden\n---\n# Child\n\n```md\n# Example\n```\n');
        assert.equal(await embedder.buildNewContent(document, { file: './child.md', mode: 'link' }), '\n[Child](<./child.md>)\n<!-- embed:end -->');
        const included = await embedder.buildNewContent(document, { file: './child.md', indent: '2' });
        assert.match(included, /### Child/);
        assert.match(included, /```md\n# Example\n```/);
        assert.doesNotMatch(included, /Hidden|---/);
        embedder.expandLinkEmbeds = true;
        const expanded = await embedder.expandNestedMarkdown('  <!-- embed:file="./child.md" mode="link" -->', filename, new Set([filename]), filename);
        assert.match(expanded, /\n  # Child/);
        assert.doesNotMatch(expanded, /Hidden|\[child.md\]/);
        const exportDocument = {
            fileName: filename,
            getText: () => '<!-- embed:file="./child.md" mode="link" -->\nOld generated content\n<!-- embed:end -->',
        };
        assert.match(await prepareExportSource(exportDocument, false), /\[Child\]/);
        const exported = await prepareExportSource(exportDocument, true);
        assert.match(exported, /# Child/);
        assert.doesNotMatch(exported, /Hidden|Old generated content/);
        fs.writeFileSync(path.join(root, 'child.md'), '<!-- embed:file="./index.md" mode="link" -->');
        fs.writeFileSync(filename, 'root');
        await assert.rejects(embedder.buildNewContent(document, { file: './child.md', mode: 'link' }, new Set([filename])), /Circular Markdown embed/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
