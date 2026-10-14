import { rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { A4 } from "./types"

/** Distance from the top and right edges to the number's box. */
export const STAMP_MARGIN_PT = 22

/**
 * Stamp a page number in the top-right corner of a portrait A4 sheet, on a
 * white tab so it stays legible over scans.
 */
export function stampPageNumber(
  page: PDFPage,
  n: number,
  font: PDFFont,
  fontSize: number
): { x: number; y: number; width: number; height: number } {
  const label = String(n)
  const textWidth = font.widthOfTextAtSize(label, fontSize)
  const capHeight = font.heightAtSize(fontSize, { descender: false })
  const padX = fontSize * 0.35
  const padY = fontSize * 0.25
  const width = textWidth + padX * 2
  const height = capHeight + padY * 2
  const x = A4.widthPt - STAMP_MARGIN_PT - width
  const y = A4.heightPt - STAMP_MARGIN_PT - height

  page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1), opacity: 0.9 })
  page.drawText(label, {
    x: x + padX,
    y: y + padY,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  })
  return { x, y, width, height }
}
