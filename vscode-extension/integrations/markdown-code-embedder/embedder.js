"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownEmbedder = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const utils_1 = require("./utils");
const markdown_paths_1 = require("./markdown-paths");
const REGION_MARKER_REGEX = /^\s*(?:\/\/|--|#|<!--|\/\*)\s*#(?:region|endregion)\b.*(?:-->|\*\/)?$/;
class MarkdownEmbedder {
    constructor() {
        this.endMarkers = new WeakMap();
        this.embedRegex = /<!--\s*(?:embed|link):([^\s]+)(.*?)-->/g;
        this.endEmbedRegex = /<!--\s*(?:embed|link):end\s*-->/;
    }
    /** Find the end marker paired with an embed, accounting for nested embeds. */
    findMatchingEnd(text, fromIndex, fenceRanges = (0, utils_1.getCodeFenceRanges)(text)) {
        let ends = this.endMarkers.get(fenceRanges);
        if (!ends) {
            ends = new Map();
            const stack = [];
            const tokenRegex = /<!--\s*(?:embed|link):(end\b|[^\s]+)(.*?)-->/g;
            let token;
            while ((token = tokenRegex.exec(text)) !== null) {
                if ((0, utils_1.isInCodeFence)(token.index, fenceRanges)) continue;
                if (/^end\b/i.test(token[1]) || /:end$/i.test(token[1])) {
                    const opener = stack.pop();
                    if (opener !== undefined) ends.set(opener, { index: token.index, end: token.index + token[0].length });
                } else {
                    stack.push(token.index + token[0].length);
                }
            }
            this.endMarkers.set(fenceRanges, ends);
        }
        return ends.get(fromIndex);
    }
    findTocEnd(text, fromIndex) {
        const regex = /<!--\s*(?:embed|link):toc:end\s*-->/gi;
        regex.lastIndex = fromIndex;
        const match = regex.exec(text);
        return match ? { index: match.index, end: match.index + match[0].length } : undefined;
    }
    buildTocContent(document, attributes = {}) {
        const text = document.getText();
        const fenceRanges = (0, utils_1.getCodeFenceRanges)(text);
        const requestedMin = parseInt(attributes['min-level'] || attributes['minLevel'] || '1', 10);
        const minLevel = Math.max(1, Math.min(6, isNaN(requestedMin) ? 1 : requestedMin));
        const requestedDepth = parseInt(attributes['depth'] || '', 10);
        const requestedMax = parseInt(attributes['max-level'] || attributes['maxLevel'] || '6', 10);
        const maxLevel = Math.max(minLevel, Math.min(6, !isNaN(requestedDepth)
            ? minLevel + requestedDepth - 1
            : isNaN(requestedMax) ? 6 : requestedMax));
        const duplicates = new Map();
        const entries = [];
        const headingRegex = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
        let match;
        while ((match = headingRegex.exec(text)) !== null) {
            if ((0, utils_1.isInCodeFence)(match.index, fenceRanges))
                continue;
            const level = match[1].length;
            if (level < minLevel || level > maxLevel)
                continue;
            const label = match[2]
                .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                .replace(/<[^>]+>/g, '')
                .replace(/[`*_~]/g, '')
                .trim();
            if (!label)
                continue;
            const baseSlug = label.toLowerCase()
                .replace(/[^\p{L}\p{N}\s-]/gu, '')
                .trim()
                .replace(/\s+/g, '-');
            const count = duplicates.get(baseSlug) || 0;
            duplicates.set(baseSlug, count + 1);
            const slug = count ? `${baseSlug}-${count}` : baseSlug;
            entries.push(`${'  '.repeat(level - minLevel)}- [${label}](#${slug})`);
        }
        return `\n\n${entries.join('\n')}${entries.length ? '\n\n' : ''}<!-- embed:toc:end -->`;
    }
    indentReplacement(content, text, index) {
        if (content === null) return null;
        const prefix = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
        if (!/^[ \t]+$/.test(prefix)) return content;
        return content.split('\n').map((line, i) => i === 0 ? line : prefix + line).join('\n');
    }
    generateEditsForIndex(document, targetIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.generateEdits(document, targetIndex);
        });
    }
    generateEdits(document, onlyIndex) {
        return (0, utils_1.withSourceReads)(() => this._generateEdits(document, onlyIndex));
    }
    _generateEdits(document, onlyIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            const text = document.getText();
            const edits = [];
            const promises = [];
            const fenceRanges = (0, utils_1.getCodeFenceRanges)(text);
            let match;
            const regex = new RegExp(this.embedRegex);
            while ((match = regex.exec(text)) !== null) {
                const fullMatch = match[0];
                const primaryKey = match[1];
                const remainingAttributes = match[2];
                const matchIndex = match.index;
                const matchLen = fullMatch.length;
                if (onlyIndex !== undefined && matchIndex !== onlyIndex) {
                    continue;
                }
                if ((0, utils_1.isInCodeFence)(matchIndex, fenceRanges)) {
                    continue;
                }
                const attributeString = primaryKey + remainingAttributes;
                const attributes = this.parseAttributes(fullMatch);
                if (primaryKey.toLowerCase() === 'toc') {
                    if (attributes['lock'] === 'true')
                        continue;
                    const closeMatch = this.findTocEnd(text, matchIndex + matchLen);
                    const replaceRange = new vscode.Range(document.positionAt(matchIndex + matchLen), document.positionAt(closeMatch ? closeMatch.end : matchIndex + matchLen));
                    if (closeMatch)
                        regex.lastIndex = closeMatch.end;
                    const newContent = this.buildTocContent(document, attributes);
                    if (document.getText(replaceRange) !== newContent)
                        edits.push(vscode.TextEdit.replace(replaceRange, newContent));
                    continue;
                }
                if (!attributes['file']) {
                    continue;
                }
                if (attributes['lock'] === 'true') {
                    continue;
                }
                const closeMatch = this.findMatchingEnd(text, matchIndex + matchLen, fenceRanges);
                let replaceRange;
                if (closeMatch) {
                    replaceRange = new vscode.Range(document.positionAt(matchIndex + matchLen), document.positionAt(closeMatch.end));
                    // Nested directives are regenerated by their outer Markdown
                    // include, so don't create overlapping workspace edits.
                    regex.lastIndex = closeMatch.end;
                }
                else {
                    replaceRange = new vscode.Range(document.positionAt(matchIndex + matchLen), document.positionAt(matchIndex + matchLen));
                }
                const capturedAttributes = Object.assign({}, attributes);
                const capturedRange = replaceRange;
                promises.push((() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const currentContent = document.getText(capturedRange);
                        const newContent = this.indentReplacement(yield this.buildNewContent(document, capturedAttributes, new Set(), undefined, true, currentContent), text, matchIndex);
                        if (newContent === null) {
                            return;
                        }
                        if (currentContent !== newContent) {
                            edits.push(vscode.TextEdit.replace(capturedRange, newContent));
                        }
                    }
                    catch (error) {
                        console.error(`Error embedding ${capturedAttributes['file']}: ${error.message}`);
                    }
                }))());
            }
            yield Promise.all(promises);
            return edits;
        });
    }
    /**
     * Returns match indices of embeds whose current document content differs from source.
     * Used for stale detection in CodeLens.
     */
    getStaleMatchIndices(document) {
        return (0, utils_1.withSourceReads)(() => this._getStaleMatchIndices(document));
    }
    _getStaleMatchIndices(document) {
        return __awaiter(this, void 0, void 0, function* () {
            const text = document.getText();
            const staleSet = new Set();
            const promises = [];
            const fenceRanges = (0, utils_1.getCodeFenceRanges)(text);
            let match;
            const regex = new RegExp(this.embedRegex);
            while ((match = regex.exec(text)) !== null) {
                const fullMatch = match[0];
                const primaryKey = match[1];
                const remainingAttributes = match[2];
                const matchIndex = match.index;
                const matchLen = fullMatch.length;
                const attributeString = primaryKey + remainingAttributes;
                const attributes = this.parseAttributes(fullMatch);
                if ((0, utils_1.isInCodeFence)(matchIndex, fenceRanges)) {
                    continue;
                }
                if (primaryKey.toLowerCase() === 'toc') {
                    if (attributes['lock'] === 'true')
                        continue;
                    const closeMatch = this.findTocEnd(text, matchIndex + matchLen);
                    if (!closeMatch) {
                        staleSet.add(matchIndex);
                        continue;
                    }
                    const replaceRange = new vscode.Range(document.positionAt(matchIndex + matchLen), document.positionAt(closeMatch.end));
                    regex.lastIndex = closeMatch.end;
                    if (document.getText(replaceRange) !== this.buildTocContent(document, attributes))
                        staleSet.add(matchIndex);
                    continue;
                }
                if (!attributes['file'] || attributes['lock'] === 'true') {
                    continue;
                }
                const closeMatch = this.findMatchingEnd(text, matchIndex + matchLen, fenceRanges);
                if (!closeMatch) {
                    // No embed:end → never embedded → stale
                    staleSet.add(matchIndex);
                    continue;
                }
                const replaceRange = new vscode.Range(document.positionAt(matchIndex + matchLen), document.positionAt(closeMatch.end));
                regex.lastIndex = closeMatch.end;
                const currentContent = document.getText(replaceRange);
                const capturedIndex = matchIndex;
                const capturedAttrs = Object.assign({}, attributes);
                const capturedCurrentContent = currentContent;
                promises.push((() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const expectedContent = this.indentReplacement(yield this.buildNewContent(document, capturedAttrs, new Set(), undefined, false), text, capturedIndex);
                        if (expectedContent !== null && capturedCurrentContent !== expectedContent) {
                            staleSet.add(capturedIndex);
                        }
                    }
                    catch (_a) {
                        // Content resolution error — diagnostics will show it, not stale
                    }
                }))());
            }
            yield Promise.all(promises);
            return staleSet;
        });
    }
    /**
     * Builds the full replacement string for an embed (link + fenced code + end tag).
     * Returns null on error.
     */
    buildNewContent(document, attributes, ancestors = new Set(), outputPath, refreshAssets = true, currentContent = '') {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const endTag = attributes.link ? '<!-- link:end -->' : '<!-- embed:end -->';
                const rootPath = outputPath || document.uri.fsPath || document.uri.toString();
                if (attributes.link && !this.expandLinkEmbeds) {
                    const sourcePath = document.uri.fsPath || document.uri.toString();
                    const target = (0, markdown_paths_1.rebaseRelativePath)(attributes['file'], sourcePath, rootPath);
                    const filename = attributes['file'].split(/[\\/]/).pop();
                    let title = path.basename(filename, path.extname(filename));
                    try {
                        const source = yield (0, utils_1.readSource)(document, attributes.file);
                        const firstLine = source.content.replace(/^\uFEFF/, '').replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, '').split(/\r?\n/, 1)[0];
                        const heading = /^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(firstLine);
                        if (heading) title = heading[1];
                    }
                    catch (_) {
                        // Keep links usable when the target cannot be read.
                    }
                    const label = title.replace(/\\/g, '\\\\').replace(/[\[\]]/g, '\\$&');
                    const indent = Number(attributes.indent || 0);
                    const prefix = Number.isInteger(indent) && indent > 0 && indent <= 1000 ? ' '.repeat(indent) : '';
                    return `\n${prefix}[${label}](<${target.replace(/>/g, '%3E').replace(/</g, '%3C')}>)\n${prefix}${endTag}`;
                }
                const embedResult = yield this.resolveContent(document, attributes);
                const lang = (0, utils_1.getLanguageId)(attributes['file']);
                const rootOutputPath = outputPath || ((0, utils_1.isUrl)(document.uri.toString())
                    ? document.uri.toString()
                    : document.uri.fsPath);
                let renderedContent;
                if (lang === 'markdown') {
                    const sourceKey = embedResult.resolvedPath;
                    if (ancestors.has(sourceKey)) {
                        throw new Error(`Circular Markdown embed detected at ${sourceKey}`);
                    }
                    const nestedAncestors = new Set(ancestors);
                    nestedAncestors.add(sourceKey);
                    const rebasedContent = (0, markdown_paths_1.rewriteMarkdownLinks)(embedResult.content.replace(/^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, ''), sourceKey, rootOutputPath);
                    renderedContent = yield this.expandNestedMarkdown(rebasedContent, sourceKey, nestedAncestors, rootOutputPath, refreshAssets);
                    const headingIndent = parseInt(attributes['indent'], 10);
                    if (!isNaN(headingIndent) && headingIndent > 0) {
                        renderedContent = this.shiftMarkdownHeadings(renderedContent, headingIndent);
                    }
                }
                else if (lang === 'gmc' && !(0, utils_1.isUrl)(embedResult.resolvedPath)) {
                    const requestedView = attributes['view'];
                    const viewSuffix = requestedView
                        ? `-${requestedView.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'view'}`
                        : '';
                    const pngPath = path.join(
                        path.dirname(embedResult.resolvedPath),
                        `${path.basename(embedResult.resolvedPath, path.extname(embedResult.resolvedPath))}${viewSuffix}.png`,
                    );
                    const hashInput = requestedView
                        ? `${embedResult.content}\0view=${requestedView}`
                        : embedResult.content;
                    const sourceHash = crypto.createHash('sha256').update(hashInput, 'utf8').digest('hex');
                    const previousHash = /<!--\s*gmc-source-sha256:([a-f0-9]{64})\s*-->/i.exec(currentContent)?.[1];
                    if (refreshAssets && (previousHash !== sourceHash || !fs.existsSync(pngPath))) {
                        yield vscode.commands.executeCommand(
                            'gmc.renderFilePng',
                            vscode.Uri.file(embedResult.resolvedPath),
                            vscode.Uri.file(pngPath),
                            requestedView,
                        );
                    }
                    const imagePath = (0, markdown_paths_1.rebaseRelativePath)(
                        `./${path.basename(pngPath)}`,
                        embedResult.resolvedPath,
                        rootOutputPath,
                    );
                    const imageLabel = path.basename(embedResult.resolvedPath, path.extname(embedResult.resolvedPath));
                    renderedContent = `![${imageLabel}](${imagePath})\n<!-- gmc-source-sha256:${sourceHash} -->`;
                }
                else {
                    renderedContent = `\`\`\`${lang}\n${embedResult.content}\n\`\`\``;
                }
                let newContent = `\n${renderedContent}\n${endTag}`;
                if (lang !== 'markdown' && attributes['indent']) {
                    const spaces = parseInt(attributes['indent'], 10);
                    if (!isNaN(spaces) && spaces > 0) {
                        const prefix = ' '.repeat(spaces);
                        newContent = newContent.split('\n').map((line, i) => i === 0 ? line : prefix + line).join('\n');
                    }
                }
                return newContent;
            }
            catch (error) {
                if (this.expandLinkEmbeds) throw error;
                console.error(`Error building embed content for ${attributes['file']}: ${error.message}`);
                return null;
            }
        });
    }
    /** Increase ATX heading depth without touching headings inside code fences. */
    shiftMarkdownHeadings(content, amount) {
        let fence;
        return content.split(/\r?\n/).map(line => {
            const marker = /^\s*(`{3,}|~{3,})/.exec(line);
            if (marker) {
                const character = marker[1][0];
                if (!fence) {
                    fence = { character, length: marker[1].length };
                }
                else if (fence.character === character && marker[1].length >= fence.length) {
                    fence = undefined;
                }
                return line;
            }
            if (fence) {
                return line;
            }
            return line.replace(/^(\s*)(#{1,6})([ \t]+)/, (_match, prefix, hashes, spacing) => {
                return prefix + '#'.repeat(Math.min(6, hashes.length + amount)) + spacing;
            });
        }).join('\n');
    }
    /** Expand Markdown includes recursively, resolving children relative to their parent file. */
    expandNestedMarkdown(content, resolvedPath, ancestors, outputPath, refreshAssets = true) {
        return (0, utils_1.withSourceReads)(() => this._expandNestedMarkdown(content, resolvedPath, ancestors, outputPath, refreshAssets));
    }
    _expandNestedMarkdown(content, resolvedPath, ancestors, outputPath, refreshAssets = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const regex = new RegExp(this.embedRegex.source, 'g');
            const fenceRanges = (0, utils_1.getCodeFenceRanges)(content);
            const document = { uri: (0, utils_1.isUrl)(resolvedPath) ? vscode.Uri.parse(resolvedPath) : vscode.Uri.file(resolvedPath) };
            let cursor = 0;
            let result = '';
            let match;
            while ((match = regex.exec(content)) !== null) {
                if ((0, utils_1.isInCodeFence)(match.index, fenceRanges)) {
                    continue;
                }
                const attributes = this.parseAttributes(match[0]);
                if (!attributes['file']) {
                    continue;
                }
                if ((0, utils_1.isUrl)(resolvedPath) && !(0, utils_1.isUrl)(attributes['file'])) {
                    attributes['file'] = new URL(attributes['file'], resolvedPath).href;
                }
                const closeMatch = this.findMatchingEnd(content, match.index + match[0].length, fenceRanges);
                const outputTag = (0, markdown_paths_1.rewriteEmbedTag)(match[0], resolvedPath, outputPath);
                result += content.slice(cursor, match.index) + outputTag;
                if (attributes['lock'] === 'true') {
                    const end = closeMatch ? closeMatch.end : match.index + match[0].length;
                    result += content.slice(match.index + match[0].length, end);
                    cursor = end;
                    regex.lastIndex = end;
                    continue;
                }
                const existingContent = closeMatch
                    ? content.slice(match.index + match[0].length, closeMatch.end)
                    : '';
                const replacement = yield this.buildNewContent(document, attributes, ancestors, outputPath, refreshAssets, existingContent);
                if (replacement === null) {
                    const end = closeMatch ? closeMatch.end : match.index + match[0].length;
                    result += content.slice(match.index + match[0].length, end);
                    cursor = end;
                    regex.lastIndex = end;
                    continue;
                }
                result += this.indentReplacement(replacement, content, match.index);
                cursor = closeMatch ? closeMatch.end : match.index + match[0].length;
                regex.lastIndex = cursor;
            }
            return result + content.slice(cursor);
        });
    }
    /**
     * Removes any legacy `<!-- Error embedding ... -->` comments written by older versions.
     */
    cleanLegacyErrorComments(document) {
        const text = document.getText();
        const edits = [];
        const errorRegex = /\n?<!--\s*Error embedding [^>]+-->/g;
        let match;
        while ((match = errorRegex.exec(text)) !== null) {
            const start = document.positionAt(match.index);
            const end = document.positionAt(match.index + match[0].length);
            edits.push(vscode.TextEdit.delete(new vscode.Range(start, end)));
        }
        return edits;
    }
    parseAttributes(str) {
        const attrs = {};
        if (/^<!--\s*link:/.test(str)) attrs.link = true;
        const attrRegex = /([a-zA-Z0-9-_]+)=["']([^"']+)["']/g;
        let match;
        while ((match = attrRegex.exec(str)) !== null) {
            attrs[match[1]] = match[2];
        }
        return attrs;
    }
    resolveContent(document, attrs) {
        return __awaiter(this, void 0, void 0, function* () {
            const { content: fileContent, resolvedPath } = yield (0, utils_1.readSource)(document, attrs.file);
            const lines = fileContent.split(/\r?\n/);
            let content = fileContent;
            let startLine;
            let endLine;
            if (attrs['line']) {
                const [start, end] = attrs['line'].split('-').map(n => parseInt(n, 10));
                if (isNaN(start) || isNaN(end)) {
                    throw new Error('Invalid line format');
                }
                content = lines.slice(start - 1, end).join('\n');
                startLine = start;
                endLine = end;
            }
            else if (attrs['region']) {
                const includeMarkers = attrs['strip-comments'] === 'false';
                const regionData = this.extractRegion(lines, attrs['region'], includeMarkers);
                content = regionData.content;
                startLine = regionData.startLine;
                endLine = regionData.endLine;
            }
            // For full-file / line-range embeds: strip any #region/#endregion lines unless disabled
            if (!attrs['region'] && attrs['strip-comments'] !== 'false') {
                content = content.split(/\r?\n/)
                    .filter(line => !REGION_MARKER_REGEX.test(line))
                    .join('\n');
            }
            // Strip common indentation
            content = this.stripIndentation(content);
            // Handle 'new' attribute for line highlighting
            if (attrs['new']) {
                const newLines = new Set();
                attrs['new'].split(',').forEach(part => {
                    if (part.includes('-')) {
                        const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let i = start; i <= end; i++) {
                                newLines.add(i);
                            }
                        }
                    }
                    else {
                        const line = parseInt(part.trim(), 10);
                        if (!isNaN(line)) {
                            newLines.add(line);
                        }
                    }
                });
                const langId = (0, utils_1.getLanguageId)(resolvedPath);
                const [commentPrefix, commentSuffix] = (0, utils_1.getCommentPrefix)(langId);
                const linesToProcess = content.split(/\r?\n/);
                let maxLineLength = 0;
                linesToProcess.forEach(line => {
                    if (line.length > maxLineLength) {
                        maxLineLength = line.length;
                    }
                });
                const processedLines = linesToProcess.map((line, index) => {
                    const originalLineNumber = (startLine || 1) + index;
                    if (newLines.has(originalLineNumber)) {
                        const padding = ' '.repeat(maxLineLength - line.length + 1);
                        const suffix = `${padding}${commentPrefix} NEW${commentSuffix}`;
                        return line + suffix;
                    }
                    return line;
                });
                content = processedLines.join('\n');
            }
            // Handle 'withLineNumbers' attribute
            if (attrs['withLineNumbers'] === 'true') {
                const linesToProcess = content.split(/\r?\n/);
                const maxLineNumber = (startLine || 1) + linesToProcess.length - 1;
                const maxLineNumberWidth = maxLineNumber.toString().length;
                const processedLines = linesToProcess.map((line, index) => {
                    const originalLineNumber = (startLine || 1) + index;
                    const paddedLineNumber = originalLineNumber.toString().padStart(maxLineNumberWidth, ' ');
                    return `${paddedLineNumber}: ${line}`;
                });
                content = processedLines.join('\n');
            }
            return {
                content,
                resolvedPath,
                startLine,
                endLine
            };
        });
    }
    extractRegion(lines, regionName, includeMarkers = false) {
        const regionStartRegex = new RegExp(`^\\s*(?:\\/\\/|--|#|<!--|\\/\\*)\\s*#region\\s+${regionName}\\s*(?:-->|\\*\\/)?$`);
        const regionEndRegex = new RegExp(`^\\s*(?:\\/\\/|--|#|<!--|\\/\\*)\\s*#endregion\\s*(?:-->|\\*\\/)?`);
        let startIdx = -1; // 0-based index of the #region line
        let endIdx = -1; // 0-based index of the #endregion line
        for (let i = 0; i < lines.length; i++) {
            if (regionStartRegex.test(lines[i])) {
                startIdx = i;
                continue;
            }
            if (startIdx !== -1 && regionEndRegex.test(lines[i])) {
                endIdx = i;
                break;
            }
        }
        if (startIdx !== -1 && endIdx !== -1) {
            const sliceFrom = includeMarkers ? startIdx : startIdx + 1;
            const sliceTo = includeMarkers ? endIdx + 1 : endIdx;
            return {
                content: lines.slice(sliceFrom, sliceTo).join('\n'),
                startLine: startIdx + 2,
                endLine: endIdx // 1-based, last content line
            };
        }
        throw new Error(`Region ${regionName} not found`);
    }
    stripIndentation(content) {
        const lines = content.split(/\r?\n/);
        let minIndent = Infinity;
        for (const line of lines) {
            if (line.trim().length === 0) {
                continue;
            }
            const match = line.match(/^(\s*)/);
            if (match) {
                minIndent = Math.min(minIndent, match[1].length);
            }
        }
        if (minIndent === Infinity || minIndent === 0) {
            return content;
        }
        return lines.map(line => {
            if (line.length < minIndent) {
                return '';
            }
            return line.substring(minIndent);
        }).join('\n');
    }
}
exports.MarkdownEmbedder = MarkdownEmbedder;
//# sourceMappingURL=embedder.js.map
