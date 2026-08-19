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
