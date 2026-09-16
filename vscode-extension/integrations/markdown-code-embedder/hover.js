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
exports.EmbedHoverProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const utils_1 = require("./utils");
const ATTR_REGEX = /([a-zA-Z0-9-_]+)=["']([^"']+)["']/g;
const REGION_START_REGEX = (name) => new RegExp(`^\\s*(?:\\/\\/|--|#|<!--|\\/\\*)\\s*#region\\s+${name}\\s*(?:-->|\\*\\/)?$`);
const REGION_END_REGEX = /^\s*(?:\/\/|--|#|<!--|\/\*)\s*#endregion\s*(?:-->|\*\/)?/;
class EmbedHoverProvider {
    provideHover(document, position) {
        return __awaiter(this, void 0, void 0, function* () {
            const range = document.getWordRangeAtPosition(position, /<!--\s*(?:embed|link):.*?-->/);
            if (!range) {
                return undefined;
            }
            const text = document.getText(range);
            const attrs = {};
            const attrRegex = new RegExp(ATTR_REGEX.source, 'g');
            let attrMatch;
            while ((attrMatch = attrRegex.exec(text)) !== null) {
                attrs[attrMatch[1]] = attrMatch[2];
            }
            if (!attrs['file']) {
                return undefined;
            }
            let fileContent = '';
            let resolvedPath = '';
            if ((0, utils_1.isUrl)(attrs['file'])) {
                resolvedPath = attrs['file'];
                try {
                    fileContent = yield (0, utils_1.fetchUrl)(attrs['file']);
                }
                catch (e) {
                    const md = new vscode.MarkdownString(`**Embed Error:** ${e.message}`);
                    return new vscode.Hover(md, range);
                }
            }
            else {
                try {
                    resolvedPath = yield (0, utils_1.resolveFilePath)(document, attrs['file']);
                }
                catch (_a) {
                    const md = new vscode.MarkdownString(`**Embed Error:** File not found: \`${attrs['file']}\``);
                    return new vscode.Hover(md, range);
                }
                try {
                    fileContent = yield fs.promises.readFile(resolvedPath, 'utf-8');
                }
                catch (error) {
                    const md = new vscode.MarkdownString(`**Embed Error:** ${error.message}`);
                    return new vscode.Hover(md, range);
                }
            }
            try {
                const lines = fileContent.split(/\r?\n/);
                const lang = (0, utils_1.getLanguageId)(attrs['file']);
                let previewContent;
                let locationLabel;
                if (attrs['region']) {
                    const regionRegex = REGION_START_REGEX(attrs['region']);
                    let startLine = -1;
                    let endLine = -1;
                    for (let i = 0; i < lines.length; i++) {
                        if (regionRegex.test(lines[i])) {
                            startLine = i + 1;
                            continue;
                        }
                        if (startLine !== -1 && REGION_END_REGEX.test(lines[i])) {
                            endLine = i;
                            break;
                        }
                    }
                    if (startLine === -1 || endLine === -1) {
                        const md = new vscode.MarkdownString(`**Embed Error:** Region \`${attrs['region']}\` not found in \`${attrs['file']}\``);
                        return new vscode.Hover(md, range);
                    }
                    previewContent = lines.slice(startLine, endLine).join('\n');
                    locationLabel = `region: ${attrs['region']}`;
                }
                else if (attrs['line']) {
                    const parts = attrs['line'].split('-').map(n => parseInt(n, 10));
                    previewContent = lines.slice(parts[0] - 1, parts[1]).join('\n');
                    locationLabel = `lines: ${attrs['line']}`;
                }
                else {
                    // Full file — limit preview to avoid huge hover
                    const MAX_LINES = 40;
                    const allLines = lines;
                    previewContent = allLines.slice(0, MAX_LINES).join('\n');
                    if (allLines.length > MAX_LINES) {
                        previewContent += `\n... (${allLines.length - MAX_LINES} more lines)`;
                    }
                    locationLabel = `full file`;
                }
                // Strip common indentation
                previewContent = stripIndentation(previewContent);
                const relPath = (0, utils_1.isUrl)(attrs['file'])
                    ? attrs['file']
                    : path.relative(path.dirname(document.uri.fsPath), resolvedPath).split(path.sep).join('/');
                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                md.appendMarkdown(`**Embed Preview** — \`${relPath}\` (${locationLabel})\n\n`);
                md.appendCodeblock(previewContent, lang);
                return new vscode.Hover(md, range);
            }
            catch (error) {
                const md = new vscode.MarkdownString(`**Embed Error:** ${error.message}`);
                return new vscode.Hover(md, range);
            }
        });
    }
}
exports.EmbedHoverProvider = EmbedHoverProvider;
function stripIndentation(content) {
    const lines = content.split(/\r?\n/);
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) {
            continue;
        }
        const m = line.match(/^(\s*)/);
        if (m) {
            minIndent = Math.min(minIndent, m[1].length);
        }
    }
    if (minIndent === Infinity || minIndent === 0) {
        return content;
    }
    return lines.map(line => line.length < minIndent ? '' : line.substring(minIndent)).join('\n');
}
//# sourceMappingURL=hover.js.map