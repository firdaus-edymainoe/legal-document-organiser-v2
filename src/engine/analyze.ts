import {
  bindingRotation,
  compareRenders,
  decideOrientation,
  detectImageOrientation,
  normalizeRotation,
  textIsDecisive,
  textOrientation,
  vectorCopyFailed,
  type Detection,
  type Rotation,
} from "@/pdf-kernel"
import { pdfWorker } from "@/pdf-kernel/worker/client"

import { closePdf, openPdf, type PDFDocumentProxy } from "./pdfjs"
import {
  SHEET_RATIO,
  frameGray,
  freeCanvas,
  renderPage,
  toGray,
} from "./render"
import { openSource, sourceBytes } from "./sources"

export type RasterReason =
  "encrypted" | "unreadable" | "embed-failed" | "render-mismatch"

export type PageAnalysis = {
  index: number
  /** Size as displayed (after /Rotate), points. */
  width: number
  height: number
  /** Source /Rotate. */
  rotate: Rotation
  detection: Detection
  /** Extra clockwise turn chosen by the binding rule. */
  autoRotate: Rotation
  /** Why this page must be rasterised, or null for a vector copy. */
  raster: RasterReason | null
}

export type SourceAnalysis = {
  pageCount: number
  encrypted: boolean
  pages: PageAnalysis[]
}

/** Long side, in pixels, for the orientation check. Evaluated on real filings. */
const DETECT_LONG_SIDE = 1200
/** Width of the thumbnails compared to verify the vector copy. */
const VERIFY_WIDTH = 140

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function analyzeSource(
  id: string,
  onProgress: (done: number, total: number) => void,
  shouldStop: () => boolean = () => false
): Promise<SourceAnalysis> {
  const probe = await pdfWorker().probe(sourceBytes(id))
  const doc = await openSource(id)
  const total = doc.numPages
  const vectorUsable = probe.vectorOk && probe.pageCount === total
  const encrypted = probe.encrypted

  let probeDoc: PDFDocumentProxy | null = null
  if (vectorUsable && probe.probe) {
    try {
      probeDoc = (await openPdf(probe.probe)).doc
    } catch {
      probeDoc = null
    }
  }

  const pageErrors = new Set(probe.pageErrors)
  const pages: PageAnalysis[] = []
  try {
    for (let i = 0; i < total; i++) {
      if (shouldStop()) throw new Error("Stopped")
      const page = await doc.getPage(i + 1)
      const rotate = normalizeRotation(page.rotate)
      const shown = page.getViewport({ scale: 1 })

      let text = { angle: null, chars: 0, share: 0 } as ReturnType<
        typeof textOrientation
      >
      try {
        const content = await page.getTextContent()
        text = textOrientation(content.items as never[], page.rotate)
      } catch {
        // No usable text layer.
      }

      let rendered: HTMLCanvasElement | null = null
      let image = null
      if (!textIsDecisive(text)) {
        rendered = await renderPage(page, {
          fit: { width: DETECT_LONG_SIDE, height: DETECT_LONG_SIDE },
        })
        image = detectImageOrientation(toGray(rendered))
      }
      const detection = decideOrientation(text, image)
      const autoRotate = bindingRotation(
        shown.width,
        shown.height,
        detection.angle
      )

      let raster: RasterReason | null = null
      if (!vectorUsable) {
        raster = encrypted ? "encrypted" : "unreadable"
      } else if (pageErrors.has(i)) {
        raster = "embed-failed"
      } else if (probeDoc) {
        try {
          // Render both at the same scale: thin strokes lighten when
          // rendered small, so mixed scales look like lost content.
          const frame = {
            width: VERIFY_WIDTH * 2,
            height: Math.round(VERIFY_WIDTH * 2 * SHEET_RATIO),
          }
          const reference = await renderPage(page, { fit: frame })
          const referenceGray = frameGray(reference, VERIFY_WIDTH)
          freeCanvas(reference)
          const probePage = await probeDoc.getPage(i + 1)
          const copy = await renderPage(probePage, { fit: frame })
          const copyGray = frameGray(copy, VERIFY_WIDTH)
          freeCanvas(copy)
          probePage.cleanup()
          if (vectorCopyFailed(compareRenders(referenceGray, copyGray)))
            raster = "render-mismatch"
        } catch {
          raster = "render-mismatch"
        }
      }
      if (rendered) freeCanvas(rendered)
      page.cleanup()

      pages.push({
        index: i,
        width: shown.width,
        height: shown.height,
        rotate,
        detection,
        autoRotate,
        raster,
      })
      onProgress(i + 1, total)
      await yieldToUi()
    }
  } finally {
    await closePdf(probeDoc)
  }

  return { pageCount: total, encrypted, pages }
}
