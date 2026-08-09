"use strict";

const path = require("path");

function isUrl(value) {
    return /^https?:\/\//i.test(value);
}

function isExternalOrAbsolute(value) {
    return !value ||
        value.startsWith('#') ||
        value.startsWith('/') ||
        value.startsWith('\\') ||
        /^[a-z][a-z0-9+.-]*:/i.test(value) ||
        /^[a-z]:[\\/]/i.test(value);
}

function splitSuffix(value) {
    const index = value.search(/[?#]/);
    return index === -1
        ? { pathname: value, suffix: '' }
        : { pathname: value.slice(0, index), suffix: value.slice(index) };
}

/** Resolve a path from an embedded Markdown file and express it from the root document. */
function rebaseRelativePath(value, sourcePath, outputPath) {
    if (isExternalOrAbsolute(value)) {
        return value;
    }

    if (isUrl(sourcePath)) {
        return new URL(value, sourcePath).href;
    }

    if (!outputPath || isUrl(outputPath)) {
        return value;
    }

    const { pathname, suffix } = splitSuffix(value);
    if (!pathname) {
        return value;
    }

    const absoluteTarget = path.resolve(path.dirname(sourcePath), pathname);
    let relativeTarget = path.relative(path.dirname(outputPath), absoluteTarget).split(path.sep).join('/');
    if (!relativeTarget.startsWith('.')) {
        relativeTarget = `./${relativeTarget}`;
    }
    return relativeTarget + suffix;
}

function rewriteTarget(rawTarget, sourcePath, outputPath) {
    const angled = rawTarget.startsWith('<') && rawTarget.endsWith('>');
    const target = angled ? rawTarget.slice(1, -1) : rawTarget;
    const rewritten = rebaseRelativePath(target, sourcePath, outputPath);
    return angled ? `<${rewritten}>` : rewritten;
}

function rewriteMarkdownSegment(segment, sourcePath, outputPath) {
    let rewritten = segment.replace(
        /(!?\[[^\]\r\n]*\]\(\s*)(<[^>\r\n]+>|[^\s)]+)([^)\r\n]*\))/g,
        (_match, prefix, target, suffix) => prefix + rewriteTarget(target, sourcePath, outputPath) + suffix,
    );

    rewritten = rewritten.replace(
        /^(\s{0,3}\[[^\]\r\n]+\]:\s*)(<[^>\r\n]+>|\S+)(.*)$/gm,
        (_match, prefix, target, suffix) => prefix + rewriteTarget(target, sourcePath, outputPath) + suffix,
    );

    rewritten = rewritten.replace(
        /(<(?:a|img)\b[^>]*?\s(?:href|src)\s*=\s*["'])([^"']+)(["'])/gi,
        (_match, prefix, target, suffix) => prefix + rebaseRelativePath(target, sourcePath, outputPath) + suffix,
    );
    return rewritten;
}

/** Rewrite Markdown links and images, but never examples inside fenced code blocks. */
function rewriteMarkdownLinks(content, sourcePath, outputPath) {
    const fenceRegex = /^(`{3,}|~{3,})[^\n]*(?:\n|$)[\s\S]*?^\1\s*$/gm;
    let cursor = 0;
    let result = '';
    let match;
    while ((match = fenceRegex.exec(content)) !== null) {
        result += rewriteMarkdownSegment(content.slice(cursor, match.index), sourcePath, outputPath);
        result += match[0];
        cursor = match.index + match[0].length;
    }
    return result + rewriteMarkdownSegment(content.slice(cursor), sourcePath, outputPath);
}

/** Rewrite only the file attribute displayed by a nested embed directive. */
function rewriteEmbedTag(tag, sourcePath, outputPath) {
    return tag.replace(
        /(\bfile\s*=\s*["'])([^"']+)(["'])/i,
        (_match, prefix, target, suffix) => prefix + rebaseRelativePath(target, sourcePath, outputPath) + suffix,
    );
}

module.exports = {
    rebaseRelativePath,
    rewriteEmbedTag,
    rewriteMarkdownLinks,
};
