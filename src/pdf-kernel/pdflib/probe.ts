import { PDFDocument, degrees, toDegrees } from "pdf-lib"

import { displayedSize, normalizeRotation, placementOnA4 } from "../geometry"
import { A4, type ProbeResult, type SourcePageInfo } from "../types"
import { flattenAnnotations } from "./annotations"
import { LOAD_OPTIONS, embedFromSource } from "./embed"

function isEncryptionError(err: unknown): boolean {
  const message =
    err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return /encrypt/i.test(message)
}

export function pageInfo(doc: PDFDocument): SourcePageInfo[] {
  return doc.getPages().map((page, index) => {
    const crop = page.getCropBox()
    const rotate = normalizeRotation(toDegrees(page.getRotation()))
    const shown = displayedSize(crop.width, crop.height, rotate)
    return {
      index,
      cropBox: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
      rotate,
      displayedWidth: shown.width,
      displayedHeight: shown.height,
    }
  })
}

/**
 * Work out whether a file can be copied as vectors, and produce a "probe"
 * copy (every page embedded on A4, no extra rotation) so the caller can
 * compare it against pdf.js's rendering of the original.
 */
export async function probeSource(bytes: Uint8Array): Promise<ProbeResult> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, LOAD_OPTIONS)
  } catch (err) {
    if (isEncryptionError(err)) {
      // pdf-lib cannot decrypt. Read the geometry anyway (boxes are not
      // encrypted) and let pdf.js rasterise every page.
      try {
        const locked = await PDFDocument.load(bytes, {
          ...LOAD_OPTIONS,
          ignoreEncryption: true,
        })
        const pages = pageInfo(locked)
        return {
          vectorOk: false,
          encrypted: true,
          pageCount: pages.length,
          pages,
          pageErrors: [],
          probe: null,
        }
      } catch {
        // Fall through to the generic failure below.
      }
      return {
        vectorOk: false,
        encrypted: true,
        pageCount: 0,
        pages: [],
        pageErrors: [],
        probe: null,
      }
    }
    return {
      vectorOk: false,
      encrypted: false,
      pageCount: 0,
      pages: [],
      pageErrors: [],
      probe: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  let pages: SourcePageInfo[]
  try {
    pages = pageInfo(doc)
  } catch (err) {
    return {
      vectorOk: false,
      encrypted: false,
      pageCount: 0,
      pages: [],
      pageErrors: [],
      probe: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const out = await PDFDocument.create()
  const pageErrors: number[] = []
  const sourcePages = doc.getPages()
  for (const page of sourcePages) {
    try {
      flattenAnnotations(page)
    } catch {
      // Drawing proceeds without the annotations; verification will notice.
    }
  }
  const embedded = await embedFromSource(out, sourcePages)
  for (let i = 0; i < sourcePages.length; i++) {
    const sheet = out.addPage([A4.widthPt, A4.heightPt])
    const page = embedded[i]
    if (!page) {
      pageErrors.push(i)
      continue
    }
    try {
      const place = placementOnA4(page.width, page.height, pages[i].rotate)
      sheet.drawPage(page, {
        x: place.x,
        y: place.y,
        width: place.width,
        height: place.height,
        rotate: degrees(place.rotateCcw),
      })
    } catch {
      pageErrors.push(i)
    }
  }

  let probe: Uint8Array
  try {
    probe = await out.save({ useObjectStreams: true })
  } catch {
    return {
      vectorOk: false,
      encrypted: false,
      pageCount: pages.length,
      pages,
      pageErrors: pages.map((p) => p.index),
      probe: null,
    }
  }

  return {
    vectorOk: pageErrors.length < pages.length,
    encrypted: false,
    pageCount: pages.length,
    pages,
    pageErrors,
    probe,
  }
}
