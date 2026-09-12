import { StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { A4, STAMP_MARGIN_PT, STAMP_SIZE_PT } from "./types"

export function stampPageNumber(
  page: PDFPage,
  n: number,
  font: PDFFont,
  options?: { widthPt?: number; heightPt?: number },
): { x: number; y: number; width: number; height: number } {
  const widthPt = options?.widthPt ?? A4.widthPt
  const heightPt = options?.heightPt ?? A4.heightPt
  const label = String(n)
  const size = STAMP_SIZE_PT
  const textWidth = font.widthOfTextAtSize(label, size)
  const padX = 4
  const padY = 4
  const boxWidth = textWidth + padX * 2
  const boxHeight = size + padY * 2
  const boxX = widthPt - STAMP_MARGIN_PT - boxWidth
  const boxY = heightPt - STAMP_MARGIN_PT - boxHeight

  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: rgb(1, 1, 1),
    opacity: 0.92,
  })
  page.drawText(label, {
    x: boxX + padX,
    y: boxY + padY,
    size,
    font,
    color: rgb(0, 0, 0),
  })

  return { x: boxX, y: boxY, width: boxWidth, height: boxHeight }
}

export { StandardFonts }
