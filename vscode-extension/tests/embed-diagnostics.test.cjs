'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const published = [];
const stub = {
    languages: { createDiagnosticCollection: () => ({ set: (...args) => published.push(args), delete() {}, dispose() {} }) },
    workspace: { getWorkspaceFolder: () => undefined },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    Diagnostic: class {},
    DiagnosticSeverity: { Error: 0, Warning: 1 },
};
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
    return request === 'vscode' ? stub : originalLoad.call(this, request, parent, main);
};
const { EmbedDiagnosticsProvider } = require('../integrations/markdown-code-embedder/diagnostics');
Module._load = originalLoad;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('diagnostics coalesce typing and never publish cancelled requests', async () => {
    const provider = new EmbedDiagnosticsProvider();
    const document = { languageId: 'markdown', version: 1, uri: { toString: () => 'file:///test.md' }, getText: () => '' };
    try {
        for (let i = 0; i < 50; i++) provider.updateDiagnostics(document);
        await delay(240);
        assert.equal(published.length, 1);
        provider.updateDiagnostics(document);
        provider.clearDiagnostics(document);
        await delay(240);
        assert.equal(published.length, 1);
    } finally { provider.dispose(); }
});

test('diagnostics discard in-flight results after document changes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-'));
    const provider = new EmbedDiagnosticsProvider();
    const originalAccess = fs.promises.access;
    let release, started;
    const pending = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    fs.promises.access = async () => { started(); await pending; };
    const document = {
        languageId: 'markdown', version: 1,
        uri: { fsPath: path.join(root, 'test.md'), toString: () => 'file:///inflight.md' },
        getText: () => '<!-- link:file="child.md" -->', positionAt: offset => offset,
    };
    try {
        const key = document.uri.toString(), request = {};
        provider.requests.set(key, request);
        const before = published.length;
        const computation = provider.computeDiagnostics(document, key, request);
        await entered;
        document.version++;
        release();
        await computation;
        assert.equal(published.length, before);
    } finally {
        release();
        provider.dispose();
        fs.promises.access = originalAccess;
        fs.rmSync(root, { recursive: true, force: true });
    }
});
