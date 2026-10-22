import * as vscode from 'vscode';
import { deckFoldingRanges } from '@corporate-slides/parser';

/**
 * `.deck` source editor: YAML headers, `elements:` entries and `:::` blocks fold, and the YAML
 * headers are folded when a deck opens (setting `corporateSlides.foldFrontmatter`), so the slide
 * text reads first.
 */
export function registerDeckFolding(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [{ language: 'deck' }, { pattern: '**/*.slides.md' }];
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges: (doc) =>
        deckFoldingRanges(doc.getText()).map((r) => new vscode.FoldingRange(r.start, r.end, r.kind === 'frontmatter' ? vscode.FoldingRangeKind.Region : undefined)),
    }),
  );

  const folded = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const collapse = (editor = vscode.window.activeTextEditor) => {
    if (timer) clearTimeout(timer);
    const doc = editor?.document;
    if (!editor || !doc || !(doc.languageId === 'deck' || /\.slides\.md$/i.test(doc.fileName))) return;
    if (folded.has(doc.uri.toString()) || !vscode.workspace.getConfiguration('corporateSlides', doc.uri).get<boolean>('foldFrontmatter', true)) return;
    // The folding model is built asynchronously after the editor shows.
    timer = setTimeout(() => {
      timer = undefined;
      if (vscode.window.activeTextEditor !== editor) return;
      folded.add(doc.uri.toString());
      const selectionLines = deckFoldingRanges(doc.getText()).filter((r) => r.kind === 'frontmatter').map((r) => r.start);
      if (selectionLines.length) void vscode.commands.executeCommand('editor.fold', { selectionLines, direction: 'down', levels: 1 });
    }, 200);
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => collapse(e)),
    vscode.workspace.onDidCloseTextDocument((d) => folded.delete(d.uri.toString())),
  );
  collapse();
}
