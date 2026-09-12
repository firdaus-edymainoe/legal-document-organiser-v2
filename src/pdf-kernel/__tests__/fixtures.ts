import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib"

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
  page.drawText("Contract of Sale", { x: 48, y: A4.heightPt - 64, size: 20, font: bold })
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
