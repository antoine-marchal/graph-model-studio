"use strict";

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    rebaseRelativePath,
    rewriteEmbedTag,
    rewriteMarkdownLinks,
} = require('../integrations/markdown-code-embedder/markdown-paths');

const rootDocument = path.join('C:', 'workspace', 'docs', 'index.md');
const firstEmbed = path.join('C:', 'workspace', 'docs', 'processusM', 'dashboard.md');

test('rebases nested embed paths from the first embedded file to the root document', () => {
    const tag = '<!-- embed:file="./demande-création-modification-dashboard.gmc" -->';
    assert.equal(
        rewriteEmbedTag(tag, firstEmbed, rootDocument),
        '<!-- embed:file="./processusM/demande-création-modification-dashboard.gmc" -->',
    );
});

test('accumulates the parent directories through multiple nested embed levels', () => {
    const secondEmbed = path.join('C:', 'workspace', 'docs', 'processusM', 'details', 'steps.md');
    const tag = '<!-- embed:file="../models/workflow.gmc" -->';
    assert.equal(
        rewriteEmbedTag(tag, secondEmbed, rootDocument),
        '<!-- embed:file="./processusM/models/workflow.gmc" -->',
    );
});

test('rebases Markdown hyperlinks, images, references, and HTML links', () => {
    const markdown = [
        '[Source](./demande-évolution-ajout-source.md)',
        '![Schéma](./images/process.png)',
        '[Publication][publication]',
        '[publication]: ../publication.md#validation',
        '<a href="./details/info.md">Détails</a>',
        '[Externe](https://example.com/doc)',
        '[Ancre](#processus)',
    ].join('\n');

    assert.equal(rewriteMarkdownLinks(markdown, firstEmbed, rootDocument), [
        '[Source](./processusM/demande-évolution-ajout-source.md)',
        '![Schéma](./processusM/images/process.png)',
        '[Publication][publication]',
        '[publication]: ./publication.md#validation',
        '<a href="./processusM/details/info.md">Détails</a>',
        '[Externe](https://example.com/doc)',
        '[Ancre](#processus)',
    ].join('\n'));
});

test('does not rewrite links shown inside fenced code blocks', () => {
    const markdown = '```md\n[Example](./unchanged.md)\n```\n[Real](./changed.md)';
    assert.equal(
        rewriteMarkdownLinks(markdown, firstEmbed, rootDocument),
        '```md\n[Example](./unchanged.md)\n```\n[Real](./processusM/changed.md)',
    );
});

test('resolves relative paths from remote Markdown sources as absolute URLs', () => {
    assert.equal(
        rebaseRelativePath('../assets/model.gmc', 'https://example.com/docs/process/main.md', rootDocument),
        'https://example.com/docs/assets/model.gmc',
    );
});
