/**
 * Master placeholders, Slides Studio's model: a master defines boxes, each document fills them
 * with its own text (stored in the frontmatter `fields`, under the placeholder's key). Automatic
 * fields (date, page number, page count) are computed instead of typed.
 */
import { tr } from "../../slides-studio/packages/core/src/i18n";

export const AUTO_FIELDS = ["date", "page", "pages"] as const;
export type AutoField = (typeof AUTO_FIELDS)[number];

/** Key of a placeholder (`field:client` is the older spelling of `client`). */
export const placeholderKey = (placeholder: string): string => placeholder.replace(/^field:/, "");
export const isAutoField = (placeholder: string): placeholder is AutoField => (AUTO_FIELDS as readonly string[]).includes(placeholder);

/** Text placeholders offered when inserting one (any other key works too). */
export const TEXT_PRESETS = (): { key: string; label: string; prompt: string; fontSize?: number }[] => [
  { key: "title", label: tr("Titre", "Title"), prompt: tr("Titre du document", "Document title"), fontSize: 26 },
  { key: "subtitle", label: tr("Sous-titre", "Subtitle"), prompt: tr("Sous-titre", "Subtitle"), fontSize: 14 },
  { key: "author", label: tr("Auteur", "Author"), prompt: tr("Auteur", "Author") },
  { key: "client", label: tr("Client", "Client"), prompt: tr("Client", "Client") },
  { key: "reference", label: tr("Référence", "Reference"), prompt: tr("Référence du document", "Document reference") },
];

export const AUTO_LABELS = (): Record<AutoField, string> => ({
  date: tr("Date du jour", "Today's date"),
  page: tr("Numéro de page", "Page number"),
  pages: tr("Nombre de pages", "Page count"),
});

/** Prompt shown in an empty placeholder (screen only, never exported). */
export function placeholderPrompt(placeholder: string, text?: string): string {
  if (text) return text;
  const key = placeholderKey(placeholder);
  return TEXT_PRESETS().find((p) => p.key === key)?.prompt ?? tr(`Cliquez pour saisir : ${key}`, `Click to type: ${key}`);
}

/** Document value of a text placeholder: its field, the document title for `title`. */
export function placeholderValue(placeholder: string, fields: Record<string, string | undefined>, title: string): string {
  const key = placeholderKey(placeholder);
  return fields[key] ?? (key === "title" ? title : "");
}
