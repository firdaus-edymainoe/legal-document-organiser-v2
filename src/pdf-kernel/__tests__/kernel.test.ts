import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { A4, STAMP_MARGIN_PT } from "../types"
import { analyzePdf } from "../analyze"
import { planDocument } from "../plan"
import { normalizeDocument } from "../normalize"
import { stampPageNumber } from "../stamp"
import { ingestPdf } from "../ingest"
import { buildComposePlan, composePdf } from "../compose"
import {
  encryptedPdf,
  landscapeUprightPdf,
  letterMediaA4CropPdf,
  letterPortraitPdf,
  originShiftedCropPdf,
  portraitA4Pdf,
  rotate180Pdf,
} from "./fixtures"

async function assertCanonical(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  for (const page of doc.getPages()) {
    const crop = page.getCropBox()
    const media = page.getMediaBox()
    expect(page.getRotation().angle).toBe(0)
    expect(crop.x).toBeCloseTo(0, 5)
    expect(crop.y).toBeCloseTo(0, 5)
    expect(crop.width).toBeCloseTo(A4.widthPt, 2)
    expect(crop.height).toBeCloseTo(A4.heightPt, 2)
    expect(media.width).toBeCloseTo(A4.widthPt, 2)
    expect(media.height).toBeCloseTo(A4.heightPt, 2)
  }
}

describe("kernel fixtures", () => {
  it("keeps portrait A4 rotate 0 as identity plan and stamps top-right", async () => {
    const bytes = await portraitA4Pdf()
    const analysis = await analyzePdf(bytes)
    const plans = planDocument(analysis.pages, "letterbox")
    expect(plans[0]?.rotate).toBe(0)
    expect(plans[0]?.autoFixed).toBe(false)

    const canonical = await normalizeDocument(bytes, plans)
    await assertCanonical(canonical)

    const doc = await PDFDocument.load(canonical)
    const page = doc.getPages()[0]
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const rect = stampPageNumber(page, 12, font)
    expect(rect.x + rect.width).toBeLessThanOrEqual(A4.widthPt)
    expect(rect.y + rect.height).toBeLessThanOrEqual(A4.heightPt)
    expect(rect.x).toBeGreaterThan(A4.widthPt - STAMP_MARGIN_PT - 40)
    expect(rect.y).toBeGreaterThan(A4.heightPt - STAMP_MARGIN_PT - 40)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
  })

  it("uses CropBox, not MediaBox, when they differ", async () => {
    const bytes = await letterMediaA4CropPdf()
    const analysis = await analyzePdf(bytes)
    const page = analysis.pages[0]
    expect(page).toBeDefined()
    expect(page.cropBox.width).toBeCloseTo(A4.widthPt, 2)
    expect(page.cropBox.height).toBeCloseTo(A4.heightPt, 2)
    expect(page.mediaBox.width).toBeGreaterThan(page.cropBox.width + 10)
    expect(page.issues.includes("not-a4")).toBe(false)

    const canonical = await normalizeDocument(
      bytes,
      planDocument(analysis.pages, "letterbox"),
    )
    await assertCanonical(canonical)
  })

  it("flattens /Rotate 180 onto rotate 0", async () => {
    const bytes = await rotate180Pdf()
    const analysis = await analyzePdf(bytes)
    expect(analysis.pages[0]?.sourceRotation).toBe(180)
    const canonical = await normalizeDocument(
      bytes,
      planDocument(analysis.pages, "letterbox"),
    )
    await assertCanonical(canonical)
  })

  it("letterboxes landscape upright text into portrait A4", async () => {
    const bytes = await landscapeUprightPdf()
    const ingested = await ingestPdf(bytes, { landscapePolicy: "letterbox" })
    expect(ingested.plans[0]?.rotate).toBe(0)
    await assertCanonical(ingested.canonical)
  })

  it("rotates landscape CCW onto portrait A4 without a leftover 270 on portrait", async () => {
    const bytes = await landscapeUprightPdf()
    const ingested = await ingestPdf(bytes, { landscapePolicy: "rotate-ccw" })
    expect(ingested.plans[0]?.rotate).toBe(270)
    await assertCanonical(ingested.canonical)

    const portrait = await ingestPdf(await portraitA4Pdf(), {
      landscapePolicy: "rotate-ccw",
    })
    expect(portrait.plans[0]?.rotate).toBe(0)
  })

  it("unlocks an encrypted PDF without rasterising", async () => {
    const bytes = await encryptedPdf()
    const ingested = await ingestPdf(bytes, { landscapePolicy: "letterbox" })
    expect(ingested.imageOnly).toBe(false)
    expect(ingested.bypassApplied).toBe(true)
    expect(ingested.reasons).toContain("encryption")
    await assertCanonical(ingested.canonical)
  })

  it("normalises a CropBox whose origin is not zero", async () => {
    const bytes = await originShiftedCropPdf()
    const ingested = await ingestPdf(bytes, { landscapePolicy: "letterbox" })
    await assertCanonical(ingested.canonical)
  })

  it("scales letter paper onto A4", async () => {
    const bytes = await letterPortraitPdf()
    const ingested = await ingestPdf(bytes, { landscapePolicy: "letterbox" })
    expect(ingested.analysis.pages[0]?.issues).toContain("not-a4")
    expect(ingested.plans[0]?.autoFixed).toBe(true)
    await assertCanonical(ingested.canonical)
  })

  it("composes numbered pages from canonical bytes without dropping files", async () => {
    const first = await ingestPdf(await portraitA4Pdf(), { landscapePolicy: "letterbox" })
    const second = await ingestPdf(await letterPortraitPdf(), { landscapePolicy: "letterbox" })
    const bytes = await composePdf({
      cover: null,
      documents: [
        { id: "a", fileName: "1. Contract.pdf", bytes: first.canonical, pageCount: first.analysis.pageCount },
        { id: "b", fileName: "2. Affidavit.pdf", bytes: second.canonical, pageCount: second.analysis.pageCount },
      ],
      settings: {
        tabDividers: true,
        pageNumbers: true,
        startNumber: 1,
        numberCover: false,
      },
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(4)
    await assertCanonical(bytes)
  })

  it("builds TOC from the same slot list as compose", () => {
    const plan = buildComposePlan({
      cover: { id: "c", fileName: "cover.pdf", bytes: new Uint8Array(), pageCount: 2 },
      documents: [
        { id: "a", fileName: "1. Contract.pdf", bytes: new Uint8Array(), pageCount: 2 },
        { id: "b", fileName: "2. Affidavit.pdf", bytes: new Uint8Array(), pageCount: 1 },
      ],
      settings: {
        tabDividers: true,
        pageNumbers: true,
        startNumber: 1,
        numberCover: false,
      },
    })
    expect(plan.toc).toEqual([
      { tabNumber: 1, startPage: 2, fileName: "1. Contract.pdf" },
      { tabNumber: 2, startPage: 5, fileName: "2. Affidavit.pdf" },
    ])
    expect(plan.numberedPageCount).toBe(5)
  })
})

describe("stamp knockout", () => {
  it("draws a white pad that stays inside the A4 crop", async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([A4.widthPt, A4.heightPt])
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4.widthPt,
      height: A4.heightPt,
      color: rgb(0.1, 0.1, 0.1),
    })
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const rect = stampPageNumber(page, 1, font)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(A4.widthPt)
    expect(rect.y + rect.height).toBeLessThanOrEqual(A4.heightPt)
  })
})
