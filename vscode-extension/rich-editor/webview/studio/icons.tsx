/**
 * Slides Studio's authored icon set (16px, 1.5px stroke, currentColor) plus the document glyphs
 * Word needs, drawn on the same grid and stroke so both studios read as one family.
 */
import type { SVGProps } from "react";
import { Icon as SlidesIcon, type IconName as SlidesIconName } from "../../../slides-studio/packages/extension/webview/src/icons";

const EXTRA = {
  moveUp: "M8 13.5v-11M4 6.5l4-4 4 4",
  moveDown: "M8 2.5v11M4 9.5l4 4 4-4",
  dragHandle: "M6 3.5v.01M10 3.5v.01M6 8v.01M10 8v.01M6 12.5v.01M10 12.5v.01",
  lineNumbers: "M2.5 3.5h1.5v4M2.5 7.5h3M2.5 10h2.2a.9.9 0 0 1 0 1.8H3.3a.9.9 0 0 0 0 1.8H5.5M8 4h6M8 8h6M8 12h6",
  info: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v4M8 5v.01",
  page: "M4 1.5h5.5L12.5 4.5V14.5H4zM9.5 1.5v3h3",
  pages: "M3 3.5h6.5l3 3v8H3zM5.5 1.5h6l3 3",
  pageBreak: "M3.5 1.5v4.5h9V1.5M3.5 14.5V10h9v4.5M1.5 8h2M6 8h1.5M9.5 8H11M13 8h1.5",
  section: "M2 2.5h12M2 13.5h12M4.5 5.5h7v5h-7z",
  margins: "M2.5 2.5h11v11h-11zM5 2.5v11M11 2.5v11M2.5 5h11M2.5 11h11",
  orientation: "M2 5.5h8.5v8.5H2zM6.5 2h7.5v7.5M11 1l1.5 1.5L11 4",
  size: "M3.5 1.5h9v13h-9zM6 5h4M6 8h4M6 11h2.5",
  columns: "M2 3h5M2 6h5M2 9h5M2 12h5M9 3h5M9 6h5M9 9h5M9 12h5",
  header: "M2.5 2.5h11v11h-11zM2.5 5.5h11M4.5 4h4",
  footer: "M2.5 2.5h11v11h-11zM2.5 10.5h11M4.5 12h4",
  anchor: "M8 4.5v9.5M5.5 7h5M8 2a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 1 0 0-2.5zM3 10.5c.6 2.2 2.6 3.5 5 3.5s4.4-1.3 5-3.5M3 10.5l-1 1.5M13 10.5l1 1.5",
  float: "M2 3h12M2 6h4M2 9h4M2 12h12M7.5 5h6.5v5.5H7.5z",
  pin: "M10 1.5l4.5 4.5-2 1-2.5 2.5.5 3-1.5 1.5-3-3L2 15M6 6.5l-1.5-1.5 1.5-2 3 .5 2.5-2.5",
  inline: "M2 3h12M2 13h12M4 6h8v4H4z",
  styles: "M3 13l3.5-10h1L11 13M4.3 9.5h5.4M12 4.5h2.5M12 7.5h2.5M12 10.5h2.5",
  paragraph: "M10 2.5v11M12.5 2.5v11M13.5 2.5H7a3 3 0 0 0 0 6h3",
  spacing: "M8 1.5v4M6 3.5l2-2 2 2M8 14.5v-4M6 12.5l2 2 2-2M2.5 8h11",
  toc: "M2 3h7M2 6.5h9M3.5 10h7M3.5 13.5h6M12.5 3h1.5M12.5 6.5h1.5M12.5 10h1.5M12.5 13.5h1.5",
  caption: "M2.5 2h11v8h-11zM4.5 8l2.5-3 2 2 1.5-1.5 2 2.5M4 13.5h8",
  bookmark: "M4.5 1.5h7v13L8 11.5l-3.5 3z",
  crossRef: "M6.5 9.5l3-3M7 4.5l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5L10.5 8M5.5 8L4 9.5a2.5 2.5 0 0 0 3.5 3.5L9 11.5",
  preflight: "M8 1.5l5.5 2v4c0 3.5-2.3 6-5.5 7-3.2-1-5.5-3.5-5.5-7v-4zM5.5 8l1.8 1.8L10.8 6",
  ruler: "M1.5 5h13v6h-13zM4 5v2.5M6.5 5v1.5M9 5v2.5M11.5 5v1.5",
  continuous: "M3.5 1.5v13M12.5 1.5v13M5.5 4h5M5.5 7h5M5.5 10h5M5.5 13h3",
  fitWidth: "M1.5 8h13M4 5.5L1.5 8 4 10.5M12 5.5l2.5 2.5-2.5 2.5M1.5 2v12M14.5 2v12",
  fitPage: "M4 1.5h8v13H4zM1.5 5v6M14.5 5v6",
  importDoc: "M4 1.5h5.5L12.5 4.5V14.5H4zM8 6v6M5.5 9.5L8 12l2.5-2.5",
  field: "M2 4.5h12v7H2zM4.5 6.5v3M6.5 6.5v3M11.5 7v2",
  highlight: "M9.5 2.5l4 4-6 6H3.5v-4zM2 14.5h12",
  callout: "M2.5 2.5h11v8H8l-3 3v-3H2.5z",
  signature: "M1.5 11.5c2-4 3.5-7 4.5-7s-.5 7 1 7 2-3 3-3 1 2 2 2h2.5M1.5 14h13",
  equation: "M2.5 3.5h6l-4 4.5 4 4.5h-6M10.5 6h4M10.5 10h4",
  mermaid: "M2 2.5h4v3H2zM10 2.5h4v3h-4zM6 10.5h4v3H6zM4 5.5v2.5h8V5.5M8 8v2.5",
  keepNext: "M2 3h12M2 6h12M5 9.5h6M8 9.5v5M6 12.5l2 2 2-2",
  keepTogether: "M2 3h12M2 6h12M2 9h12M1 1.5v9M15 1.5v9",
  widow: "M2 3h12M2 6h12M2 9h8M2 13h5",
  guides: "M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13",
  boundaries: "M3 1.5v3H1.5M13 1.5v3h1.5M3 14.5v-3H1.5M13 14.5v-3h1.5",
  wrapSquare: "M5 5h6v6H5zM1.5 3h13M1.5 13h13M1.5 6.5h2M1.5 9.5h2M12.5 6.5h2M12.5 9.5h2",
  wrapTopBottom: "M5 5.5h6v5H5zM1.5 3h13M1.5 13h13",
  wrapFront: "M1.5 4h13M1.5 7h13M1.5 10h13M1.5 13h13M4.5 5.5h7v6h-7z",
  wrapBehind: "M4.5 5.5h7v6h-7zM1.5 4h3M11.5 4h3M1.5 13h13M1.5 7h3M11.5 7h3",
  placeholder: "M2.5 2.5h11v11h-11zM5 6h6M5 9h4",
  done: "M3 8.5l3 3 7-7",
} as const;

export type IconName = SlidesIconName | keyof typeof EXTRA;

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const d = (EXTRA as Record<string, string>)[name];
  if (!d) return <SlidesIcon name={name as SlidesIconName} size={size} {...rest} />;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={d} />
    </svg>
  );
}
