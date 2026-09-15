import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { A4 } from "../types"
import { composePdf, ingestPdf } from "../index"
import { assertUprightAgainstSource, orientationVerdict, pageBands } from "./orientation"

const SAMPLE_DIR =
  process.env.SAMPLE_DIR ??
  "/Users/m.firdaus98/Downloads/New Folder With Items"

const SMALL = [
  "1. Notis Usul(Kebenaran Untuk Merayu)(LSK) +@003.pdf",
  "5. L2052(A).Low Shiow Kian - AFIDAVIT JAWAPAN RESPONDEN PERTAMA 1 +@002.pdf",
  "9. b-08-352-11-2025 +@002.pdf",
  "14. Notis Makluman Butiran Pihak Pemohon (LSK) +@002.pdf",
  "15. Notis Butiran R2 - Kwan +@002.pdf",
  "18. 20260604 surat +@002.pdf",
]

const MEDIUM = ["11. Ikatan Khas (LSK) +@002.pdf"]

async function loadNamed(name: string): Promise<{ name: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await readFile(path.join(SAMPLE_DIR, name)))
  return { name, bytes }
}

async function assertCanonical(bytes: Uint8Array, label: string) {
  const doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount(), `${label} page count`).toBeGreaterThan(0)
  for (const [i, page] of doc.getPages().entries()) {
    const crop = page.getCropBox()
    const media = page.getMediaBox()
    expect(page.getRotation().angle, `${label} p${i} rotate`).toBe(0)
    expect(crop.x, `${label} p${i} crop.x`).toBeCloseTo(0, 4)
    expect(crop.y, `${label} p${i} crop.y`).toBeCloseTo(0, 4)
    expect(crop.width, `${label} p${i} crop.w`).toBeCloseTo(A4.widthPt, 1)
    expect(crop.height, `${label} p${i} crop.h`).toBeCloseTo(A4.heightPt, 1)
    expect(media.width, `${label} p${i} media.w`).toBeCloseTo(A4.widthPt, 1)
    expect(media.height, `${label} p${i} media.h`).toBeCloseTo(A4.heightPt, 1)
  }
}

describe("real sample PDFs", () => {
  it("lists the sample folder", async () => {
    const names = await readdir(SAMPLE_DIR)
    const pdfs = names.filter((n) => n.toLowerCase().endsWith(".pdf"))
    expect(pdfs.length).toBeGreaterThanOrEqual(20)
  })

  it(
    "ingests A4, letter, and /Rotate 270 files onto portrait A4",
    async () => {
      const results = []
      for (const name of SMALL) {
        const file = await loadNamed(name)
        const started = Date.now()
        const ingested = await ingestPdf(file.bytes, { landscapePolicy: "letterbox" })
        console.log(
          `ingest ${name} → ${ingested.analysis.pageCount}p auto=${ingested.plans.filter((p) => p.autoFixed).length} ${Date.now() - started}ms imageOnly=${ingested.imageOnly} bypass=${ingested.bypassApplied}`,
        )
        expect(ingested.imageOnly).toBe(false)
        await assertCanonical(ingested.canonical, name)
        await assertUprightAgainstSource(file.bytes, ingested.canonical, name)
        results.push({ name, ingested })
      }

      const landscape = results.find((r) => r.name.startsWith("15."))
      expect(landscape?.ingested.analysis.pages[0]?.sourceRotation).toBe(270)
      expect(landscape?.ingested.plans[0]?.rotate).toBe(0)

      const affidavit = results.find((r) => r.name.startsWith("5."))
      expect(affidavit?.ingested.analysis.pages[0]?.sourceRotation).toBe(270)
      expect(affidavit?.ingested.plans[0]?.rotate).toBe(0)

      const letter = results.find((r) => r.name.startsWith("9."))
      expect(letter?.ingested.analysis.pages[0]?.issues).toContain("not-a4")
      expect(letter?.ingested.plans[0]?.autoFixed).toBe(true)
    },
    180_000,
  )

  it(
    "composes Combine and Bundle from the small sample set",
    async () => {
      const docs = []
      for (const name of SMALL) {
        const file = await loadNamed(name)
        const ingested = await ingestPdf(file.bytes, { landscapePolicy: "rotate-ccw" })
        docs.push({
          id: name,
          fileName: name,
          bytes: ingested.canonical,
          pageCount: ingested.analysis.pageCount,
        })
      }

      const combined = await composePdf({
        cover: null,
        documents: docs,
        settings: {
          tabDividers: false,
          pageNumbers: true,
          startNumber: 1,
          numberCover: false,
        },
      })
      await assertCanonical(combined, "combine")
      const combinedDoc = await PDFDocument.load(combined)
      const expectedPages = docs.reduce((n, d) => n + d.pageCount, 0)
      expect(combinedDoc.getPageCount()).toBe(expectedPages)

      const [cover, ...body] = docs
      const bundled = await composePdf({
        cover,
        documents: body,
        settings: {
          tabDividers: true,
          pageNumbers: true,
          startNumber: 1,
          numberCover: false,
        },
      })
      await assertCanonical(bundled, "bundle")
      const bundledDoc = await PDFDocument.load(bundled)
      const expectedBundle =
        cover.pageCount + body.reduce((n, d) => n + 1 + d.pageCount, 0)
      expect(bundledDoc.getPageCount()).toBe(expectedBundle)
    },
    180_000,
  )

  it(
    "ingests a 35-page letter Ikatan Khas",
    async () => {
      const file = await loadNamed(MEDIUM[0])
      const ingested = await ingestPdf(file.bytes, { landscapePolicy: "letterbox" })
      expect(ingested.analysis.pageCount).toBe(35)
      await assertCanonical(ingested.canonical, MEDIUM[0])
    },
    180_000,
  )

  it(
    "ingests a 67-page A4 submission and a 227-page landscape authorities bundle",
    async () => {
      const submission = await loadNamed(
        "21. 22519802(A).Low Shiow Kian - Hujahan Bertulis Responden Pertama.FINAL +@002.pdf",
      )
      const authorities = await loadNamed(
        "20. Ikatan Otoriti R2 - Kwan Yew Teck +@002.pdf",
      )
      const a = await ingestPdf(submission.bytes, { landscapePolicy: "letterbox" })
      expect(a.analysis.pageCount).toBe(67)
      await assertCanonical(a.canonical, submission.name)

      const b = await ingestPdf(authorities.bytes, { landscapePolicy: "rotate-ccw" })
      expect(b.analysis.pageCount).toBe(227)
      expect(b.analysis.pages[0]?.sourceRotation).toBe(270)
      await assertCanonical(b.canonical, authorities.name)
      expect(
        orientationVerdict(await pageBands(authorities.bytes), await pageBands(b.canonical)),
        "authorities p1",
      ).not.toBe("UPSIDE")
    },
    300_000,
  )
})
