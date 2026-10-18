// Type declarations for the parts of pptx-masters@0.1.1 we use (the package ships plain JS).
declare module 'pptx-masters' {
  export function extract(inputPath: string, options?: { layouts?: string[] }): Promise<import('./normalize.js').PptxMastersResult & { templateName: string }>;
}
declare module 'pptx-masters/src/generator/code.js' {
  export function generateThemeJson(
    themeColors: Record<string, string>,
    themeFonts: { heading: string; body: string },
    dimensions: { width: number; height: number },
    masterData?: unknown[],
  ): { palette: Record<string, Record<string, string>> };
}
declare module 'pptx-masters/src/generator/report.js' {
  export function generateReport(extractionResult: unknown): string;
}
declare module 'pptx-masters/src/parser/colors.js' {
  export function createColorResolver(themeColors: Record<string, string>, clrMap: Record<string, string>, themeFonts: { heading: string; body: string }): unknown;
}
declare module 'pptx-masters/src/parser/theme.js' {
  export function parseClrMap(el: unknown): Record<string, string>;
}
declare module 'pptx-masters/src/parser/text.js' {
  export function extractTextProps(txBody: unknown, colorResolver: unknown, themeFonts: { heading: string; body: string }): { lstStyleProps: Record<number, import('./normalize.js').RawLevel> | null };
}
