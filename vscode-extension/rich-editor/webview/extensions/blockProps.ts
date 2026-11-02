import type { BlockProps } from "../../document/schema";

/** `msBlock` attribute (JSON) of a block as properties; {} when absent or malformed. */
export function parseBlockProps(value: unknown): BlockProps {
  if (!value || typeof value !== "string") return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
