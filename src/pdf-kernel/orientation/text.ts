import type { Rotation } from "../types"
import { normalizeRotation } from "../geometry"

export type TextItemLike = {
  str?: string
  transform?: number[]
}

export type TextOrientation = {
  /** Clockwise angle the dominant text appears rotated by, or null. */
  angle: Rotation | null
  /** Characters counted after filtering stamps and page numbers. */
  chars: number
  /** Share of counted characters that agree with `angle` (0..1). */
  share: number
}

/**
 * Text the courts or filing systems stamp on top of a page. It is always
 * upright relative to the *filed* page, so it says nothing about the
 * orientation of the document underneath.
 */
const STAMP_PATTERNS = [
  /serial number will be used/i,
  /e-?filing/i,
  /^\s*s\/n\b/i,
  /originality of this document/i,
]

function isNoise(text: string): boolean {
  if (STAMP_PATTERNS.some((re) => re.test(text))) return true
  // Page numbers, bates numbers, lone punctuation.
  if (/^[\d\s.,:;()\-/]+$/.test(text) && text.replace(/\s/g, "").length <= 6) {
    return true
  }
  return false
}

/**
 * Visible text angle from pdf.js text items. `pageRotate` is the page's
 * /Rotate (clockwise). pdf.js transforms are in unrotated user space, where
 * angles are counter-clockwise.
 */
export function textOrientation(
  items: readonly TextItemLike[],
  pageRotate: number
): TextOrientation {
  const weights = new Map<Rotation, number>([
    [0, 0],
    [90, 0],
    [180, 0],
    [270, 0],
  ])
  let chars = 0
  const rotate = normalizeRotation(pageRotate)

  for (const item of items) {
    const text = (item.str ?? "").trim()
    if (!text || !item.transform || item.transform.length < 4) continue
    if (isNoise(text)) continue
    const [a, b] = item.transform
    const ccw = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
    const snapped = normalizeRotation(ccw)
    const off = Math.abs(((ccw - snapped + 540) % 360) - 180)
    // Diagonal watermarks and skewed scraps say nothing useful.
    if (off > 15) continue
    const visible = normalizeRotation(rotate - snapped)
    const weight = text.replace(/\s+/g, "").length
    weights.set(visible, (weights.get(visible) ?? 0) + weight)
    chars += weight
  }

  if (chars === 0) return { angle: null, chars: 0, share: 0 }
  let angle: Rotation = 0
  let best = -1
  for (const [deg, weight] of weights) {
    if (weight > best) {
      best = weight
      angle = deg
    }
  }
  return { angle, chars, share: best / chars }
}
