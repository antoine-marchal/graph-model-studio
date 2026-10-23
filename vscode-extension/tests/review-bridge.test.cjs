"use strict";
const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const esbuild = require('esbuild');

function load(source, vscode = {}) {
    const built = esbuild.buildSync({ entryPoints: [require.resolve(source)], bundle: true,
        format: 'cjs', platform: 'node', external: ['vscode'], write: false });
    const instance = new Module('review-test');
    instance.paths = module.paths;
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
    };
    try { instance._compile(built.outputFiles[0].text, 'review-test.cjs'); }
    finally { Module._load = originalLoad; }
    return instance.exports;
}

test('rendered review binds every action to the host document URI', async () => {
    const calls = [];
    const messages = [];
    const vscode = { commands: {
        getCommands: async () => ['projectIntegration.mrReview.rendered'],
        executeCommand: async (...args) => { calls.push(args); return { threads: [] }; },
    } };
    const { sendReview } = load('../rich-editor/src/review.ts', vscode);
    const document = { uri: { scheme: 'pi-mr', toString: () => 'pi-mr:/trusted.md?revision' } };
    await sendReview(document, { postMessage: async (msg) => messages.push(msg) }, {
        action: 'create', requestId: 7, uri: 'file:///untrusted.md', line: 11, text: 'Check this',
    });
    assert.equal(calls[0][0], 'projectIntegration.mrReview.rendered');
    assert.equal(calls[0][1].uri, 'pi-mr:/trusted.md?revision');
    assert.equal(calls[0][1].line, 11);
    assert.equal(messages[0].requestId, 7);
    assert.deepEqual(messages[0].data, { threads: [] });
    await sendReview({ uri: { scheme: 'file' } }, { postMessage: async () => {} }, { action: 'load' });
    assert.equal(calls.length, 1);
});

test('unsupported actions, missing integration and API failures report errors without acknowledging posts', async () => {
    const messages = [];
    const vscode = { commands: { getCommands: async () => [], executeCommand: async () => { throw new Error('Forbidden'); } } };
    const { sendReview } = load('../rich-editor/src/review.ts', vscode);
    const document = { uri: { scheme: 'pi-mr', toString: () => 'pi-mr:/file.md' } };
    const webview = { postMessage: async (msg) => messages.push(msg) };
    await sendReview(document, webview, { action: 'delete-all' });
    assert.match(messages.pop().error, /Unsupported/);
    await sendReview(document, webview, { action: 'load' });
    assert.match(messages.pop().error, /Update Project Integration/);
    vscode.commands.getCommands = async () => ['projectIntegration.mrReview.rendered'];
    await sendReview(document, webview, { action: 'create', requestId: 4, text: 'Keep draft' });
    assert.deepEqual(messages.pop(), { type: 'reviewResult', action: 'create', requestId: 4, error: 'Forbidden' });
});

test('source block matching ignores only extra empty caret paragraphs', () => {
    const { reviewBlockIndex, renderedSourceBlocks, sourceBlockCount } = load('../rich-editor/webview/review.ts');
    assert.equal(reviewBlockIndex([5, 7, 11], 3), -1);
    assert.equal(reviewBlockIndex([5, 7, 11], 10), 1);
    assert.equal(reviewBlockIndex([5, 7, 11], 11), 2);
    const heading = { tagName: 'H1', textContent: 'Heading', children: [] };
    const empty = { tagName: 'P', textContent: '', children: [{ tagName: 'BR' }] };
    const image = { tagName: 'P', textContent: '', children: [{ tagName: 'IMG' }] };
    assert.deepEqual(renderedSourceBlocks({ children: [heading, empty] }, 1), [heading]);
    assert.deepEqual(renderedSourceBlocks({ children: [heading, image] }, 1), [heading, image]);
    assert.deepEqual(renderedSourceBlocks({ children: [heading, empty] }, 2), [heading, empty]);
    const slot = { tagName: 'DIV', classList: { contains: (c) => c === 'rv-slot' }, children: [] };
    assert.deepEqual(renderedSourceBlocks({ children: [heading, slot, empty] }, 1), [heading]);
    const node = (name, size) => ({ type: { name }, content: { size } });
    const doc = (nodes) => ({ childCount: nodes.length, child: (i) => nodes[i] });
    assert.equal(sourceBlockCount(doc([node('heading', 3), node('paragraph', 0)]), 1), 1);
    assert.equal(sourceBlockCount(doc([node('heading', 3), node('paragraph', 0)]), 2), 2);
    assert.equal(sourceBlockCount(doc([node('heading', 3), node('table', 9)]), 1), 2);
});

test('slides MR base links a local file to the merge request revision found by the companion', async () => {
    const calls = [];
    let head = 'pi-mr:/deck.md?head';
    const vscode = {
        Uri: { parse: (s) => ({ scheme: 'pi-mr', toString: () => s }) },
        workspace: { workspaceFolders: [] },
        commands: {
            getCommands: async () => ['projectIntegration.mrReview.localRevision'],
            executeCommand: async (...args) => (calls.push(args), head),
        },
    };
    const { linkMrRevision, mrTwin } = load('../slides-studio/packages/extension/src/review.ts', vscode);
    const uri = { scheme: 'file', fsPath: 'C:\repo\Deck.md', toString: () => 'file:///c%3A/repo/Deck.md' };
    assert.equal(mrTwin(uri), undefined);
    assert.equal(await linkMrRevision({ uri }), true);
    assert.deepEqual(calls[0], ['projectIntegration.mrReview.localRevision', 'file:///c%3A/repo/Deck.md']);
    assert.equal(mrTwin(uri).toString(), 'pi-mr:/deck.md?head');
    head = 'pi-mr:/deck.md?pushed';
    assert.equal(await linkMrRevision({ uri }), true, 're-resolved: follows a push');
    assert.equal(mrTwin(uri).toString(), 'pi-mr:/deck.md?pushed');
});

test('markdown local file reviews through the branch merge request revision', async () => {
    const calls = [];
    const messages = [];
    let mrText = '# Doc\n';
    const vscode = {
        Uri: { parse: (s) => ({ toString: () => s }) },
        workspace: { openTextDocument: async () => ({ getText: () => mrText }) },
        commands: {
            getCommands: async () => ['projectIntegration.mrReview.rendered', 'projectIntegration.mrReview.localRevision'],
            executeCommand: async (...args) => (calls.push(args), args[0].endsWith('localRevision') ? 'pi-mr:/doc.md?head' : { canCreate: true, threads: [] }),
        },
    };
    const { linkMrRevision, sendReview } = load('../rich-editor/src/review.ts', vscode);
    const document = { uri: { scheme: 'file', fsPath: 'C:\repo\doc.md', toString: () => 'file:///c%3A/repo/doc.md' }, getText: () => '# Doc\n' };
    const webview = { postMessage: async (msg) => messages.push(msg) };
    await sendReview(document, webview, { action: 'load' });
    assert.equal(messages.length, 0, 'unlinked local file: no review');
    assert.equal(await linkMrRevision(document), true);
    await sendReview(document, webview, { action: 'load' });
    assert.equal(calls.at(-1)[1].uri, 'pi-mr:/doc.md?head');
    assert.equal(messages.pop().data.canCreate, true);
    mrText = '# Other\n';
    await sendReview(document, webview, { action: 'load' });
    const data = messages.pop().data;
    assert.equal(data.canCreate, false);
    assert.match(data.notice, /differs/);
});
