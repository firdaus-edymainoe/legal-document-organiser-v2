import { PDFDocument, StandardFonts } from "pdf-lib"

import { A4, type ComposeInput, type ComposePlan, type ComposeSlot, type TocRow } from "./types"
import { SAVE_OPTIONS, loadPdfForEditing } from "./unlock"
import { stampPageNumber } from "./stamp"

export function buildComposePlan(input: ComposeInput): ComposePlan {
  const slots: ComposeSlot[] = []

  if (input.cover) {
    for (let pageIndex = 0; pageIndex < input.cover.pageCount; pageIndex++) {
      slots.push({
        kind: "cover",
        fileId: input.cover.id,
        fileName: input.cover.fileName,
        pageIndex,
      })
    }
  }

  input.documents.forEach((doc, index) => {
    const tabNumber = index + 1
    if (input.settings.tabDividers) {
      slots.push({
        kind: "tab",
        fileId: doc.id,
        fileName: doc.fileName,
        tabNumber,
      })
    }
    for (let pageIndex = 0; pageIndex < doc.pageCount; pageIndex++) {
      slots.push({
        kind: "body",
        fileId: doc.id,
        fileName: doc.fileName,
        pageIndex,
        tabNumber,
      })
    }
  })

  const toc: TocRow[] = []
  let numbered = 0
  for (const slot of slots) {
    const counts = slotCountsTowardNumbers(slot, input.settings.numberCover)
    if (slot.kind === "body") {
      const already = toc.some((row) => row.tabNumber === slot.tabNumber)
      if (!already) {
        toc.push({
          tabNumber: slot.tabNumber,
          startPage: numbered + (counts ? 1 : 0),
          fileName: slot.fileName,
        })
      }
    }
    if (counts) numbered += 1
  }

  return { slots, toc, numberedPageCount: numbered }
}

function slotCountsTowardNumbers(
  slot: ComposeSlot,
  numberCover: boolean,
): boolean {
  if (slot.kind === "cover") return numberCover
  return true
}

export async function composePdf(input: ComposeInput): Promise<Uint8Array> {
  const plan = buildComposePlan(input)
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)
  const bold = await out.embedFont(StandardFonts.HelveticaBold)

  const loaded = new Map<string, Awaited<ReturnType<typeof loadPdfForEditing>>>()
  const load = async (id: string, bytes: Uint8Array) => {
    const existing = loaded.get(id)
    if (existing) return existing
    const doc = await loadPdfForEditing(bytes)
    loaded.set(id, doc)
    return doc
  }

  if (input.cover) await load(input.cover.id, input.cover.bytes)
  for (const doc of input.documents) {
    if (doc.pageCount < 1) {
      throw new Error(`Document "${doc.fileName}" has no pages`)
    }
    const loadedDoc = await load(doc.id, doc.bytes)
    if (loadedDoc.getPageCount() < doc.pageCount) {
      throw new Error(`Missing bytes for "${doc.fileName}"`)
    }
  }

  let number = input.settings.startNumber
  for (const slot of plan.slots) {
    if (slot.kind === "tab") {
      const page = out.addPage([A4.widthPt, A4.heightPt])
      const label = `TAB-${slot.tabNumber}`
      const size = 48
      const width = bold.widthOfTextAtSize(label, size)
      page.drawText(label, {
        x: (A4.widthPt - width) / 2,
        y: A4.heightPt / 2 - size / 2,
        size,
        font: bold,
      })
      if (input.settings.pageNumbers) {
        stampPageNumber(page, number, font)
        number += 1
      }
      continue
    }

    const source =
      slot.kind === "cover"
        ? input.cover
        : input.documents.find((doc) => doc.id === slot.fileId)
    if (!source) {
      throw new Error(`Missing bytes for ${slot.kind} "${slot.fileName}"`)
    }
    const srcDoc = await load(source.id, source.bytes)
    const srcPage = srcDoc.getPage(slot.pageIndex)
    if (!srcPage) {
      throw new Error(`Missing page ${slot.pageIndex} in "${slot.fileName}"`)
    }
    const [copied] = await out.copyPages(srcDoc, [slot.pageIndex])
    out.addPage(copied)
    const page = out.getPage(out.getPageCount() - 1)
    const counts = slotCountsTowardNumbers(slot, input.settings.numberCover)
    if (input.settings.pageNumbers && counts) {
      stampPageNumber(page, number, font)
      number += 1
    }
  }

  return out.save(SAVE_OPTIONS)
}

export function tocAsWordText(toc: TocRow[]): string {
  const header = "Tab\tAuthority\tPage"
  const rows = toc.map((row) => `${row.tabNumber}\t${row.fileName}\t${row.startPage}`)
  return [header, ...rows].join("\r\n")
}
