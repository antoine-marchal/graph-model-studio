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
exports.resolveFilePath = exports.isInCodeFence = exports.getCodeFenceRanges = exports.getCommentPrefix = exports.getLanguageId = exports.fetchUrl = exports.isUrl = void 0;
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const vscode = require("vscode");
function isUrl(str) {
    return str.startsWith('http://') || str.startsWith('https://');
}
exports.isUrl = isUrl;
function fetchUrl(url, redirectCount = 0) {
    if (redirectCount > 5) {
        return Promise.reject(new Error(`Too many redirects fetching ${url}`));
    }
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https://') ? https : http;
        const req = client.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                resolve(fetchUrl(res.headers.location, redirectCount + 1));
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
                res.resume();
                return;
            }
            res.setEncoding('utf8');
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        });
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${url}`));
        });
        req.on('error', reject);
    });
}
exports.fetchUrl = fetchUrl;
function getLanguageId(filePath) {
    let cleanPath = filePath;
    if (isUrl(filePath)) {
        cleanPath = filePath.split('?')[0].split('#')[0];
    }
    const ext = path.extname(cleanPath).toLowerCase();
    const map = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.c': 'c',
        '.cpp': 'cpp',
        '.h': 'c',
        '.css': 'css',
        '.html': 'html',
        '.json': 'json',
        '.md': 'markdown',
        '.markdown': 'markdown',
        '.gmc': 'gmc',
        '.graphmodel': 'gmc',
        '.sh': 'bash',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.xml': 'xml',
        '.go': 'go',
        '.rs': 'rust',
        '.php': 'php',
        '.rb': 'ruby',
        '.lua': 'lua'
    };
    return map[ext] || '';
}
exports.getLanguageId = getLanguageId;
function getCommentPrefix(languageId) {
    const formats = {
        'javascript': ['//', ''],
        'typescript': ['//', ''],
        'c': ['//', ''],
        'cpp': ['//', ''],
        'csharp': ['//', ''],
        'java': ['//', ''],
        'go': ['//', ''],
        'rust': ['//', ''],
        'php': ['//', ''],
        'python': ['#', ''],
        'ruby': ['#', ''],
        'perl': ['#', ''],
        'yaml': ['#', ''],
        'shellscript': ['#', ''],
        'bash': ['#', ''],
        'html': ['<!--', ' -->'],
        'xml': ['<!--', ' -->'],
        'css': ['/*', ' */'],
        'sql': ['--', ''],
        'lua': ['--', '']
    };
    return formats[languageId] || ['//', ''];
}
exports.getCommentPrefix = getCommentPrefix;
/**
 * Returns character-offset ranges [start, end) for every fenced code block in text.
 * Used to skip embed tags that appear inside ``` or ~~~ fences.
 */
function getCodeFenceRanges(text) {
    const ranges = [];
    // Match opening fence (3+ backticks or tildes) followed by any info string,
    // then content, then a closing fence with the same or more characters.
    const fenceRegex = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm;
    let m;
    while ((m = fenceRegex.exec(text)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
}
exports.getCodeFenceRanges = getCodeFenceRanges;
function isInCodeFence(index, ranges) {
    return ranges.some(([start, end]) => index >= start && index < end);
}
exports.isInCodeFence = isInCodeFence;
function resolveFilePath(document, relPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let targetPath = path.resolve(path.dirname(document.uri.fsPath), relPath);
        try {
            yield fs.promises.access(targetPath);
            return targetPath;
        }
        catch (_a) {
            // Try relative to workspace root
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                targetPath = path.resolve(workspaceFolder.uri.fsPath, relPath);
                try {
                    yield fs.promises.access(targetPath);
                    return targetPath;
                }
                catch (_b) {
                    throw new Error(`File not found: ${relPath}`);
                }
            }
            else {
                throw new Error(`File not found: ${relPath}`);
            }
        }
    });
}
exports.resolveFilePath = resolveFilePath;
//# sourceMappingURL=utils.js.map
