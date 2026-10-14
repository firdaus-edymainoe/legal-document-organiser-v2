import {
  bindingRotation,
  imagePlacements,
  type Box,
  scanBox,
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

import {
  closePdf,
  openPdf,
  pdfjs,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "./pdfjs"
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
  /**
   * The part of the page a scan occupies, when it sits on only part of the
   * page (e.g. a scan on the top-left of a Letter sheet). Null otherwise.
   */
  scan: Box | null
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
/** Pages of one file checked at the same time. */
const PAGE_CONCURRENCY = 3

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Where the page's images are drawn, and whether they form a partial scan. */
async function scanOf(page: PDFPageProxy): Promise<Box | null> {
  const lib = await pdfjs()
  const { fnArray, argsArray } = await page.getOperatorList()
  const [x0, y0, x1, y1] = page.view
  const placements = imagePlacements(fnArray, argsArray, lib.OPS)
  return scanBox(placements, {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
  })
}

export type AnalyzeHooks = {
  /**
   * Called as each page finishes. `soFar` holds every page analysed up to
   * now, so the UI can show results before the whole file is done.
   */
  onPage: (page: PageAnalysis, soFar: SourceAnalysis) => void
  shouldStop?: () => boolean
}

export async function analyzeSource(
  id: string,
  { onPage, shouldStop = () => false }: AnalyzeHooks
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

  /** One page. Pages are independent, so several run at once. */
  const analysePage = async (i: number): Promise<PageAnalysis> => {
    const page = await doc.getPage(i + 1)
    const rotate = normalizeRotation(page.rotate)
    const shown = page.getViewport({ scale: 1 })
    const scan = await scanOf(page)

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

    return {
      index: i,
      width: shown.width,
      height: shown.height,
      rotate,
      detection,
      autoRotate,
      raster,
      scan,
    }
  }

  // Index-aligned: a page's entry is at its own index, and holes are pages
  // still waiting. Pages finish out of order when several run at once.
  const pages = new Array<PageAnalysis>(total)
  let next = 0
  let failed = false
  const runPages = async () => {
    while (!failed && next < total) {
      if (shouldStop()) throw new Error("Stopped")
      const i = next++
      try {
        const analysed = await analysePage(i)
        pages[i] = analysed
        onPage(analysed, {
          pageCount: total,
          encrypted,
          pages: pages.slice(),
        })
        await yieldToUi()
      } catch (err) {
        failed = true
        throw err
      }
    }
  }

  try {
    const runners = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, total) },
      () => runPages()
    )
    // Wait for every runner before the probe document is closed.
    const settled = await Promise.allSettled(runners)
    const failure = settled.find((r) => r.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
  } finally {
    await closePdf(probeDoc)
  }

  return { pageCount: total, encrypted, pages }
}
