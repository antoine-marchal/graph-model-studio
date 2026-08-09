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
exports.EmbedDiagnosticsProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const utils_1 = require("./utils");
const EMBED_REGEX = /<!--\s*embed:([^\s]+)(.*?)-->/g;
const ATTR_REGEX = /([a-zA-Z0-9-_]+)=["']([^"']+)["']/g;
const REGION_START_REGEX = (name) => new RegExp(`^\\s*(?:\\/\\/|--|#|<!--|\\/\\*)\\s*#region\\s+${name}\\s*(?:-->|\\*\\/)?$`);
class EmbedDiagnosticsProvider {
    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('markdown-embed');
    }
    get diagnosticCollection() {
        return this.collection;
    }
    updateDiagnostics(document) {
        return __awaiter(this, void 0, void 0, function* () {
            if (document.languageId !== 'markdown') {
                return;
            }
            const text = document.getText();
            const diagnostics = [];
            const fenceRanges = (0, utils_1.getCodeFenceRanges)(text);
            const regex = new RegExp(EMBED_REGEX.source, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                const fullMatch = match[0];
                const primaryKey = match[1];
                const remainingAttributes = match[2];
                const attributeString = primaryKey + remainingAttributes;
                const attrs = {};
                const attrRegex = new RegExp(ATTR_REGEX.source, 'g');
                let attrMatch;
                while ((attrMatch = attrRegex.exec(attributeString)) !== null) {
                    attrs[attrMatch[1]] = attrMatch[2];
                }
                if (!attrs['file']) {
                    continue;
                }
                // Skip tags inside fenced code blocks
                if ((0, utils_1.isInCodeFence)(match.index, fenceRanges)) {
                    continue;
                }
                // URL embeds: skip local-file validation
                if ((0, utils_1.isUrl)(attrs['file'])) {
                    continue;
                }
                const matchStart = document.positionAt(match.index);
                const matchEnd = document.positionAt(match.index + fullMatch.length);
                const range = new vscode.Range(matchStart, matchEnd);
                // Check file exists
                let resolvedPath;
                try {
                    resolvedPath = yield (0, utils_1.resolveFilePath)(document, attrs['file']);
                }
                catch (_a) {
                    const diag = new vscode.Diagnostic(range, `Embed file not found: "${attrs['file']}"`, vscode.DiagnosticSeverity.Error);
                    diag.source = 'markdown-embed';
                    diagnostics.push(diag);
                    continue;
                }
                // Check region exists
                if (attrs['region']) {
                    try {
                        const content = yield fs.promises.readFile(resolvedPath, 'utf-8');
                        const lines = content.split(/\r?\n/);
                        const regionRegex = REGION_START_REGEX(attrs['region']);
                        const found = lines.some(l => regionRegex.test(l));
                        if (!found) {
                            const diag = new vscode.Diagnostic(range, `Region "${attrs['region']}" not found in "${attrs['file']}"`, vscode.DiagnosticSeverity.Error);
                            diag.source = 'markdown-embed';
                            diagnostics.push(diag);
                        }
                    }
                    catch (_b) {
                        // file read error already caught above
                    }
                }
                // Check line range validity
                if (attrs['line']) {
                    const parts = attrs['line'].split('-').map(n => parseInt(n, 10));
                    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] > parts[1]) {
                        const diag = new vscode.Diagnostic(range, `Invalid line range "${attrs['line']}". Format: "start-end" (e.g. "1-10")`, vscode.DiagnosticSeverity.Warning);
                        diag.source = 'markdown-embed';
                        diagnostics.push(diag);
                    }
                    else if (resolvedPath) {
                        try {
                            const content = yield fs.promises.readFile(resolvedPath, 'utf-8');
                            const lineCount = content.split(/\r?\n/).length;
                            if (parts[1] > lineCount) {
                                const diag = new vscode.Diagnostic(range, `Line range "${attrs['line']}" exceeds file length (${lineCount} lines)`, vscode.DiagnosticSeverity.Warning);
                                diag.source = 'markdown-embed';
                                diagnostics.push(diag);
                            }
                        }
                        catch ( /* ignore */_c) { /* ignore */ }
                    }
                }
            }
            this.collection.set(document.uri, diagnostics);
        });
    }
    clearDiagnostics(document) {
        this.collection.delete(document.uri);
    }
    dispose() {
        this.collection.dispose();
    }
}
exports.EmbedDiagnosticsProvider = EmbedDiagnosticsProvider;
//# sourceMappingURL=diagnostics.js.map