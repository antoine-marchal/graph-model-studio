/**
 * Paper behind the single editor view: page rectangles from the pagination pass, header / footer
 * stories with fields filled in, recurring master drawings, margin guides and overflow marks.
 * Double-click a header or footer to edit it (document stories; masters are edited in the
 * master designer). Nothing here is editable text of the body.
 */
import React, { useMemo, useState } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { fillFields, storyFor } from "../../document/masters";
import { resolveColor } from "../../document/styles";
import type { ObjectDescriptor, StoryDef, StorySet } from "../../document/schema";
import { ptToPx } from "../../document/units";
import { shapeSvg } from "./ObjectView";
import { studio, useStudio, type PageBox } from "./store";
import { updateMeta } from "./actions";

const md = unified().use(remarkParse).use(remarkRehype).use(rehypeStringify);
const storyHtml = (markdown: string) => String(md.processSync(markdown));

function Furniture({ id, d, page, assetBase, theme }: { id: string; d: ObjectDescriptor; page: PageBox; assetBase?: string; theme: any }) {
  const relPage = d.relativeTo === "page";
  const left = (relPage ? 0 : page.margins.left) + ptToPx(d.box.x);
  const top = (relPage ? 0 : page.margins.top) + ptToPx(d.box.y);
  const w = ptToPx(d.box.width);
  const h = ptToPx(d.box.height);
  const style: React.CSSProperties = { left, top, width: Math.max(1, w), height: Math.max(1, h), zIndex: d.plane === "behind" ? 0 : 1 };
  if (d.type === "image" && d.src) return <img className="ms-furniture" data-id={id} style={style} src={assetBase ? `${assetBase}/${d.src}` : d.src} alt={d.alt ?? ""} />;
  return (
    <div
      className="ms-furniture"
      data-id={id}
      style={style}
      ref={(el) => {
        if (el) el.replaceChildren(shapeSvg(d, w, h, theme));
      }}
    />
  );
}

export function PageLayer() {
  const layout = useStudio((s) => s.layout);
  const sections = useStudio((s) => s.sections);
  const meta = useStudio((s) => s.meta);
  const title = useStudio((s) => s.title);
  const assetBases = useStudio((s) => s.assetBases);
  const showGuides = useStudio((s) => s.showGuides);
  const [editing, setEditing] = useState<{ page: number; kind: "headers" | "footers"; variant: keyof StorySet } | null>(null);
  const total = layout?.pages.length ?? 0;
  const fields = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of sections[0]?.chain ?? []) for (const [k, f] of Object.entries(m.fields ?? {})) if (f.default) out[k] = f.default;
    return { ...out, ...meta?.fields };
  }, [sections, meta]);
  if (!layout) return null;

  return (
    <div className="ms-page-layer" aria-hidden="true" style={{ width: layout.width, height: layout.height }}>
      {layout.pages.map((p) => {
        const sec = sections[p.section];
        const evenAndOdd = !!sec?.chain.some((m) => m.evenAndOdd);
        const opts = { firstOfSection: p.firstOfSection, titlePage: !!sec?.titlePage, pageNumber: p.number, evenAndOdd };
        const variant: keyof StorySet = opts.firstOfSection && opts.titlePage ? "first" : evenAndOdd && p.number % 2 === 0 ? "even" : "default";
        const header = sec ? storyFor(sec.headers, opts) : undefined;
        const footer = sec ? storyFor(sec.footers, opts) : undefined;
        const owner = sec?.chain[sec.chain.length - 1]?.id;
        const story = (s: StoryDef | undefined, kind: "headers" | "footers") => {
          const isEditing = editing?.page === p.index && editing.kind === kind;
          const style: React.CSSProperties = kind === "headers" ? { top: p.margins.header, left: p.margins.left, right: p.margins.right } : { bottom: p.margins.footer, left: p.margins.left, right: p.margins.right };
          return (
            <div
              className={`ms-story ms-story-${kind}${isEditing ? " is-editing" : ""}`}
              style={style}
              onDoubleClick={() => setEditing({ page: p.index, kind, variant })}
              title={`Double-click to edit the ${kind === "headers" ? "header" : "footer"}${sec?.storyOrigin === "linked" ? " (linked to the previous section)" : sec?.storyOrigin === "master" ? " (from the master)" : ""}`}
            >
              {isEditing ? (
                <StoryEditor
                  initial={s?.markdown ?? ""}
                  origin={sec?.storyOrigin ?? "none"}
                  onDone={(value) => {
                    setEditing(null);
                    if (value === null || value === (s?.markdown ?? "")) return;
                    updateMeta((m) => ({ ...m, [kind]: { ...m[kind], [variant]: { ...(m[kind]?.[variant] ?? {}), markdown: value } } }));
                  }}
                />
              ) : s?.markdown ? (
                <div className="ms-story-text" dangerouslySetInnerHTML={{ __html: storyHtml(fillFields(s.markdown, { page: p.number, pages: total, title, fields })) }} />
              ) : (
                <div className="ms-story-empty">{kind === "headers" ? "Header" : "Footer"}</div>
              )}
            </div>
          );
        };
        return (
          <div key={p.index} className="ms-page" style={{ top: p.top, left: p.left, width: p.width, height: p.height }} data-page={p.index + 1}>
            {[...Object.entries(sec?.background ?? {}), ...Object.entries(header?.objects ?? {}), ...Object.entries(footer?.objects ?? {})].map(([id, d]) => (
              <Furniture key={id} id={id} d={d} page={p} assetBase={owner ? assetBases[owner] : undefined} theme={sec.sheet.theme} />
            ))}
            {showGuides && <div className="ms-margin-guide" style={{ top: p.margins.top, left: p.margins.left, right: p.margins.right, bottom: p.margins.bottom }} />}
            {story(header, "headers")}
            {story(footer, "footers")}
            {layout.overflows.some((o) => o.page === p.index) && <div className="ms-overflow-mark" title="Content taller than the page: scale it, split it or change the page size">Overflow</div>}
          </div>
        );
      })}
    </div>
  );
}

function StoryEditor({ initial, origin, onDone }: { initial: string; origin: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="ms-story-editor" onMouseDown={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        aria-label="Header or footer text (Markdown; fields {{page}}, {{pages}}, {{title}}, {{field:name}})"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone(null);
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onDone(value);
        }}
        onBlur={() => onDone(value)}
      />
      <div className="ms-story-hint">
        {origin === "master" ? "Saving makes a document header that replaces the master's" : origin === "linked" ? "Linked to the previous section" : "Document header"} · Ctrl+Enter save · Esc cancel · {"{{page}} {{pages}} {{title}}"}
      </div>
    </div>
  );
}

/** Named styles of the document (master → local overrides) as CSS for the paper view. */
export function StyleSheetCss() {
  const sheet = useStudio((s) => s.sections[0]?.sheet);
  const css = useMemo(() => {
    if (!sheet) return "";
    const theme = sheet.theme;
    const rules: string[] = [];
    const decl = (id: string) => {
      const s = sheet.styles.get(id);
      if (!s) return "";
      const r = s.run;
      const p = s.paragraph;
      const font = r.font === "theme.heading" ? theme.fonts.heading : r.font === "theme.body" ? theme.fonts.body : r.font;
      return [
        font && `font-family:"${font}",system-ui,sans-serif`,
        r.size && `font-size:${r.size}pt`,
        resolveColor(r.color, theme) && `color:#${resolveColor(r.color, theme)}`,
        r.bold !== undefined && `font-weight:${r.bold ? 700 : 400}`,
        r.italic !== undefined && `font-style:${r.italic ? "italic" : "normal"}`,
        r.underline && "text-decoration:underline",
        r.caps && "text-transform:uppercase",
        r.smallCaps && "font-variant:small-caps",
        p.align && `text-align:${p.align}`,
        p.spaceBefore !== undefined && `margin-top:${p.spaceBefore}pt`,
        p.spaceAfter !== undefined && `margin-bottom:${p.spaceAfter}pt`,
        p.lineSpacing && `line-height:${p.lineSpacing}`,
        p.indentLeft && `padding-left:${p.indentLeft}pt`,
        p.indentRight && `padding-right:${p.indentRight}pt`,
        p.firstLine && `text-indent:${p.firstLine}pt`,
      ]
        .filter(Boolean)
        .join(";");
    };
    const root = ".ms-paged .ProseMirror";
    rules.push(`${root}{${decl("Normal")}}`);
    rules.push(`${root} p{${decl("Normal")}}`);
    for (let n = 1; n <= 6; n++) rules.push(`${root} h${n}{${decl(`Heading${n}`)}}`);
    rules.push(`${root} blockquote{${decl("Quote")}}`);
    rules.push(`${root} pre{${decl("Code")}}`);
    for (const s of sheet.styles.values()) {
      if (s.type === "paragraph") rules.push(`${root} .ms-s-${CSS.escape(s.id)}{${decl(s.id)}}`);
      if (s.type === "character") rules.push(`${root} .ms-cs-${CSS.escape(s.id)}{${decl(s.id)}}`);
    }
    return rules.join("\n");
  }, [sheet]);
  return <style>{css}</style>;
}

/** Horizontal ruler of the current page: margins, column and the selection's indents. */
export function Ruler({ indentLeft = 0, firstLine = 0, indentRight = 0 }: { indentLeft?: number; firstLine?: number; indentRight?: number }) {
  const layout = useStudio((s) => s.layout);
  const current = useStudio((s) => s.currentPage);
  const zoom = useStudio((s) => s.zoom);
  const page = layout?.pages[Math.max(0, current - 1)];
  if (!page) return null;
  const cm = 96 / 2.54;
  const ticks = Array.from({ length: Math.floor(page.width / (cm / 2)) + 1 }, (_, i) => i);
  return (
    <div className="ms-ruler" role="presentation" style={{ width: page.width * zoom, marginLeft: `calc(50% - ${(layout!.width * zoom) / 2 - page.left * zoom}px)` }}>
      <div className="ms-ruler-margin" style={{ left: 0, width: page.margins.left * zoom }} />
      <div className="ms-ruler-margin" style={{ right: 0, width: page.margins.right * zoom }} />
      {ticks.map((i) => (
        <span key={i} className={i % 2 ? "ms-tick" : "ms-tick major"} style={{ left: ((i * cm) / 2) * zoom }}>
          {i % 2 === 0 && i > 0 ? i / 2 : ""}
        </span>
      ))}
      <span className="ms-indent ms-indent-first" title="First line indent" style={{ left: (page.margins.left + ptToPx(indentLeft + firstLine)) * zoom }} />
      <span className="ms-indent ms-indent-left" title="Left indent" style={{ left: (page.margins.left + ptToPx(indentLeft)) * zoom }} />
      <span className="ms-indent ms-indent-right" title="Right indent" style={{ left: (page.width - page.margins.right - ptToPx(indentRight)) * zoom }} />
    </div>
  );
}

/** Zoom never changes stored geometry or pagination. `manual`: the user chose it (no more auto-fit). */
export let manualZoom = false;
export const setZoom = (z: number, manual = false) => {
  if (manual) manualZoom = true;
  studio.set({ zoom: Math.min(3, Math.max(0.25, Math.round(z * 100) / 100)) });
};
