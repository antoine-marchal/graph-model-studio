/** Shared rendered-review payload. Line numbers are 1-based Markdown source lines. */
export interface ReviewThread {
  id: string;
  line: number;
  resolved: boolean;
  resolvable: boolean;
  notes: { id: number; author: string; body: string; created: string }[];
}

export interface ReviewData {
  mr: string;
  side: "old" | "new";
  canComment: boolean;
  canCreate: boolean;
  notice?: string;
  focus?: { noteId: number; line: number };
  threads: ReviewThread[];
}

export interface ReviewSelection {
  line: number;
  discussionId?: string;
  noteId?: number;
}

/** Nearest containing top-level source block; frontmatter has no rendered block. */
export function reviewBlockIndex(lines: number[], line: number): number {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i] <= line; i++) index = i;
  return index;
}

/** Top-level document nodes, minus the trailing empty caret paragraphs Tiptap adds. */
export function sourceBlockCount(
  doc: { childCount: number; child(i: number): { type: { name: string }; content: { size: number } } },
  expected: number,
): number {
  let n = doc.childCount;
  while (n > expected && doc.child(n - 1).type.name === "paragraph" && doc.child(n - 1).content.size === 0) n--;
  return n;
}

/** Tiptap adds an empty caret paragraph after tables and other terminal blocks. Inline review threads are not blocks. */
export function renderedSourceBlocks(root: HTMLElement, expected: number): HTMLElement[] {
  const blocks = (Array.from(root.children) as HTMLElement[]).filter((el) => !el.classList?.contains("rv-slot"));
  while (blocks.length > expected) {
    const last = blocks[blocks.length - 1];
    if (
      last.tagName !== "P" ||
      last.textContent !== "" ||
      Array.from(last.children).some((child) => child.tagName !== "BR")
    )
      break;
    blocks.pop();
  }
  return blocks;
}
