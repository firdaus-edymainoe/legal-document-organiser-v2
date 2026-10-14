import {
  BlendMode,
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  toDegrees,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"

import {
  addRotation,
  hexToRgb,
  normalizeRotation,
  placementOnA4,
} from "../geometry"
import { stampPageNumber } from "../stamp"
import { A4, type ComposeRequest, type SheetSpec } from "../types"
import { flattenAnnotations } from "./annotations"
import { LOAD_OPTIONS, embedFromSource, type Embedded } from "./embed"

function drawTab(page: PDFPage, label: string, bold: PDFFont) {
  let size = 54
  while (size > 18 && bold.widthOfTextAtSize(label, size) > A4.widthPt - 96)
    size -= 2
  const width = bold.widthOfTextAtSize(label, size)
  page.drawText(label, {
    x: (A4.widthPt - width) / 2,
    y: A4.heightPt / 2 - size * 0.35,
    size,
    font: bold,
    color: rgb(0, 0, 0),
  })
}

function tint(page: PDFPage, hex: string | null) {
  if (!hex) return
  const color = hexToRgb(hex)
  if (!color) return
  if (color.r > 0.995 && color.g > 0.995 && color.b > 0.995) return
  // Multiply keeps black text black and turns white paper into the colour,
  // so it works the same on typed pages and on opaque scans.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: A4.widthPt,
    height: A4.heightPt,
    color: rgb(color.r, color.g, color.b),
    blendMode: BlendMode.Multiply,
  })
}

export async function composeSheets(
  request: ComposeRequest,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  if (request.title) out.setTitle(request.title)
  out.setProducer("Legal Organiser")
  out.setCreator("Legal Organiser")
  const font = await out.embedFont(StandardFonts.Helvetica)
  const bold = await out.embedFont(StandardFonts.HelveticaBold)

  // Load each source once and embed every page it contributes in one batch.
  const wanted = new Map<string, Set<number>>()
  for (const sheet of request.sheets) {
    if (sheet.content.kind !== "vector") continue
    const set = wanted.get(sheet.content.sourceId) ?? new Set<number>()
    set.add(sheet.content.pageIndex)
    wanted.set(sheet.content.sourceId, set)
  }
  const embedded = new Map<string, Embedded>()
  const rotations = new Map<string, number>()
  for (const [sourceId, indices] of wanted) {
    const bytes = request.sources[sourceId]
    if (!bytes) throw new Error(`Missing source file ${sourceId}`)
    const doc = await PDFDocument.load(bytes, LOAD_OPTIONS)
    const order = [...indices].sort((a, b) => a - b)
    const pages = order.map((i) => doc.getPage(i))
    for (const page of pages) flattenAnnotations(page)
    const results = await embedFromSource(out, pages)
    order.forEach((i, k) => {
      const key = `${sourceId}:${i}`
      const result = results[k]
      if (!result)
        throw new Error(`Page ${i + 1} of a file could not be copied`)
      embedded.set(key, result)
      rotations.set(key, normalizeRotation(toDegrees(pages[k].getRotation())))
    })
  }

  const total = request.sheets.length
  for (let i = 0; i < total; i++) {
    const sheet: SheetSpec = request.sheets[i]
    const page = out.addPage([A4.widthPt, A4.heightPt])
    const content = sheet.content

    if (content.kind === "vector") {
      const key = `${content.sourceId}:${content.pageIndex}`
      const sourcePage = embedded.get(key)!
      const place = placementOnA4(
        sourcePage.width,
        sourcePage.height,
        addRotation(rotations.get(key) ?? 0, sheet.rotate)
      )
      page.drawPage(sourcePage, {
        x: place.x,
        y: place.y,
        width: place.width,
        height: place.height,
        rotate: degrees(place.rotateCcw),
      })
    } else if (content.kind === "raster") {
      const image = await out.embedJpg(content.image)
      const place = placementOnA4(
        content.widthPx,
        content.heightPx,
        sheet.rotate
      )
      page.drawImage(image, {
        x: place.x,
        y: place.y,
        width: place.width,
        height: place.height,
        rotate: degrees(place.rotateCcw),
      })
    } else if (content.kind === "tab") {
      drawTab(page, content.label, bold)
    }

    tint(page, sheet.color)
    if (sheet.number !== null)
      stampPageNumber(page, sheet.number, font, request.numberSize)
    onProgress?.(i + 1, total)
  }

  return out.save({ useObjectStreams: true })
}
