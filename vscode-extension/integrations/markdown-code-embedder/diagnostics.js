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
const EMBED_REGEX = /<!--\s*(?:embed|link):([^\s]+)(.*?)-->/g;
const ATTR_REGEX = /([a-zA-Z0-9-_]+)=["']([^"']+)["']/g;
const REGION_START_REGEX = (name) => new RegExp(`^\\s*(?:\\/\\/|--|#|<!--|\\/\\*)\\s*#region\\s+${name}\\s*(?:-->|\\*\\/)?$`);
class EmbedDiagnosticsProvider {
    constructor() {
        this.timers = new Map();
        this.requests = new Map();
        this.collection = vscode.languages.createDiagnosticCollection('markdown-embed');
    }
    get diagnosticCollection() {
        return this.collection;
    }
    updateDiagnostics(document) {
        if (document.languageId !== 'markdown') return;
        const key = document.uri.toString();
        clearTimeout(this.timers.get(key));
        const request = {};
        this.requests.set(key, request);
        this.timers.set(key, setTimeout(() => {
            this.timers.delete(key);
            this.computeDiagnostics(document, key, request).catch(console.error);
        }, 180));
    }
    computeDiagnostics(document, key, request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (document.languageId !== 'markdown') {
                return;
            }
            const version = document.version;
            const text = document.getText();
            const reads = new Map();
            const paths = new Map();
            const read = filename => {
                if (!reads.has(filename)) reads.set(filename, fs.promises.readFile(filename, 'utf-8'));
                return reads.get(filename);
            };
            const diagnostics = [];
            const fenceRanges = (0, utils_1.getCodeFenceRanges)(text);
            const regex = new RegExp(EMBED_REGEX.source, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (document.isClosed || document.version !== version || this.requests.get(key) !== request) return;
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
                    if (!paths.has(attrs.file)) paths.set(attrs.file, (0, utils_1.resolveFilePath)(document, attrs.file));
                    resolvedPath = yield paths.get(attrs.file);
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
                        const content = yield read(resolvedPath);
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
                            const content = yield read(resolvedPath);
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
            if (!document.isClosed && document.version === version && this.requests.get(key) === request)
                this.collection.set(document.uri, diagnostics);
        });
    }
    clearDiagnostics(document) {
        const key = document.uri.toString();
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
        this.requests.delete(key);
        this.collection.delete(document.uri);
    }
    dispose() {
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
        this.requests.clear();
        this.collection.dispose();
    }
}
exports.EmbedDiagnosticsProvider = EmbedDiagnosticsProvider;
//# sourceMappingURL=diagnostics.js.map