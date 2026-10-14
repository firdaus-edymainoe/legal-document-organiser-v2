import type { GrayImage } from "./orientation/image"

export type RenderComparison = {
  /** Fraction of dark pixels in the reference (pdf.js render of the original). */
  inkReference: number
  /** Fraction of dark pixels in the candidate (render of the vector copy). */
  inkCandidate: number
  /** Mean absolute difference, 0..255. */
  meanDiff: number
}

const DARK = 170

export function compareRenders(
  reference: GrayImage,
  candidate: GrayImage
): RenderComparison {
  if (
    reference.width !== candidate.width ||
    reference.height !== candidate.height
  ) {
    throw new Error("compareRenders needs equal sizes")
  }
  const n = reference.data.length
  let inkA = 0
  let inkB = 0
  let diff = 0
  for (let i = 0; i < n; i++) {
    const a = reference.data[i]
    const b = candidate.data[i]
    if (a < DARK) inkA += 1
    if (b < DARK) inkB += 1
    diff += Math.abs(a - b)
  }
  return { inkReference: inkA / n, inkCandidate: inkB / n, meanDiff: diff / n }
}

/**
 * Did copying the page as vectors lose or garble it? Typical failures are a
 * blank sheet (unsupported content, broken resources) or content drawn in
 * the wrong place.
 */
export function vectorCopyFailed(c: RenderComparison): boolean {
  if (c.inkReference > 0.004 && c.inkCandidate < c.inkReference * 0.35)
    return true
  if (c.meanDiff > 28) return true
  return false
}
