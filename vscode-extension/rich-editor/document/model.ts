/**
 * Source → document semantics, without a DOM: what the DOCX compiler, the preflight and the
 * outline consume. The Tiptap document is only an editing projection of the same source.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { remarkGroupDirectives } from "../webview/conversion-utils";
import { findFrontmatter, readMeta } from "./meta";
import { isValidId, type ObjectDescriptor, type SectionProps, type StudioMeta } from "./schema";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkGroupDirectives);

export interface Diagnostic {
  level: "info" | "warning" | "error";
  message: string;
  /** 1-based source line. */
  line?: number;
  objectId?: string;
  blockId?: string;
}

export interface StudioObjectRef {
  id: string;
  descriptor?: ObjectDescriptor;
  /** mdast body (image, text box paragraphs); empty for drawings without content. */
  body: any[];
  /** Index (in `blocks`) of the block the object anchors to: the first block after it. */
  anchor: number;
  line: number;
}

export interface StudioDocument {
  source: string;
  meta: StudioMeta | null;
  metaReadOnly: boolean;
  /** Offset of the Markdown body (after the frontmatter). */
  bodyOffset: number;
  /** Top-level mdast blocks (studio nodes included), positions relative to `source`. */
  blocks: any[];
  sections: { props: SectionProps; startBlock: number; line: number }[];
  objects: StudioObjectRef[];
  title?: string;
  diagnostics: Diagnostic[];
}

/** Shift mdast positions by `offset` / `lines` (frontmatter stripped before parsing). */
function shift(node: any, offset: number, lines: number): void {
  if (node.position) {
    for (const p of [node.position.start, node.position.end]) {
      if (typeof p.offset === "number") p.offset += offset;
      p.line += lines;
    }
  }
  for (const c of node.children ?? []) shift(c, offset, lines);
}

export function parseStudioDocument(source: string): StudioDocument {
  const fm = findFrontmatter(source);
  const bodyOffset = fm ? source.indexOf("\n", fm.bodyEnd + 1) + 1 || source.length : 0;
  const body = source.slice(bodyOffset);
  const tree = parser.runSync(parser.parse(body)) as any;
  shift(tree, bodyOffset, source.slice(0, bodyOffset).split("\n").length - 1);
  const { meta, diagnostics: metaDiag, readOnly } = readMeta(source);
  const diagnostics: Diagnostic[] = metaDiag.map((message) => ({ level: "warning", message, line: 1 }));
  const blocks: any[] = tree.children;
  const sections: StudioDocument["sections"] = [];
  const objects: StudioObjectRef[] = [];
  const blockIds = new Map<string, number>();
  const walk = (list: any[]) => {
    list.forEach((node, i) => {
      const line = node.position?.start.line ?? 0;
      if (node.data?.msError) diagnostics.push({ level: "warning", message: node.data.msError, line });
      const id = node.data?.msBlock?.id;
      if (id) {
        if (blockIds.has(id)) diagnostics.push({ level: "error", message: `Duplicate block id "${id}" (also line ${blockIds.get(id)})`, line, blockId: id });
        else blockIds.set(id, line);
      }
      if (node.type === "studioObject" && list === blocks) {
        let anchor = i + 1;
        while (anchor < list.length && (list[anchor].type === "studioObject" || list[anchor].type === "studioBreak")) anchor++;
        objects.push({ id: node.id, descriptor: meta?.objects?.[node.id], body: node.children, anchor, line });
      } else if (node.type === "studioObject") {
        diagnostics.push({ level: "warning", message: `Object "${node.id}" is nested in another block; it is shown in flow`, line, objectId: node.id });
      }
      if (node.type === "studioBreak" && node.kind === "section") sections.push({ props: node.props ?? {}, startBlock: i + 1, line });
      if (node.type !== "studioObject" && Array.isArray(node.children) && node.type !== "paragraph" && node.type !== "heading") walk(node.children);
    });
  };
  walk(blocks);

  const seen = new Set<string>();
  for (const o of objects) {
    if (seen.has(o.id)) diagnostics.push({ level: "error", message: `Duplicate object id "${o.id}"`, line: o.line, objectId: o.id });
    seen.add(o.id);
    if (!o.descriptor) diagnostics.push({ level: "warning", message: `Object "${o.id}" has no descriptor in ${"markdownStudio.objects"}; it is shown in flow`, line: o.line, objectId: o.id });
  }
  for (const [id, d] of Object.entries(meta?.objects ?? {})) {
    if (!isValidId(id)) diagnostics.push({ level: "error", message: `Invalid object id "${id}"`, objectId: id });
    if (!seen.has(id)) {
      // A drawing without a marker anchors to the document start (no content to lose).
      objects.push({ id, descriptor: d, body: [], anchor: 0, line: 1 });
      if (d.placement === "anchored") diagnostics.push({ level: "info", message: `Object "${id}" has no marker in the body; anchored to the first paragraph`, objectId: id });
    }
    if (d.type === "connector") {
      for (const end of [d.from, d.to]) {
        if (!end?.id) diagnostics.push({ level: "error", message: `Connector "${id}" has a missing end`, objectId: id });
        else if (!meta?.objects?.[end.id]) diagnostics.push({ level: "error", message: `Connector "${id}" is attached to missing object "${end.id}"`, objectId: id });
      }
    }
  }
  const heading = blocks.find((b) => b.type === "heading" && b.depth === 1);
  const fmTitle = fm ? /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm.body)?.[1] : undefined;
  return { source, meta, metaReadOnly: readOnly, bodyOffset, blocks, sections, objects, title: fmTitle ?? (heading ? plainText(heading) : undefined), diagnostics };
}

export function plainText(node: any): string {
  if (typeof node.value === "string" && node.type !== "html") return node.value;
  return (node.children ?? []).map(plainText).join("");
}
