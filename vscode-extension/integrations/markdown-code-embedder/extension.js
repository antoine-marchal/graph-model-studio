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
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const embedder_1 = require("./embedder");
const providers_1 = require("./providers");
const diagnostics_1 = require("./diagnostics");
const codelens_1 = require("./codelens");
const hover_1 = require("./hover");
const completion_1 = require("./completion");
const utils_1 = require("./utils");
const REGION_START_REGEX = /^\s*(?:\/\/|--|#|<!--|\/\*)\s*#region\s+(\S+)\s*(?:-->|\*\/)?$/;
const REGION_END_REGEX = /^\s*(?:\/\/|--|#|<!--|\/\*)\s*#endregion\s*(?:-->|\*\/)?/;
function activate(context) {
    console.log('Markdown Code Embedder is now active!');
    const embedder = new embedder_1.MarkdownEmbedder();
    const diagnosticsProvider = new diagnostics_1.EmbedDiagnosticsProvider();
    const codeLensProvider = new codelens_1.EmbedCodeLensProvider();
    const staleTimers = new Map();
    const staleRequests = new Map();
    // ── Stale tracking ─────────────────────────────────────────────────────
    function updateStaleMap(document) {
        return __awaiter(this, void 0, void 0, function* () {
            if (document.languageId !== 'markdown') {
                return;
            }
            const uri = document.uri.toString();
            const version = document.version;
            const request = (staleRequests.get(uri) || 0) + 1;
            staleRequests.set(uri, request);
            try {
                const indices = yield embedder.getStaleMatchIndices(document);
                // File reads are asynchronous. Never let an older result replace
                // the state calculated for a newer document version.
                if (document.isClosed || staleRequests.get(uri) !== request)
                    return;
                if (document.version !== version) {
                    scheduleStaleMap(document);
                    return;
                }
                if (codeLensProvider.updateStaleIndices(uri, indices)) codeLensProvider.refresh();
            }
            catch ( /* ignore */_a) { /* ignore */ }
        });
    }
    function scheduleStaleMap(document, delay = 180) {
        if (document.languageId !== 'markdown')
            return;
        const uri = document.uri.toString();
        const current = staleTimers.get(uri);
        if (current)
            clearTimeout(current);
        staleTimers.set(uri, setTimeout(() => {
            staleTimers.delete(uri);
            updateStaleMap(document);
        }, delay));
    }
    function refreshOpenMarkdownStaleState() {
        for (const document of vscode.workspace.textDocuments) {
            if (document.languageId === 'markdown')
                scheduleStaleMap(document, 0);
        }
    }
    // ── Helper: update all markdown files in workspace ─────────────────────
    function updateAllMarkdownFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            const mdFiles = yield vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
            let totalEdits = 0;
            for (const mdFileUri of mdFiles) {
                try {
                    const doc = yield vscode.workspace.openTextDocument(mdFileUri);
                    const edits = yield embedder.generateEdits(doc);
                    if (edits.length > 0) {
                        edits.sort((a, b) => b.range.start.compareTo(a.range.start));
                        const workspaceEdit = new vscode.WorkspaceEdit();
                        workspaceEdit.set(mdFileUri, edits);
                        const applied = yield vscode.workspace.applyEdit(workspaceEdit);
                        if (applied) {
                            yield doc.save();
                            totalEdits += edits.length;
                        }
                    }
                }
                catch (error) {
                    console.error(`Failed to update embeds in ${mdFileUri.fsPath}:`, error);
                }
            }
            return totalEdits;
        });
    }
    // ── Update all embeds in active document ───────────────────────────────
    const updateAllCommand = vscode.commands.registerCommand('markdown-embed.update', () => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        const document = editor.document;
        yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Updating Code Embeds...',
            cancellable: false
        }, () => __awaiter(this, void 0, void 0, function* () {
            const edits = yield embedder.generateEdits(document);
            if (edits.length > 0) {
                yield editor.edit(editBuilder => {
                    edits.sort((a, b) => b.range.start.compareTo(a.range.start));
                    for (const edit of edits) {
                        editBuilder.replace(edit.range, edit.newText);
                    }
                });
                vscode.window.showInformationMessage(`Updated ${edits.length} embeds.`);
            }
            else {
                vscode.window.showInformationMessage('No embeds found to update.');
            }
            scheduleStaleMap(document, 0);
        }));
    }));
    // ── Update all embeds across workspace ─────────────────────────────────
    const updateWorkspaceCommand = vscode.commands.registerCommand('markdown-embed.updateWorkspace', () => __awaiter(this, void 0, void 0, function* () {
        yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Updating Code Embeds in Workspace...',
            cancellable: false
        }, () => __awaiter(this, void 0, void 0, function* () {
            const totalEdits = yield updateAllMarkdownFiles();
            if (totalEdits > 0) {
                vscode.window.showInformationMessage(`Workspace update complete: ${totalEdits} embed(s) refreshed.`);
            }
            else {
                vscode.window.showInformationMessage('No stale embeds found in workspace.');
            }
        }));
        refreshOpenMarkdownStaleState();
    }));
    // ── Insert embed tag (copy to clipboard, for non-markdown source files) ─
    const insertEmbedTagCommand = vscode.commands.registerCommand('markdown-embed.insertEmbedTag', () => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        if (editor.document.languageId === 'markdown') {
            vscode.window.showErrorMessage('Run this command from a source file (not a Markdown file).');
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        // Compute file path relative to workspace root (or absolute fallback)
        let filePath;
        if (workspaceFolder) {
            filePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath).split(path.sep).join('/');
        }
        else {
            filePath = document.uri.fsPath;
        }
        const lines = document.getText().split(/\r?\n/);
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        // Detect region: check if the selection is inside or spans a #region block
        let regionName;
        // Check if any line in the selection starts a #region
        for (let i = startLine; i <= endLine; i++) {
            const m = REGION_START_REGEX.exec(lines[i]);
            if (m) {
                regionName = m[1];
                break;
            }
        }
        // If not found in selection, search backwards from startLine
        if (!regionName) {
            for (let i = startLine; i >= 0; i--) {
                if (REGION_END_REGEX.test(lines[i])) {
                    break;
                }
                const m = REGION_START_REGEX.exec(lines[i]);
                if (m) {
                    regionName = m[1];
                    break;
                }
            }
        }
        let tag;
        if (regionName) {
            tag = `<!-- embed:file="${filePath}" region="${regionName}" -->`;
        }
        else if (!selection.isEmpty) {
            const lineStart = startLine + 1;
            const lineEnd = endLine + 1;
            tag = `<!-- embed:file="${filePath}" line="${lineStart}-${lineEnd}" -->`;
        }
        else {
            tag = `<!-- embed:file="${filePath}" -->`;
        }
        yield vscode.env.clipboard.writeText(tag);
        vscode.window.showInformationMessage(`Embed tag copied to clipboard!`, 'Show').then(action => {
            if (action === 'Show') {
                vscode.window.showInformationMessage(tag);
            }
        });
    }));
    // ── Update single embed (from CodeLens) ────────────────────────────────
    const updateSingleCommand = vscode.commands.registerCommand('markdown-embed.updateSingle', (uri, matchIndex) => __awaiter(this, void 0, void 0, function* () {
        const document = yield vscode.workspace.openTextDocument(uri);
        const editor = yield vscode.window.showTextDocument(document);
        const edits = yield embedder.generateEditsForIndex(document, matchIndex);
        if (edits.length > 0) {
            yield editor.edit(editBuilder => {
                edits.sort((a, b) => b.range.start.compareTo(a.range.start));
                for (const edit of edits) {
                    editBuilder.replace(edit.range, edit.newText);
                }
            });
        }
        scheduleStaleMap(document, 0);
    }));
    // ── Go to source file (from CodeLens) ─────────────────────────────────
    const goToSourceCommand = vscode.commands.registerCommand('markdown-embed.goToSource', (uri, matchIndex) => __awaiter(this, void 0, void 0, function* () {
        const document = yield vscode.workspace.openTextDocument(uri);
        const text = document.getText();
        const embedRegex = /<!--\s*(?:embed|link):([^\s]+)(.*?)-->/g;
        let match;
        const regex = new RegExp(embedRegex.source, 'g');
        while ((match = regex.exec(text)) !== null) {
            if (match.index === matchIndex) {
                const attrString = match[1] + match[2];
                const attrRegex = /([a-zA-Z0-9-_]+)=["']([^"']+)["']/g;
                let attrMatch;
                const attrs = {};
                while ((attrMatch = attrRegex.exec(attrString)) !== null) {
                    attrs[attrMatch[1]] = attrMatch[2];
                }
                if (attrs['file']) {
                    try {
                        const resolved = yield (0, utils_1.resolveFilePath)(document, attrs['file']);
                        const fileUri = vscode.Uri.file(resolved);
                        yield vscode.window.showTextDocument(fileUri);
                    }
                    catch (e) {
                        vscode.window.showErrorMessage(`Cannot open file: ${e.message}`);
                    }
                }
                break;
            }
        }
    }));
    // ── Lock embed (from CodeLens) ─────────────────────────────────────────
    const lockCommand = vscode.commands.registerCommand('markdown-embed.lock', (uri, matchIndex, fullMatch) => __awaiter(this, void 0, void 0, function* () {
        const document = yield vscode.workspace.openTextDocument(uri);
        const editor = yield vscode.window.showTextDocument(document);
        const start = document.positionAt(matchIndex);
        const end = document.positionAt(matchIndex + fullMatch.length);
        const range = new vscode.Range(start, end);
        const newMatch = fullMatch.replace(/\s*-->$/, ' lock="true" -->');
        yield editor.edit(eb => eb.replace(range, newMatch));
        scheduleStaleMap(document, 0);
    }));
    // ── Unlock embed (from CodeLens) ───────────────────────────────────────
    const unlockCommand = vscode.commands.registerCommand('markdown-embed.unlock', (uri, matchIndex, fullMatch) => __awaiter(this, void 0, void 0, function* () {
        const document = yield vscode.workspace.openTextDocument(uri);
        const editor = yield vscode.window.showTextDocument(document);
        const start = document.positionAt(matchIndex);
        const end = document.positionAt(matchIndex + fullMatch.length);
        const range = new vscode.Range(start, end);
        const newMatch = fullMatch.replace(/\s*lock=["']true["']/, '');
        yield editor.edit(eb => eb.replace(range, newMatch));
        scheduleStaleMap(document, 0);
    }));
    // ── Auto-update on markdown save ───────────────────────────────────────
    const onWillSave = vscode.workspace.onWillSaveTextDocument(event => {
        if (event.document.languageId === 'markdown') {
            console.log('Detected save on markdown file. Updating embeds...');
            event.waitUntil((() => __awaiter(this, void 0, void 0, function* () {
                const cleanupEdits = embedder.cleanLegacyErrorComments(event.document);
                const embedEdits = yield embedder.generateEdits(event.document);
                const allEdits = [...cleanupEdits, ...embedEdits];
                allEdits.sort((a, b) => b.range.start.compareTo(a.range.start));
                return allEdits;
            }))());
        }
    });
    // ── Auto-update markdown files when referenced source file is saved ────
    const onDidSaveSource = vscode.workspace.onDidSaveTextDocument((savedDoc) => __awaiter(this, void 0, void 0, function* () {
        if (savedDoc.languageId === 'markdown') {
            return;
        }
        const config = vscode.workspace.getConfiguration('markdownEmbedder');
        if (config.get('autoUpdate'))
            yield updateAllMarkdownFiles();
        // Staleness is a status feature, independent of auto-update. Recompute
        // open Markdown documents whenever a source file is saved.
        refreshOpenMarkdownStaleState();
    }));
    // ── Diagnostics: update on open, change, save ─────────────────────────
    const onDidOpen = vscode.workspace.onDidOpenTextDocument((doc) => __awaiter(this, void 0, void 0, function* () {
        diagnosticsProvider.updateDiagnostics(doc);
        if (doc.languageId === 'markdown') {
            const cleanupEdits = embedder.cleanLegacyErrorComments(doc);
            if (cleanupEdits.length > 0) {
                const we = new vscode.WorkspaceEdit();
                we.set(doc.uri, cleanupEdits);
                yield vscode.workspace.applyEdit(we);
            }
            updateStaleMap(doc);
        }
    }));
    const onDidChange = vscode.workspace.onDidChangeTextDocument(e => {
        diagnosticsProvider.updateDiagnostics(e.document);
        scheduleStaleMap(e.document);
    });
    const onDidSaveDiag = vscode.workspace.onDidSaveTextDocument(doc => {
        diagnosticsProvider.updateDiagnostics(doc);
        if (doc.languageId === 'markdown') {
            updateStaleMap(doc);
        }
    });
    const onDidClose = vscode.workspace.onDidCloseTextDocument(doc => {
        diagnosticsProvider.clearDiagnostics(doc);
        const uri = doc.uri.toString();
        const timer = staleTimers.get(uri);
        if (timer)
            clearTimeout(timer);
        staleTimers.delete(uri);
        staleRequests.delete(uri);
        codeLensProvider.clearStaleIndices(uri);
    });
    // Run diagnostics + cleanup + stale check on already-open documents
    vscode.workspace.textDocuments.forEach((doc) => __awaiter(this, void 0, void 0, function* () {
        diagnosticsProvider.updateDiagnostics(doc);
        if (doc.languageId === 'markdown') {
            const cleanupEdits = embedder.cleanLegacyErrorComments(doc);
            if (cleanupEdits.length > 0) {
                const we = new vscode.WorkspaceEdit();
                we.set(doc.uri, cleanupEdits);
                yield vscode.workspace.applyEdit(we);
            }
            updateStaleMap(doc);
        }
    }));
    // ── Register providers ─────────────────────────────────────────────────
    const definitionProvider = vscode.languages.registerDefinitionProvider('markdown', new providers_1.EmbedDefinitionProvider());
    const codeLensDisposable = vscode.languages.registerCodeLensProvider('markdown', codeLensProvider);
    const hoverDisposable = vscode.languages.registerHoverProvider('markdown', new hover_1.EmbedHoverProvider());
    const completionDisposable = vscode.languages.registerCompletionItemProvider('markdown', new completion_1.EmbedCompletionProvider(), '"', "'", '/');
    const staleTrackerDisposable = {
        dispose() {
            for (const timer of staleTimers.values())
                clearTimeout(timer);
            staleTimers.clear();
            staleRequests.clear();
        }
    };
    context.subscriptions.push(updateAllCommand, updateWorkspaceCommand, insertEmbedTagCommand, updateSingleCommand, goToSourceCommand, lockCommand, unlockCommand, onWillSave, onDidSaveSource, onDidOpen, onDidChange, onDidSaveDiag, onDidClose, definitionProvider, codeLensDisposable, hoverDisposable, completionDisposable, diagnosticsProvider, staleTrackerDisposable);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
