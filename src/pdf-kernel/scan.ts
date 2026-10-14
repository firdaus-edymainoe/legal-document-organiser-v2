import type { Box } from "./types"

/** An image as drawn on a page, in page (user-space) coordinates. */
export type Placement = { x0: number; y0: number; x1: number; y1: number }

/** Images under this share of the largest image are logos or icons. */
const MIN_IMAGE_SHARE = 0.02
/** The scanned area must cover this much of the page to be worth cropping... */
const MIN_SCAN_SHARE = 0.25
/** ...and less than this, or the page is already filled by its scan. */
const MAX_SCAN_SHARE = 0.9

function clip(p: Placement, page: Box): Placement {
  return {
    x0: Math.max(p.x0, page.x),
    y0: Math.max(p.y0, page.y),
    x1: Math.min(p.x1, page.x + page.width),
    y1: Math.min(p.y1, page.y + page.height),
  }
}

const area = (p: Placement) => (p.x1 - p.x0) * (p.y1 - p.y0)

/**
 * The region of a page that a scan occupies, or null when the page is not a
 * scan sitting on part of the page. Several image pieces (tiles) count as one
 * scan: the box is their combined extent. Small images are ignored so a logo
 * in the corner does not stretch the box.
 */
export function scanBox(placements: Placement[], page: Box): Box | null {
  const visible = placements
    .map((p) => clip(p, page))
    .filter((p) => p.x1 > p.x0 && p.y1 > p.y0)
  if (visible.length === 0) return null

  const largest = Math.max(...visible.map(area))
  const main = visible.filter((p) => area(p) >= largest * MIN_IMAGE_SHARE)
  const extent = {
    x0: Math.min(...main.map((p) => p.x0)),
    y0: Math.min(...main.map((p) => p.y0)),
    x1: Math.max(...main.map((p) => p.x1)),
    y1: Math.max(...main.map((p) => p.y1)),
  }
  const share = area(extent) / (page.width * page.height)
  if (share < MIN_SCAN_SHARE || share > MAX_SCAN_SHARE) return null

  const round = (n: number) => Math.round(n * 10) / 10
  return {
    x: round(extent.x0),
    y: round(extent.y0),
    width: round(extent.x1 - extent.x0),
    height: round(extent.y1 - extent.y0),
  }
}

/** The operator codes needed to follow the drawing matrix (pdf.js OPS). */
export type ImageOps = {
  save: number
  restore: number
  transform: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  paintImageXObject: number
  paintInlineImageXObject: number
  paintImageMaskXObject: number
  /** Clip and path ops, so a scan cut by a clip path is measured as drawn. */
  clip?: number
  eoClip?: number
  constructPath?: number
  endPath?: number
}

type Matrix = [number, number, number, number, number, number]

/**
 * A six-number matrix. pdf.js passes some as arrays and some as index-keyed
 * objects, so accept both.
 */
function toMatrix(value: unknown): Matrix | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<number, unknown>
  const m = [0, 1, 2, 3, 4, 5].map((i) => v[i])
  return m.every((n) => typeof n === "number") ? (m as Matrix) : null
}

/** Matrix product a × b: apply `a`, then `b`. */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ]
}

/**
 * Where each image is painted, from a page's operator list. Tracks the
 * drawing matrix through q/Q, cm and form XObjects.
 */
/** A rectangle, page coordinates, as the bounding box of `r` under `m`. */
function transformed(m: Matrix, r: Placement): Placement {
  const pts = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  }
}

/** Four numbers as [x0, y0, x1, y1], from an array or an index-keyed object. */
function toRect(value: unknown): Placement | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<number, unknown>
  const n = [0, 1, 2, 3].map((i) => v[i])
  if (!n.every((x) => typeof x === "number")) return null
  return {
    x0: n[0] as number,
    y0: n[1] as number,
    x1: n[2] as number,
    y1: n[3] as number,
  }
}

function intersection(a: Placement | null, b: Placement): Placement {
  if (!a) return b
  return {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  }
}

/**
 * Where each image is painted, from a page's operator list. Follows the
 * drawing matrix and the clip through q/Q, cm, clip paths and form XObjects.
 * A clip is taken as the bounding box of its path, which is a superset of a
 * non-rectangular clip: that can only make a crop larger, never cut content.
 */
export function imagePlacements(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: ImageOps
): Placement[] {
  type State = { ctm: Matrix; clip: Placement | null }
  let state: State = { ctm: [1, 0, 0, 1, 0, 0], clip: null }
  const stack: State[] = []
  const found: Placement[] = []
  let clipPending = false
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[] | undefined
    if (fn === ops.save) stack.push(state)
    else if (fn === ops.restore) state = stack.pop() ?? state
    else if (fn === ops.transform && args)
      state = { ...state, ctm: multiply(args as Matrix, state.ctm) }
    else if (fn === ops.clip || fn === ops.eoClip) clipPending = true
    else if (fn === ops.constructPath || fn === ops.endPath) {
      // A path after `W` sets the clip to its bounding box (page space).
      const box = fn === ops.constructPath ? toRect(args?.[2]) : null
      if (clipPending && box)
        state = {
          ...state,
          clip: intersection(state.clip, transformed(state.ctm, box)),
        }
      clipPending = false
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push(state)
      // A form may carry no matrix of its own: then it draws as it is.
      const form = toMatrix(args?.[0])
      const ctm = form ? multiply(form, state.ctm) : state.ctm
      let clip = state.clip
      // The form's BBox clips what it draws, in form space.
      const bbox = toRect(args?.[1])
      if (bbox) clip = intersection(clip, transformed(ctm, bbox))
      state = { ctm, clip }
    } else if (fn === ops.paintFormXObjectEnd) state = stack.pop() ?? state
    else if (
      fn === ops.paintImageXObject ||
      fn === ops.paintInlineImageXObject ||
      fn === ops.paintImageMaskXObject
    ) {
      // An image fills the unit square in its own space.
      const box = transformed(state.ctm, { x0: 0, y0: 0, x1: 1, y1: 1 })
      const visible = state.clip ? intersection(state.clip, box) : box
      if (visible.x1 > visible.x0 && visible.y1 > visible.y0)
        found.push(visible)
    }
  }
  return found
}
