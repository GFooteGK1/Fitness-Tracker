// Validate every segment, including those between progressive scans. Decode
// separately below: valid marker framing alone does not prove valid pixels.
export function normalizedCameraJPEG(bytes: Buffer): boolean {
  if (bytes.length > 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216) return false
  let index = 2, inScan = false, sawFrame = false, scans = 0
  while (index < bytes.length) {
    if (inScan) while (index < bytes.length && bytes[index] !== 255) index++
    if (bytes[index++] !== 255) return false
    while (index < bytes.length && bytes[index] === 255) index++
    if (index >= bytes.length) return false
    const marker = bytes[index++]
    if (inScan && (marker === 0 || marker >= 208 && marker <= 215)) continue
    inScan = false
    if (marker === 217) return sawFrame && scans > 0 && index === bytes.length
    if (![192, 194, 196, 218, 219, 221, 224].includes(marker) || index + 2 > bytes.length) return false
    const length = bytes.readUInt16BE(index)
    if (length < 2 || index + length > bytes.length) return false
    if (marker === 224 && (length !== 16 || bytes.subarray(index + 2,index + 7).toString('binary') !== 'JFIF\0')) return false
    if (marker === 192 || marker === 194) {
      if (sawFrame || length < 11 || bytes[index + 2] !== 8) return false
      const height = bytes.readUInt16BE(index + 3), width = bytes.readUInt16BE(index + 5), components = bytes[index + 7]
      if (!width || !height || width > 1200 || height > 1200 || ![1,3].includes(components) || length !== 8 + 3 * components) return false
      sawFrame = true
    }
    if (marker === 218) {
      if (!sawFrame || length < 8 || length !== 6 + 2 * bytes[index + 2] || ++scans > 64) return false
      inScan = true
    }
    index += length
  }
  return false
}
