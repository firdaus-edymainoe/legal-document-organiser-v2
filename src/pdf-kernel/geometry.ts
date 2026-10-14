import { A4, type Rotation } from "./types"

export function normalizeRotation(angle: number): Rotation {
  const snapped = (((Math.round(angle / 90) * 90) % 360) + 360) % 360
  if (snapped === 90 || snapped === 180 || snapped === 270) return snapped
  return 0
}

export function addRotation(a: number, b: number): Rotation {
  return normalizeRotation(a + b)
}

export function displayedSize(
  width: number,
  height: number,
  rotateCw: Rotation
): { width: number; height: number } {
  if (rotateCw === 90 || rotateCw === 270)
    return { width: height, height: width }
  return { width, height }
}

export function cwToCcw(rotateCw: Rotation): Rotation {
  return normalizeRotation(360 - rotateCw)
}

export type A4Placement = {
  x: number
  y: number
  width: number
  height: number
  rotateCcw: Rotation
  scale: number
}

/**
 * Place a source rectangle (unrotated, `srcWidth` x `srcHeight`) onto portrait
 * A4, turned `rotateCw` clockwise, scaled uniformly to fit and centred.
 * Returns arguments for pdf-lib `drawPage`/`drawImage`, which rotate
 * anticlockwise about the bottom-left corner after scaling.
 */
export function placementOnA4(
  srcWidth: number,
  srcHeight: number,
  rotateCw: Rotation,
  destWidth: number = A4.widthPt,
  destHeight: number = A4.heightPt
): A4Placement {
  const bound = displayedSize(srcWidth, srcHeight, rotateCw)
  const scale = Math.min(destWidth / bound.width, destHeight / bound.height)
  const width = srcWidth * scale
  const height = srcHeight * scale
  const ox = (destWidth - bound.width * scale) / 2
  const oy = (destHeight - bound.height * scale) / 2
  const rotateCcw = cwToCcw(rotateCw)

  let x = ox
  let y = oy
  if (rotateCcw === 90) {
    x = ox + height
  } else if (rotateCcw === 180) {
    x = ox + width
    y = oy + height
  } else if (rotateCcw === 270) {
    y = oy + width
  }
  return { x, y, width, height, rotateCcw, scale }
}

export function hexToRgb(
  hex: string
): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const num = parseInt(match[1], 16)
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  }
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
}
