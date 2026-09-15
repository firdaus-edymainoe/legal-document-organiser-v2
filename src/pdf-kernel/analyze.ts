import { toDegrees } from "pdf-lib"

import type { AnalyzeResult, Box, PageAnalysis } from "./types"
import { displayedSize, normalizeRotation, viewerTextAngle } from "./geometry"
import { classifyIssues, snapTextAngle } from "./plan"
import { destroyPdf, getPdfjs } from "./pdfjs"
import { loadPdfForEditing } from "./unlock"

function asBox(box: { x: number; y: number; width: number; height: number }): Box {
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

export async function analyzePdf(bytes: Uint8Array): Promise<AnalyzeResult> {
  const doc = await loadPdfForEditing(bytes)
  const pages = doc.getPages()
  const textAngles = await detectContentTextAngles(bytes, pages.length)

  const result: PageAnalysis[] = pages.map((page, index) => {
    const cropBox = asBox(page.getCropBox())
    const mediaBox = asBox(page.getMediaBox())
    const sourceRotation = normalizeRotation(toDegrees(page.getRotation()))
    const displayed = displayedSize(cropBox.width, cropBox.height, sourceRotation)
    const contentTextAngle = textAngles[index] ?? null
    const displayTextAngle =
      contentTextAngle == null
        ? null
        : viewerTextAngle(snapTextAngle(contentTextAngle), sourceRotation)

    return {
      index,
      mediaBox,
      cropBox,
      sourceRotation,
      displayedWidthPt: displayed.width,
      displayedHeightPt: displayed.height,
      contentTextAngle,
      displayTextAngle,
      issues: classifyIssues(displayed.width, displayed.height, displayTextAngle),
    }
  })

  return { pageCount: result.length, pages: result }
}

async function detectContentTextAngles(
  bytes: Uint8Array,
  pageCount: number,
): Promise<(number | null)[]> {
  const angles: (number | null)[] = Array.from({ length: pageCount }, () => null)
  try {
    const pdfjs = await getPdfjs()
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    })
    const pdf = await loadingTask.promise
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        angles[i - 1] = await dominantContentAngle(page)
      }
    } finally {
      await destroyPdf(pdf)
    }
  } catch {
    return angles
  }
  return angles
}

async function dominantContentAngle(page: {
  getTextContent: () => Promise<{ items: unknown[] }>
}): Promise<number | null> {
  try {
    const content = await page.getTextContent()
    const buckets = new Map<number, number>()
    for (const item of content.items) {
      if (!item || typeof item !== "object") continue
      const rec = item as { str?: string; transform?: number[] }
      const text = rec.str?.trim() ?? ""
      if (!text || !Array.isArray(rec.transform) || rec.transform.length < 2) {
        continue
      }
      const deg =
        (Math.atan2(rec.transform[1], rec.transform[0]) * 180) / Math.PI
      const snapped = snapTextAngle(deg)
      const weight = text.length || 1
      buckets.set(snapped, (buckets.get(snapped) ?? 0) + weight)
    }
    if (buckets.size === 0) return null
    let best = 0
    let bestWeight = -1
    for (const [deg, weight] of buckets) {
      if (weight > bestWeight) {
        bestWeight = weight
        best = deg
      }
    }
    return best
  } catch {
    return null
  }
}
