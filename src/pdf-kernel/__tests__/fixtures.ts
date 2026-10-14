import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib"

import { A4 } from "../types"

const SIZE = {
  a4Portrait: [A4.widthPt, A4.heightPt] as [number, number],
  a4Landscape: [A4.heightPt, A4.widthPt] as [number, number],
  letterPortrait: [612, 792] as [number, number],
}

async function fonts(doc: PDFDocument) {
  return {
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
}

export async function portraitA4Pdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Portrait)
  page.drawText("Contract of Sale", {
    x: 48,
    y: A4.heightPt - 64,
    size: 20,
    font: bold,
  })
  page.drawText("This agreement is made between Party A and Party B.", {
    x: 48,
    y: A4.heightPt - 110,
    size: 12,
    font,
  })
  return doc.save()
}

export async function letterPortraitPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage(SIZE.letterPortrait)
  page.drawText("Affidavit", { x: 48, y: 792 - 64, size: 20, font: bold })
  page.drawText("US Letter paper.", { x: 48, y: 792 - 110, size: 12, font })
  return doc.save()
}

export async function letterMediaA4CropPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage([800, 1100])
  page.setCropBox(40, 80, A4.widthPt, A4.heightPt)
  page.drawText("Cropped A4", {
    x: 40 + 48,
    y: 80 + A4.heightPt - 64,
    size: 20,
    font: bold,
  })
  page.drawText("MediaBox is larger; CropBox is A4.", {
    x: 40 + 48,
    y: 80 + A4.heightPt - 110,
    size: 12,
    font,
  })
  return doc.save()
}

export async function rotate180Pdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Portrait)
  page.drawText("Upside down exhibit", {
    x: 48,
    y: A4.heightPt - 64,
    size: 20,
    font: bold,
  })
  page.drawText("This page is rotated 180 degrees.", {
    x: 48,
    y: A4.heightPt - 110,
    size: 12,
    font,
  })
  page.setRotation(degrees(180))
  return doc.save()
}

export async function rotate270LandscapePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Landscape)
  const [width, height] = SIZE.a4Landscape
  // /Rotate 270 CW maps the landscape right edge to the displayed top.
  page.drawText("HEADER-270", {
    x: width - 160,
    y: height / 2,
    size: 20,
    font: bold,
  })
  page.drawText("FOOTER-270", {
    x: 36,
    y: height / 2,
    size: 12,
    font,
  })
  page.setRotation(degrees(270))
  return doc.save()
}

export async function rotate90PortraitPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Portrait)
  page.drawText("HEADER-90", {
    x: 48,
    y: A4.heightPt - 64,
    size: 20,
    font: bold,
  })
  page.drawText("FOOTER-90", { x: 48, y: 48, size: 12, font })
  page.setRotation(degrees(90))
  return doc.save()
}

export async function landscapeUprightPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, bold } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Landscape)
  page.drawText("Landscape Figure", {
    x: 48,
    y: A4.widthPt - 64,
    size: 20,
    font: bold,
  })
  page.drawText("Upright text on a landscape sheet.", {
    x: 48,
    y: A4.widthPt - 110,
    size: 12,
    font,
  })
  return doc.save()
}

export async function encryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Portrait)
  page.drawText("Confidential", { x: 48, y: A4.heightPt - 64, size: 18, font })
  const encryptDict = doc.context.obj({
    Filter: "Standard",
    V: 1,
    R: 2,
    P: -4,
  })
  doc.context.trailerInfo.Encrypt = encryptDict
  return doc.save()
}

export async function originShiftedCropPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { bold } = await fonts(doc)
  const page = doc.addPage([900, 1200])
  page.setCropBox(50, 60, A4.widthPt, A4.heightPt)
  page.drawRectangle({
    x: 50,
    y: 60,
    width: A4.widthPt,
    height: A4.heightPt,
    color: rgb(1, 1, 1),
  })
  page.drawText("Origin is not zero", {
    x: 50 + 48,
    y: 60 + A4.heightPt - 64,
    size: 18,
    font: bold,
  })
  return doc.save()
}

const PARAGRAPH =
  "Bahawa defendan telah memfailkan afidavit jawapan pada tarikh yang ditetapkan oleh mahkamah. " +
  "The plaintiff submits that the learned judge erred in law and in fact when holding that the " +
  "agreement was binding upon both parties, having regard to the evidence adduced at the trial. "

function lines(
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  width: number,
  size: number
) {
  const words = PARAGRAPH.repeat(6).split(" ")
  const out: string[] = []
  let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width) {
      out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

/**
 * A full page of body text. `textRotate` draws the text itself rotated
 * (anticlockwise, as PDF content does) without touching /Rotate.
 */
export async function bodyTextPdf(
  options: {
    landscape?: boolean
    textRotate?: 0 | 90 | 180 | 270
    pageRotate?: 0 | 90 | 180 | 270
  } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font } = await fonts(doc)
  const [w, h] = options.landscape ? SIZE.a4Landscape : SIZE.a4Portrait
  const page = doc.addPage([w, h])
  const rot = options.textRotate ?? 0
  // Lay the text out in a box whose long side follows the text direction.
  const boxW = rot === 90 || rot === 270 ? h : w
  const boxH = rot === 90 || rot === 270 ? w : h
  const size = 11
  const rows = lines(font, boxW - 120, size).slice(
    0,
    Math.floor((boxH - 120) / 16)
  )
  rows.forEach((text, i) => {
    // Position in the unrotated box, then map into page space.
    const bx = 60
    const by = boxH - 70 - i * 16
    let x = bx
    let y = by
    if (rot === 90) {
      x = w - by
      y = bx
    } else if (rot === 180) {
      x = w - bx
      y = h - by
    } else if (rot === 270) {
      x = by
      y = h - bx
    }
    page.drawText(text, { x, y, size, font, rotate: degrees(rot) })
  })
  if (options.pageRotate) page.setRotation(degrees(options.pageRotate))
  return doc.save()
}

/** A printable stamp annotation (filled red square) plus a hidden one. */
export async function annotatedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font } = await fonts(doc)
  const page = doc.addPage(SIZE.a4Portrait)
  page.drawText("Exhibit with stamp", {
    x: 48,
    y: A4.heightPt - 64,
    size: 14,
    font,
  })
  const apRef = doc.context.register(
    doc.context.stream("1 0 0 rg 0 0 100 100 re f", {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 100, 100],
    })
  )
  const visible = doc.context.obj({
    Type: "Annot",
    Subtype: "Stamp",
    Rect: [400, 600, 500, 700],
    F: 4,
    AP: { N: apRef },
  })
  const hidden = doc.context.obj({
    Type: "Annot",
    Subtype: "Stamp",
    Rect: [100, 100, 200, 200],
    F: 4 | 2,
    AP: { N: apRef },
  })
  page.node.set(
    PDFName.of("Annots"),
    doc.context.obj([
      doc.context.register(visible),
      doc.context.register(hidden),
    ])
  )
  return doc.save()
}
