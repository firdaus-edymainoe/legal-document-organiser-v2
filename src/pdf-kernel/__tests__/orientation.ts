import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { expect } from "vitest"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs"

import { destroyPdf } from "../pdfjs"

const require = createRequire(import.meta.url)
GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
).href

type Bands = {
  rotate: number
  top: string
  bottom: string
}

function bandText(
  items: { str: string; y: number }[],
  height: number,
  fromFrac: number,
  toFrac: number,
): string {
  const y0 = height * fromFrac
  const y1 = height * toFrac
  return items
    .filter((item) => item.y >= y0 && item.y < y1 && item.str.trim())
    .map((item) => item.str.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 240)
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  )
}

function overlap(a: string, b: string): number {
  if (!a || !b) return 0
  const A = tokens(a)
  const B = tokens(b)
  if (A.size === 0 || B.size === 0) return 0
  let n = 0
  for (const token of A) if (B.has(token)) n += 1
  return n / Math.min(A.size, B.size)
}

async function layout(
  page: {
    rotate: number
    getViewport: (opts: { scale: number }) => {
      height: number
      convertToViewportPoint: (x: number, y: number) => number[]
    }
    getTextContent: () => Promise<{ items: unknown[] }>
  },
): Promise<Bands> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items: { str: string; y: number }[] = []
  for (const item of content.items) {
    if (!item || typeof item !== "object") continue
    const rec = item as { str?: string; transform?: number[] }
    if (!rec.str || !Array.isArray(rec.transform) || rec.transform.length < 6) {
      continue
    }
    const point = viewport.convertToViewportPoint(rec.transform[4], rec.transform[5])
    items.push({ str: rec.str, y: point[1] ?? 0 })
  }
  return {
    rotate: page.rotate,
    top: bandText(items, viewport.height, 0, 0.28),
    bottom: bandText(items, viewport.height, 0.72, 1),
  }
}

export function orientationVerdict(
  source: Bands,
  baked: Bands,
): "OK" | "UPSIDE" | "AMBIG" {
  const topTop = overlap(source.top, baked.top)
  const topBot = overlap(source.top, baked.bottom)
  const botTop = overlap(source.bottom, baked.top)
  if (topBot >= 0.45 && topBot > topTop + 0.15) return "UPSIDE"
  if (botTop >= 0.45 && botTop > topTop + 0.15) return "UPSIDE"
  if (
    /serial number will be used/i.test(baked.top) &&
    !/serial number will be used/i.test(source.top)
  ) {
    return "UPSIDE"
  }
  if (topTop >= 0.45 && topTop > topBot + 0.15) return "OK"
  if (!source.top && !baked.top) return "OK"
  if (!source.top && baked.top && overlap(source.bottom, baked.bottom) >= 0.4) {
    return "OK"
  }
  return "AMBIG"
}

function loadPdf(bytes: Uint8Array) {
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ).href
  return getDocument({
    data: bytes.slice(),
    disableAutoFetch: true,
    disableStream: true,
    verbosity: 0,
  }).promise
}

export async function assertUprightAgainstSource(
  sourceBytes: Uint8Array,
  bakedBytes: Uint8Array,
  label: string,
): Promise<void> {
  const source = await loadPdf(sourceBytes)
  const baked = await loadPdf(bakedBytes)
  try {
    expect(baked.numPages, `${label} page count`).toBe(source.numPages)
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
      const sourcePage = await source.getPage(pageNumber)
      const bakedPage = await baked.getPage(pageNumber)
      const verdict = orientationVerdict(await layout(sourcePage), await layout(bakedPage))
      expect(verdict, `${label} p${pageNumber}`).not.toBe("UPSIDE")
    }
  } finally {
    await destroyPdf(source)
    await destroyPdf(baked)
  }
}

export async function pageBands(bytes: Uint8Array, pageNumber = 1): Promise<Bands> {
  const pdf = await loadPdf(bytes)
  try {
    return await layout(await pdf.getPage(pageNumber))
  } finally {
    await destroyPdf(pdf)
  }
}
