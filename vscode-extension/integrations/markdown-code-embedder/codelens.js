"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbedCodeLensProvider = void 0;
const vscode = require("vscode");
const utils_1 = require("./utils");
const EMBED_REGEX = /<!--\s*(?:embed|link):([^\s]+)(.*?)-->/g;
const ATTR_REGEX = /([a-zA-Z0-9-_]+)=["']([^"']+)["']/g;
class EmbedCodeLensProvider {
    constructor() {
        this._onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
        /** matchIndex sets populated by extension stale tracker */
        this.staleIndices = new Map();
    }
    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
    updateStaleIndices(docUri, indices) {
        const previous = this.staleIndices.get(docUri);
        if (previous && previous.size === indices.size && [...indices].every(index => previous.has(index))) return false;
        this.staleIndices.set(docUri, indices);
        return true;
    }
    clearStaleIndices(docUri) {
        this.staleIndices.delete(docUri);
    }
    provideCodeLenses(document) {
        var _a;
        if (document.languageId !== 'markdown') {
            return [];
        }
        const lenses = [];
        const text = document.getText();
        const fenceRanges = (0, utils_1.getCodeFenceRanges)(text);
        const regex = new RegExp(EMBED_REGEX.source, 'g');
        const stale = (_a = this.staleIndices.get(document.uri.toString())) !== null && _a !== void 0 ? _a : new Set();
        let match;
        while ((match = regex.exec(text)) !== null) {
            const fullMatch = match[0];
            const primaryKey = match[1];
            const remainingAttributes = match[2];
            const attributeString = primaryKey + remainingAttributes;
            const isToc = primaryKey.toLowerCase() === 'toc';
            const attrs = {};
            const attrRegex = new RegExp(ATTR_REGEX.source, 'g');
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attributeString)) !== null) {
                attrs[attrMatch[1]] = attrMatch[2];
            }
            if (!attrs['file'] && !isToc) {
                continue;
            }
            if ((0, utils_1.isInCodeFence)(match.index, fenceRanges)) {
                continue;
            }
            const matchStart = document.positionAt(match.index);
            const range = new vscode.Range(matchStart, matchStart);
            const isLocked = attrs['lock'] === 'true';
            const isStale = !isLocked && stale.has(match.index);
            // Use one actionable status lens. A separate stale + update pair was
            // noisy and could briefly disagree while asynchronous checks ran.
            if (!isLocked) {
                lenses.push(new vscode.CodeLens(range, {
                    title: isStale ? '$(warning) Stale — Update' : '$(refresh) Update',
                    command: 'markdown-embed.updateSingle',
                    arguments: [document.uri, match.index],
                    tooltip: isStale ? 'Embedded content differs from its source — click to update' : 'Update this embed'
                }));
            }
            else {
                lenses.push(new vscode.CodeLens(range, {
                    title: '🔒 Locked',
                    command: '',
                    tooltip: 'This embed is locked and will not be auto-updated'
                }));
            }
            // Go to source lens (TOCs are generated from this document).
            if (!isToc) {
                lenses.push(new vscode.CodeLens(range, {
                    title: `→ ${attrs['file']}${attrs['region'] ? `#${attrs['region']}` : ''}`,
                    command: 'markdown-embed.goToSource',
                    arguments: [document.uri, match.index],
                    tooltip: `Open ${attrs['file']}`
                }));
            }
            // Lock/Unlock lens
            lenses.push(new vscode.CodeLens(range, {
                title: isLocked ? '🔓 Unlock' : '🔒 Lock',
                command: isLocked ? 'markdown-embed.unlock' : 'markdown-embed.lock',
                arguments: [document.uri, match.index, fullMatch],
                tooltip: isLocked ? 'Allow auto-updates for this embed' : 'Prevent auto-updates for this embed'
            }));
        }
        return lenses;
    }
}
exports.EmbedCodeLensProvider = EmbedCodeLensProvider;
//# sourceMappingURL=codelens.js.map
