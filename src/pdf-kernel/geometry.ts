import { A4, A4_TOLERANCE_PT, type Rotation } from "./types"

export function normalizeRotation(angle: number): Rotation {
  const snapped = ((Math.round(angle / 90) * 90) % 360 + 360) % 360
  if (snapped === 0 || snapped === 90 || snapped === 180 || snapped === 270) {
    return snapped
  }
  return 0
}

export function addRotation(a: Rotation, b: Rotation): Rotation {
  return normalizeRotation(a + b)
}

export function displayedSize(
  width: number,
  height: number,
  rotateCw: Rotation,
): { width: number; height: number } {
  if (rotateCw === 90 || rotateCw === 270) {
    return { width: height, height: width }
  }
  return { width, height }
}

export function approx(a: number, b: number, tolerance = A4_TOLERANCE_PT): boolean {
  return Math.abs(a - b) <= tolerance
}

export function isA4Size(width: number, height: number): boolean {
  return (
    (approx(width, A4.widthPt) && approx(height, A4.heightPt)) ||
    (approx(width, A4.heightPt) && approx(height, A4.widthPt))
  )
}

export function isPortrait(width: number, height: number): boolean {
  return height + 1 >= width
}

export function cwToCcw(rotateCw: Rotation): Rotation {
  if (rotateCw === 0) return 0
  return normalizeRotation(360 - rotateCw)
}

/**
 * Visible text angle in clockwise degrees (same convention as `/Rotate`).
 * pdf.js content transforms are counter-clockwise; Acrobat `/Rotate` is clockwise.
 */
export function viewerTextAngle(
  contentCcw: Rotation,
  sourceRotateCw: Rotation,
): Rotation {
  return addRotation(sourceRotateCw, cwToCcw(contentCcw))
}

/**
 * Acrobat `/Rotate` is already the clockwise bake angle. `placementOnA4`
 * converts that to pdf-lib's CCW `drawPage` (once). Do not invert here —
 * doing so 90↔270's the page 180° off.
 */
export function flattenViewerRotation(sourceRotateCw: Rotation): Rotation {
  return sourceRotateCw
}

export type A4Placement = {
  x: number
  y: number
  width: number
  height: number
  rotateCcw: Rotation
  scale: number
  boundWidth: number
  boundHeight: number
}

/**
 * Place a source rectangle onto portrait A4 with uniform scale, centred.
 * `rotateCw` is viewer-style clockwise rotation (same as PDF /Rotate).
 * pdf-lib drawPage rotates counter-clockwise after scale, then translate.
 */
export function placementOnA4(
  srcWidth: number,
  srcHeight: number,
  rotateCw: Rotation,
  destWidth = A4.widthPt,
  destHeight = A4.heightPt,
): A4Placement {
  const bound = displayedSize(srcWidth, srcHeight, rotateCw)
  const scale = Math.min(destWidth / bound.width, destHeight / bound.height)
  const width = srcWidth * scale
  const height = srcHeight * scale
  const boundWidth = bound.width * scale
  const boundHeight = bound.height * scale
  const ox = (destWidth - boundWidth) / 2
  const oy = (destHeight - boundHeight) / 2
  const rotateCcw = cwToCcw(rotateCw)

  let x = ox
  let y = oy
  if (rotateCcw === 90) {
    x = ox + height
    y = oy
  } else if (rotateCcw === 180) {
    x = ox + width
    y = oy + height
  } else if (rotateCcw === 270) {
    x = ox
    y = oy + width
  }

  return { x, y, width, height, rotateCcw, scale, boundWidth, boundHeight }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const trimmed = hex.trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed)
  if (!match) return null
  const num = parseInt(match[1], 16)
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  }
}

export function cloneBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice()
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}
