import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { extractFrontmatter } from "./frontmatter";
import { remarkGroupDirectives } from "./conversion-utils";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkGroupDirectives);

/**
 * 1-based source line of each top-level markdown block, in document order —
 * what the rich editor's line-number gutter shows next to its top-level
 * nodes. Link/footnote definitions render nothing, so they are skipped to
 * keep the list aligned with the editor's blocks.
 */
export function sourceBlockLines(md: string): number[] {
  const { content, frontmatter } = extractFrontmatter(md);
  const offset = frontmatter ? frontmatter.split("\n").length - 1 : 0;
  // Directives + their generated content are one editor block.
  const tree = parser.runSync(parser.parse(content)) as any;
  return (tree.children as any[])
    .filter((n) => n.type !== "definition" && n.type !== "footnoteDefinition" && n.position)
    .map((n) => n.position.start.line + offset);
}
