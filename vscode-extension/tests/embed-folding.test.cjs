"use strict";

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const esbuild = require('esbuild');

class FoldingRange {
    constructor(start, end, kind) {
        this.start = start;
        this.end = end;
        this.kind = kind;
    }
}

const vscodeStub = {
    FoldingRange,
    FoldingRangeKind: { Region: 'region' },
};

const built = esbuild.buildSync({
    entryPoints: [require.resolve('../src/embed-folding.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
    write: false,
});
const foldingModule = new Module('embed-folding-test');
foldingModule.paths = module.paths;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeStub;
    return originalLoad.call(this, request, parent, isMain);
};
foldingModule._compile(built.outputFiles[0].text, 'embed-folding-test.cjs');
Module._load = originalLoad;

const { embedFoldingRanges } = foldingModule.exports;

function documentFrom(lines) {
    return {
        lineCount: lines.length,
        lineAt(line) { return { text: lines[line] }; },
    };
}

test('embed ranges take priority over Markdown headings crossing either boundary', () => {
    const document = documentFrom([
        '# Main',
        '',
        '## Chapter A',
        '<!-- embed:file="./A.md" -->',
        '# A1',
        'generated content',
        '<!-- embed:file="./A1.md" -->',
        'nested content',
        '<!-- embed:end -->',
        '<!-- embed:end -->',
        '',
        '<!-- embed:file="./B1.md" -->',
        '',
        '<!-- embed:end -->',
    ]);

    assert.deepEqual(
        embedFoldingRanges(document).map(({ start, end }) => [start, end]),
        [
            [0, 9],
            [2, 9],
            [3, 9],
            [4, 9],
            [6, 8],
            [11, 13],
        ],
    );
});

test('headings in fenced generated code do not create folding guards', () => {
    const document = documentFrom([
        '<!-- embed:file="./example.md" -->',
        '```md',
        '# Not a chapter',
        '```',
        '<!-- embed:end -->',
    ]);

    assert.deepEqual(
        embedFoldingRanges(document).map(({ start, end }) => [start, end]),
        [[0, 4]],
    );
});
