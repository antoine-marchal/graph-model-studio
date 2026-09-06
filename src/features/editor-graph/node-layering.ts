export const ON_TOP_Z_INDEX = 10_000

/** True when an element should float over nodes beneath it and never embed on drop. */
export function isNodeOnTop(properties?: Record<string, string>): boolean {
  return properties?.onTop?.toLowerCase() === 'true'
}
