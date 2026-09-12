import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib"

const OUT = fileURLToPath(new URL("../test-pdfs/", import.meta.url))

const SIZE = {
  a4Portrait: [595.28, 841.89],
  a4Landscape: [841.89, 595.28],
  letterPortrait: [612, 792],
}

async function newDoc() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  return { doc, font, bold }
}

function paragraph(page, font, x, yStart, lines, size = 12, leading = 18) {
  let y = yStart
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color: rgb(0.1, 0.1, 0.1) })
    y -= leading
  }
}

function addUprightPage(doc, font, bold, size, title, body, rotate = 0) {
  const page = doc.addPage(size)
  const [w, h] = size
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) })
  page.drawText(title, { x: 48, y: h - 64, size: 20, font: bold })
  paragraph(page, font, 48, h - 110, body)
  if (rotate) page.setRotation(degrees(rotate))
  return page
}

async function save(name, doc) {
  const bytes = await doc.save()
  await writeFile(new URL(name, `file://${OUT}`), bytes)
  console.log("wrote", name)
}

async function main() {
  await mkdir(OUT, { recursive: true })

  {
    const { doc, font, bold } = await newDoc()
    addUprightPage(doc, font, bold, SIZE.a4Portrait, "Contract of Sale", [
      "This agreement is made between Party A and Party B.",
    ])
    addUprightPage(doc, font, bold, SIZE.a4Portrait, "Contract (cont.)", [
      "Clause 2: Terms and conditions continue here.",
    ])
    await save("1. Contract.pdf", doc)
  }

  {
    const { doc, font, bold } = await newDoc()
    addUprightPage(doc, font, bold, SIZE.letterPortrait, "Affidavit", [
      "Sworn statement on US Letter paper (612 x 792).",
    ])
    await save("2. Affidavit.pdf", doc)
  }

  {
    const { doc, font, bold } = await newDoc()
    addUprightPage(doc, font, bold, SIZE.a4Portrait, "Witness Statement", [
      "Page 1 is normal A4 portrait.",
    ])
    addUprightPage(doc, font, bold, SIZE.a4Landscape, "Landscape Figure", [
      "This page is landscape (upright text).",
    ])
    await save("3. Witness Statement.pdf", doc)
  }

  {
    const { doc, font, bold } = await newDoc()
    addUprightPage(
      doc,
      font,
      bold,
      SIZE.a4Portrait,
      "Exhibit B2 - Upside Down",
      ["This page is rotated 180 degrees and should be flipped upright."],
      180,
    )
    await save("B2 Exhibit.pdf", doc)
  }

  {
    const { doc, font, bold } = await newDoc()
    addUprightPage(doc, font, bold, SIZE.a4Portrait, "BUNDLE OF AUTHORITIES", [
      "In the matter between Claimant and Respondent.",
    ])
    addUprightPage(doc, font, bold, SIZE.a4Portrait, "Index", [
      "TAB    Start page",
    ])
    await save("cover.pdf", doc)
  }

  console.log("\nAll test PDFs written to", OUT)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
