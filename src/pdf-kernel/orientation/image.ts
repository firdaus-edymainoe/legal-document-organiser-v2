/**
 * Orientation detection for pages that have no usable text layer (scans,
 * photographed exhibits). Works on a grayscale bitmap of the page exactly as
 * a viewer displays it.
 *
 * 1. Binarise (Otsu) and label connected components.
 * 2. Keep glyph-sized components.
 * 3. Axis: letters inside a word sit side by side along the reading
 *    direction, so short gaps between similarly sized neighbours are far more
 *    common along the text axis than across it.
 * 4. Direction: along a text line, Latin ascenders (b d f h k l t, capitals,
 *    digits) outnumber descenders (g j p q y) roughly 2–3 : 1, in both English
 *    and Malay. Upside-down text flips that ratio.
 *
 * Result is the clockwise angle the text appears rotated by (0 = upright).
 */

import type { Rotation } from "../types"

export type GrayImage = {
  width: number
  height: number
  /** One byte per pixel, 0 = black, 255 = white. */
  data: Uint8Array | Uint8ClampedArray
}

export type ImageOrientation = {
  /** Clockwise angle the text appears rotated by, or null when undecided. */
  angle: Rotation | null
  /** 0..1 — how sure we are the text runs along the chosen axis. */
  axisConfidence: number
  /** 0..1 — how sure we are which way up the text is. */
  flipConfidence: number
  /** Number of glyph-like components found. */
  glyphs: number
  /** Number of components used for the up/down vote. */
  votes: number
}

type Comp = {
  x0: number
  y0: number
  x1: number
  y1: number
  area: number
}

const NONE: ImageOrientation = {
  angle: null,
  axisConfidence: 0,
  flipConfidence: 0,
  glyphs: 0,
  votes: 0,
}

export function otsuThreshold(data: Uint8Array | Uint8ClampedArray): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < data.length; i++) hist[data[i]] += 1
  const total = data.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/** Connected components (8-connected) of dark pixels. */
export function components(img: GrayImage, threshold: number): Comp[] {
  const { width: w, height: h, data } = img
  const labels = new Int32Array(w * h)
  const parent: number[] = [0]
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }

  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (data[row + x] >= threshold) continue
      let label = 0
      const neighbours = [
        x > 0 ? labels[row + x - 1] : 0,
        y > 0 && x > 0 ? labels[row - w + x - 1] : 0,
        y > 0 ? labels[row - w + x] : 0,
        y > 0 && x < w - 1 ? labels[row - w + x + 1] : 0,
      ]
      for (const n of neighbours) {
        if (!n) continue
        if (!label) label = n
        else if (n !== label) union(label, n)
      }
      if (!label) {
        label = parent.length
        parent.push(label)
      }
      labels[row + x] = label
    }
  }

  const byRoot = new Map<number, Comp>()
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const l = labels[row + x]
      if (!l) continue
      const r = find(l)
      const c = byRoot.get(r)
      if (c) {
        if (x < c.x0) c.x0 = x
        if (x > c.x1) c.x1 = x
        if (y < c.y0) c.y0 = y
        if (y > c.y1) c.y1 = y
        c.area += 1
      } else {
        byRoot.set(r, { x0: x, y0: y, x1: x, y1: y, area: 1 })
      }
    }
  }
  return [...byRoot.values()]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function glyphLike(comps: Comp[], w: number, h: number): Comp[] {
  const maxDim = Math.max(12, Math.min(w, h) * 0.06)
  return comps.filter((c) => {
    const cw = c.x1 - c.x0 + 1
    const ch = c.y1 - c.y0 + 1
    if (cw < 2 || ch < 2) return false
    if (cw > maxDim || ch > maxDim) return false
    if (Math.max(cw, ch) < 4) return false
    const aspect = Math.max(cw, ch) / Math.min(cw, ch)
    if (aspect > 6) return false
    const fill = c.area / (cw * ch)
    if (fill < 0.08 || fill > 0.95) return false
    return true
  })
}

/** Swap axes so a vertical-text hypothesis can reuse the horizontal code. */
function transpose(c: Comp): Comp {
  return { x0: c.y0, y0: c.x0, x1: c.y1, y1: c.x1, area: c.area }
}

type Grid = { cell: number; map: Map<string, number[]> }

function buildGrid(comps: Comp[], cell: number): Grid {
  const map = new Map<string, number[]>()
  comps.forEach((c, i) => {
    const gx0 = Math.floor(c.x0 / cell)
    const gx1 = Math.floor(c.x1 / cell)
    const gy0 = Math.floor(c.y0 / cell)
    const gy1 = Math.floor(c.y1 / cell)
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = `${gx},${gy}`
        const list = map.get(key)
        if (list) list.push(i)
        else map.set(key, [i])
      }
    }
  })
  return { cell, map }
}

/**
 * For every component, link it to the nearest component to its right on the
 * same line (vertical overlap, similar height, small gap). Returns the number
 * of links and the union-find groups (text-line fragments).
 */
function horizontalLinks(comps: Comp[], grid: Grid) {
  const parent = comps.map((_, i) => i)
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  let links = 0
  comps.forEach((a, i) => {
    const ah = a.y1 - a.y0 + 1
    const reach = Math.max(2, ah * 0.6)
    let best = -1
    let bestGap = Infinity
    const gy0 = Math.floor(a.y0 / grid.cell)
    const gy1 = Math.floor(a.y1 / grid.cell)
    const gx0 = Math.floor((a.x1 + 1) / grid.cell)
    const gx1 = Math.floor((a.x1 + reach) / grid.cell)
    const seen = new Set<number>()
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        for (const j of grid.map.get(`${gx},${gy}`) ?? []) {
          if (j === i || seen.has(j)) continue
          seen.add(j)
          const b = comps[j]
          if (b.x0 <= a.x1) continue
          const gap = b.x0 - a.x1 - 1
          if (gap > reach) continue
          const bh = b.y1 - b.y0 + 1
          const ratio = Math.max(ah, bh) / Math.min(ah, bh)
          if (ratio > 3.2) continue
          const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1
          if (overlap < Math.min(ah, bh) * 0.5) continue
          if (gap < bestGap) {
            bestGap = gap
            best = j
          }
        }
      }
    }
    if (best >= 0) {
      links += 1
      const ra = find(i)
      const rb = find(best)
      if (ra !== rb) parent[rb] = ra
    }
  })
  const groups = new Map<number, number[]>()
  comps.forEach((_, i) => {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(i)
    else groups.set(r, [i])
  })
  return { links, groups: [...groups.values()] }
}

/**
 * Ascender/descender vote along horizontal lines.
 * Positive: upright (y grows downwards, ascenders stick up).
 */
function ascDescVote(
  comps: Comp[],
  groups: number[][]
): { score: number; votes: number } {
  let asc = 0
  let desc = 0
  for (const group of groups) {
    if (group.length < 4) continue
    const members = group.map((i) => comps[i])
    const tops = members.map((c) => c.y0)
    const bottoms = members.map((c) => c.y1)
    const top = median(tops)
    const bottom = median(bottoms)
    const core = bottom - top + 1
    if (core < 3) continue
    const margin = Math.max(1, core * 0.28)
    for (const c of members) {
      const ch = c.y1 - c.y0 + 1
      if (ch < core * 0.9) continue
      const up = c.y0 < top - margin
      const down = c.y1 > bottom + margin
      if (up && !down) asc += 1
      else if (down && !up) desc += 1
    }
  }
  const votes = asc + desc
  return { score: votes === 0 ? 0 : (asc - desc) / votes, votes }
}

export function detectImageOrientation(img: GrayImage): ImageOrientation {
  const { width: w, height: h, data } = img
  if (w < 50 || h < 50) return NONE
  const otsu = otsuThreshold(data)
  const threshold = Math.min(otsu, 200)
  let ink = 0
  for (let i = 0; i < data.length; i++) if (data[i] < threshold) ink += 1
  const inkFraction = ink / data.length
  if (inkFraction < 0.002 || inkFraction > 0.6) return NONE

  const glyphs = glyphLike(components(img, threshold), w, h)
  if (glyphs.length < 30) return { ...NONE, glyphs: glyphs.length }

  const size = median(
    glyphs.map((c) => Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1))
  )
  const cell = Math.max(8, Math.round(size * 2))

  const horiz = horizontalLinks(glyphs, buildGrid(glyphs, cell))
  const transposed = glyphs.map(transpose)
  const vert = horizontalLinks(transposed, buildGrid(transposed, cell))

  const totalLinks = horiz.links + vert.links
  if (totalLinks < 15) return { ...NONE, glyphs: glyphs.length }

  const horizontal = horiz.links >= vert.links
  const axisConfidence = Math.abs(horiz.links - vert.links) / totalLinks

  const vote = horizontal
    ? ascDescVote(glyphs, horiz.groups)
    : ascDescVote(transposed, vert.groups)

  // Map the vote to a clockwise display angle.
  // Horizontal axis: positive = upright (0), negative = upside down (180).
  // Vertical axis (after transposing x<->y): a page whose text reads
  // top-to-bottom (rotated 90° clockwise) has its ascenders pointing to the
  // right, i.e. towards larger x, which after transposition is larger y —
  // a negative vote.
  let angle: Rotation
  if (horizontal) angle = vote.score >= 0 ? 0 : 180
  else angle = vote.score >= 0 ? 270 : 90

  const strength = Math.min(1, Math.abs(vote.score) / 0.35)
  const support = Math.min(1, vote.votes / 40)
  const flipConfidence = strength * support

  return {
    angle,
    axisConfidence,
    flipConfidence,
    glyphs: glyphs.length,
    votes: vote.votes,
  }
}

/** Rotate a gray image clockwise by a multiple of 90 degrees (tests, tools). */
export function rotateGray(img: GrayImage, cw: Rotation): GrayImage {
  if (cw === 0) return img
  const { width: w, height: h, data } = img
  const out = new Uint8Array(w * h)
  const nw = cw === 180 ? w : h
  const nh = cw === 180 ? h : w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number
      let ny: number
      if (cw === 90) {
        nx = h - 1 - y
        ny = x
      } else if (cw === 180) {
        nx = w - 1 - x
        ny = h - 1 - y
      } else {
        nx = y
        ny = w - 1 - x
      }
      out[ny * nw + nx] = data[y * w + x]
    }
  }
  return { width: nw, height: nh, data: out }
}
