import type { PDFDocument, PDFPage } from "pdf-lib"

export const LOAD_OPTIONS = { updateMetadata: false } as const

export type Embedded = Awaited<ReturnType<PDFDocument["embedPage"]>>

function cropBounds(page: PDFPage) {
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
  pages: PDFPage[]
): Promise<(Embedded | null)[]> {
  try {
    return await out.embedPages(pages, pages.map(cropBounds))
  } catch {
    // One bad page: embed individually so the rest still share nothing broken.
    const result: (Embedded | null)[] = []
    for (const page of pages) {
      try {
        result.push(await out.embedPage(page, cropBounds(page)))
      } catch {
        result.push(null)
      }
    }
    return result
  }
}
