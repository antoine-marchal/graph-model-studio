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
exports.EmbedCompletionProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const REGION_START_REGEX = /^\s*(?:\/\/|--|#|<!--|\/\*)\s*#region\s+(\S+)\s*(?:-->|\*\/)?$/;
class EmbedCompletionProvider {
    provideCompletionItems(document, position) {
        return __awaiter(this, void 0, void 0, function* () {
            const lineText = document.lineAt(position).text;
            const textBeforeCursor = lineText.substring(0, position.character);
            // Only activate inside embed tags
            if (!/<!--\s*(?:embed|link):/.test(textBeforeCursor)) {
                return undefined;
            }
            // Check if completing a file path: file="<cursor>
            const fileAttrMatch = textBeforeCursor.match(/file=["']([^"']*)$/);
            if (fileAttrMatch) {
                // replaceRange covers the entire value already typed after the opening quote
                const valueStart = position.character - fileAttrMatch[1].length;
                const replaceRange = new vscode.Range(new vscode.Position(position.line, valueStart), position);
                return this.getFileCompletions(document, fileAttrMatch[1], replaceRange);
            }
            // Check if completing a region name: region="<cursor>
            const regionAttrMatch = textBeforeCursor.match(/region=["']([^"']*)$/);
            if (regionAttrMatch) {
                const valueStart = position.character - regionAttrMatch[1].length;
                const replaceRange = new vscode.Range(new vscode.Position(position.line, valueStart), position);
                const fileMatch = lineText.match(/file=["']([^"']+)["']/);
                if (fileMatch) {
                    return this.getRegionCompletions(document, fileMatch[1], replaceRange);
                }
                return undefined;
            }
            return undefined;
        });
    }
    getFileCompletions(document, partialPath, replaceRange) {
        return __awaiter(this, void 0, void 0, function* () {
            const markdownDir = path.dirname(document.uri.fsPath);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            // Determine which directory to list based on the partial path typed so far
            let searchDir;
            if (partialPath.includes('/')) {
                const lastSlash = partialPath.lastIndexOf('/');
                const dirPart = partialPath.substring(0, lastSlash);
                searchDir = path.resolve(markdownDir, dirPart);
            }
            else {
                searchDir = markdownDir;
            }
            const items = [];
            const seen = new Set();
            const addEntries = (dir) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const entries = yield fs.promises.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                            continue;
                        }
                        const fullPath = path.join(dir, entry.name);
                        let relPath = path.relative(markdownDir, fullPath).split(path.sep).join('/');
                        if (!relPath.startsWith('.')) {
                            relPath = './' + relPath;
                        }
                        if (seen.has(relPath)) {
                            continue;
                        }
                        seen.add(relPath);
                        if (entry.isDirectory()) {
                            const folderPath = relPath + '/';
                            const item = new vscode.CompletionItem(folderPath, vscode.CompletionItemKind.Folder);
                            item.insertText = folderPath;
                            // Replace the entire typed value so no duplication
                            item.range = replaceRange;
                            item.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger' };
                            items.push(item);
                        }
                        else {
                            const item = new vscode.CompletionItem(relPath, vscode.CompletionItemKind.File);
                            item.insertText = relPath;
                            item.range = replaceRange;
                            item.detail = entry.name;
                            items.push(item);
                        }
                    }
                }
                catch ( /* directory not readable */_a) { /* directory not readable */ }
            });
            yield addEntries(searchDir);
            // Also offer workspace root entries if different from searchDir
            if (workspaceFolder) {
                const wsRoot = workspaceFolder.uri.fsPath;
                if (path.resolve(searchDir) !== path.resolve(wsRoot)) {
                    yield addEntries(wsRoot);
                }
            }
            return items;
        });
    }
    getRegionCompletions(document, filePath, replaceRange) {
        return __awaiter(this, void 0, void 0, function* () {
            let resolvedPath;
            try {
                resolvedPath = path.resolve(path.dirname(document.uri.fsPath), filePath);
                yield fs.promises.access(resolvedPath);
            }
            catch (_a) {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                if (!workspaceFolder) {
                    return [];
                }
                resolvedPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
                try {
                    yield fs.promises.access(resolvedPath);
                }
                catch (_b) {
                    return [];
                }
            }
            try {
                const content = yield fs.promises.readFile(resolvedPath, 'utf-8');
                const lines = content.split(/\r?\n/);
                const regions = [];
                for (const line of lines) {
                    const m = REGION_START_REGEX.exec(line);
                    if (m) {
                        regions.push(m[1]);
                    }
                }
                return regions.map(name => {
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.EnumMember);
                    item.insertText = name;
                    item.range = replaceRange;
                    item.detail = `Region in ${path.basename(filePath)}`;
                    return item;
                });
            }
            catch (_c) {
                return [];
            }
        });
    }
}
exports.EmbedCompletionProvider = EmbedCompletionProvider;
//# sourceMappingURL=completion.js.map