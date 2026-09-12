import { PDFDocument, PDFName, degrees, rgb, toDegrees } from "pdf-lib"

import { A4 } from "./types"
import type { PagePlan } from "./types"
import { addRotation, hexToRgb, flattenViewerRotation, normalizeRotation, placementOnA4 } from "./geometry"
import { SAVE_OPTIONS, loadPdfForEditing } from "./unlock"

export async function normalizeDocument(
  sourceBytes: Uint8Array,
  plans: PagePlan[],
): Promise<Uint8Array> {
  const source = await loadPdfForEditing(sourceBytes)
  const out = await PDFDocument.create()
  const sourcePages = source.getPages()

  for (const plan of plans) {
    const srcPage = sourcePages[plan.index]
    if (!srcPage) {
      throw new Error(`Missing source page ${plan.index}`)
    }
    const crop = srcPage.getCropBox()
    const embedded = await out.embedPage(srcPage, {
      left: crop.x,
      bottom: crop.y,
      right: crop.x + crop.width,
      top: crop.y + crop.height,
    })
    const page = out.addPage([A4.widthPt, A4.heightPt])
    page.setMediaBox(0, 0, A4.widthPt, A4.heightPt)
    page.setCropBox(0, 0, A4.widthPt, A4.heightPt)
    page.node.delete(PDFName.of("BleedBox"))
    page.node.delete(PDFName.of("TrimBox"))
    page.node.delete(PDFName.of("ArtBox"))
    page.setRotation(degrees(0))

    if (plan.color) {
      const color = hexToRgb(plan.color)
      if (color) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: A4.widthPt,
          height: A4.heightPt,
          color: rgb(color.r, color.g, color.b),
        })
      }
    }

    const sourceRotation = normalizeRotation(toDegrees(srcPage.getRotation()))
    const totalCw = addRotation(flattenViewerRotation(sourceRotation), plan.rotate)
    const place = placementOnA4(embedded.width, embedded.height, totalCw)
    page.drawPage(embedded, {
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      rotate: degrees(place.rotateCcw),
    })
  }

  return out.save(SAVE_OPTIONS)
}

export async function normalizeSinglePage(
  sourceBytes: Uint8Array,
  plan: PagePlan,
): Promise<Uint8Array> {
  return normalizeDocument(sourceBytes, [plan])
}
