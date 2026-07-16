const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomSuffix(size: number): string {
  let value = ''
  for (let index = 0; index < size; index++) {
    value += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  }
  return value
}

/** Compact, readable element id: first two type characters + four random chars. */
export function createElementId(elementType: string, size = 4): string {
  const letters = elementType.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const prefix = (letters.slice(0, 2) || 'no').padEnd(2, 'x')
  return `${prefix}_${randomSuffix(size)}`
}
