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
import {
  A4,
  type Box,
  type ComposeRequest,
  type NumberFont,
  type SheetSpec,
} from "../types"
import { flattenAnnotations } from "./annotations"
import { LOAD_OPTIONS, embedFromSource, type Embedded } from "./embed"

type SourcePick = { pageIndex: number; crop: Box | null }

/** Identifies one drawn variant of a source page (whole, or a crop of it). */
function vectorKey(content: {
  sourceId: string
  pageIndex: number
  crop?: Box | null
}): string {
  const crop = content.crop
    ? [
        content.crop.x,
        content.crop.y,
        content.crop.width,
        content.crop.height,
      ].join(",")
    : "-"
  return `${content.sourceId}:${content.pageIndex}:${crop}`
}

const NUMBER_FONTS: Record<NumberFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
}

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
  const numberFont = await out.embedFont(NUMBER_FONTS[request.numberStyle.font])
  const bold = await out.embedFont(StandardFonts.HelveticaBold)

  // Load each source once and embed every page variant it contributes in one
  // batch. A page may appear whole and cropped, so the crop is part of the key.
  const wanted = new Map<string, Map<string, SourcePick>>()
  for (const sheet of request.sheets) {
    if (sheet.content.kind !== "vector") continue
    const { sourceId, pageIndex, crop } = sheet.content
    const picks = wanted.get(sourceId) ?? new Map<string, SourcePick>()
    picks.set(vectorKey(sheet.content), { pageIndex, crop: crop ?? null })
    wanted.set(sourceId, picks)
  }
  const embedded = new Map<string, Embedded>()
  const rotations = new Map<string, number>()
  for (const [sourceId, picks] of wanted) {
    const bytes = request.sources[sourceId]
    if (!bytes) throw new Error(`Missing source file ${sourceId}`)
    const doc = await PDFDocument.load(bytes, LOAD_OPTIONS)
    const entries = [...picks.entries()].sort(
      ([, a], [, b]) => a.pageIndex - b.pageIndex
    )
    const pages = entries.map(([, pick]) => doc.getPage(pick.pageIndex))
    for (const page of pages) flattenAnnotations(page)
    const results = await embedFromSource(
      out,
      pages,
      entries.map(([, pick]) => pick.crop)
    )
    entries.forEach(([key, pick], k) => {
      const result = results[k]
      if (!result)
        throw new Error(
          `Page ${pick.pageIndex + 1} of a file could not be copied`
        )
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
      const key = vectorKey(content)
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
      stampPageNumber(page, sheet.number, numberFont, request.numberStyle.size)
    onProgress?.(i + 1, total)
  }

  return out.save({ useObjectStreams: true })
}
