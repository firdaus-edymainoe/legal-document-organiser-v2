import type { PDFDocument, PDFPage } from "pdf-lib"

import type { Box } from "../types"

export const LOAD_OPTIONS = { updateMetadata: false } as const

export type Embedded = Awaited<ReturnType<PDFDocument["embedPage"]>>

function cropBounds(page: PDFPage, window?: Box | null) {
  if (window)
    return {
      left: window.x,
      bottom: window.y,
      right: window.x + window.width,
      top: window.y + window.height,
    }
  const crop = page.getCropBox()
  return {
    left: crop.x,
    bottom: crop.y,
    right: crop.x + crop.width,
    top: crop.y + crop.height,
  }
}

/**
 * Embed pages of one source in a single pdf-lib call. pdf-lib shares one
 * object copier per call, so fonts and images used on many pages are copied
 * once instead of once per page (otherwise a bundle balloons several-fold).
 */
export async function embedFromSource(
  out: PDFDocument,
  pages: PDFPage[],
  windows: (Box | null | undefined)[] = []
): Promise<(Embedded | null)[]> {
  const bounds = pages.map((page, i) => cropBounds(page, windows[i]))
  try {
    return await out.embedPages(pages, bounds)
  } catch {
    // One bad page: embed individually so the rest still share nothing broken.
    const result: (Embedded | null)[] = []
    for (let i = 0; i < pages.length; i++) {
      try {
        result.push(await out.embedPage(pages[i], bounds[i]))
      } catch {
        result.push(null)
      }
    }
    return result
  }
}
