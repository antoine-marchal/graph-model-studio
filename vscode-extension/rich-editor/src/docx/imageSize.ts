/** Pixel size of a PNG, JPEG, GIF or BMP from its header; undefined for anything else. */
export function imageSize(data: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (data.length >= 10 && data[0] === 0x47 && data[1] === 0x49) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (data.length >= 26 && data[0] === 0x42 && data[1] === 0x4d) return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  if (data[0] === 0xff && data[1] === 0xd8) {
    // Walk JPEG segments up to a start-of-frame marker.
    for (let i = 2; i + 9 < data.length; ) {
      if (data[i] !== 0xff) return undefined;
      const marker = data[i + 1];
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      i += 2 + length;
    }
  }
  return undefined;
}
