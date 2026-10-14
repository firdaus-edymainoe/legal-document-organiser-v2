import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { addRotation, displayedSize, placementOnA4 } from "../geometry"
import { decideOrientation } from "../orientation/decide"
import { detectImageOrientation, rotateGray } from "../orientation/image"
import { textOrientation } from "../orientation/text"
import { composeSheets } from "../pdflib/compose"
import { probeSource } from "../pdflib/probe"
import { bindingRotation, isLandscape } from "../rules"
import { A4, type Rotation, type SheetSpec } from "../types"
import { compareRenders, vectorCopyFailed } from "../verify"
import { crc32, zip } from "../zip"
import {
  annotatedPdf,
  bodyTextPdf,
  encryptedPdf,
  landscapeUprightPdf,
  letterMediaA4CropPdf,
  letterPortraitPdf,
  originShiftedCropPdf,
  portraitA4Pdf,
  rotate180Pdf,
  rotate270LandscapePdf,
  rotate90PortraitPdf,
} from "./fixtures"
import {
  closePdf,
  openPdf,
  pageStrings,
  pageText,
  renderGray,
  renderRgbAt,
} from "./node-pdfjs"

const ANGLES: Rotation[] = [0, 90, 180, 270]

describe("binding rule", () => {
  it("always yields a portrait sheet with upright or spine-up content", () => {
    for (const [w, h] of [
      [595, 842],
      [842, 595],
      [612, 792],
      [1000, 400],
    ]) {
      for (const visible of ANGLES) {
        const extra = bindingRotation(w, h, visible)
        const sheet = displayedSize(w, h, extra)
        expect(sheet.height, `${w}x${h}@${visible}`).toBeGreaterThanOrEqual(
          sheet.width
        )
        const final = addRotation(visible, extra)
        // Content's own shape once upright:
        const upright = displayedSize(w, h, addRotation(0, 360 - visible))
        const expected = isLandscape(upright.width, upright.height) ? 270 : 0
        expect(final, `${w}x${h}@${visible}`).toBe(expected)
      }
    }
  })

  it("leaves an upright portrait page alone and turns landscape anticlockwise", () => {
    expect(bindingRotation(595, 842, 0)).toBe(0)
    expect(bindingRotation(842, 595, 0)).toBe(270)
    // Already filed spine-up: nothing to do.
    expect(bindingRotation(595, 842, 270)).toBe(0)
    // Landscape content turned the wrong way on a portrait sheet: flip it.
    expect(bindingRotation(595, 842, 90)).toBe(180)
    expect(bindingRotation(595, 842, 180)).toBe(180)
  })
})

describe("placement", () => {
  it("fits and centres every rotation inside A4", () => {
    for (const rotate of ANGLES) {
      const p = placementOnA4(612, 792, rotate)
      const bound = displayedSize(p.width, p.height, rotate)
      expect(bound.width).toBeLessThanOrEqual(A4.widthPt + 0.01)
      expect(bound.height).toBeLessThanOrEqual(A4.heightPt + 0.01)
    }
  })
})

describe("text orientation", () => {
  it("ignores e-filing stamps and page numbers", () => {
    const upright = [1, 0, 0, 1, 0, 0]
    const sideways = [0, 1, -1, 0, 0, 0] // 90° anticlockwise in content space
    const result = textOrientation(
      [
        { str: "S/N 3KA4pPVhQUS4dOWDILEU9Q", transform: upright },
        {
          str: "**Note : Serial number will be used to verify the originality",
          transform: upright,
        },
        { str: "40", transform: upright },
        { str: "Lot 12 Lot 13 Lot 14 Lot 15", transform: sideways },
      ],
      0
    )
    expect(result.angle).toBe(270)
    expect(result.chars).toBe(20)
  })

  it("accounts for /Rotate", () => {
    const r = textOrientation(
      [{ str: "Hello world", transform: [1, 0, 0, 1, 0, 0] }],
      90
    )
    expect(r.angle).toBe(90)
  })
})

describe("decision", () => {
  const strongText = { angle: 0 as Rotation, chars: 900, share: 1 }
  const noText = { angle: null, chars: 0, share: 0 }
  const img = (angle: Rotation, flip = 0.9, axis = 0.8) => ({
    angle,
    flipConfidence: flip,
    axisConfidence: axis,
    glyphs: 500,
    votes: 100,
  })

  it("trusts a full text layer", () => {
    expect(decideOrientation(strongText, img(180))).toMatchObject({
      method: "text",
      angle: 0,
    })
  })
  it("uses the image when there is no text", () => {
    expect(decideOrientation(noText, img(90))).toMatchObject({
      method: "image",
      angle: 90,
      review: false,
    })
  })
  it("keeps the page and asks for review when unsure", () => {
    expect(decideOrientation(noText, img(180, 0.3))).toMatchObject({
      angle: null,
      review: true,
    })
    expect(decideOrientation(noText, img(0, 0.3))).toMatchObject({
      angle: null,
      review: false,
    })
  })
})

async function outputAngle(bytes: Uint8Array) {
  const doc = await openPdf(bytes)
  try {
    return (await pageText(doc, 1)).angle
  } finally {
    await closePdf(doc)
  }
}

async function normalise(bytes: Uint8Array, extra?: Rotation) {
  const probe = await probeSource(bytes)
  const doc = await openPdf(bytes)
  const text = await pageText(doc, 1)
  await closePdf(doc)
  const page = probe.pages[0]
  const rotate =
    extra ??
    bindingRotation(page.displayedWidth, page.displayedHeight, text.angle)
  const sheets: SheetSpec[] = [
    {
      content: { kind: "vector", sourceId: "s", pageIndex: 0 },
      rotate,
      color: null,
      number: null,
    },
  ]
  const out = await composeSheets({
    sources: { s: bytes },
    sheets,
    numberSize: "medium",
  })
  return { out, probe, text, rotate }
}

async function assertA4(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  for (const page of doc.getPages()) {
    expect(page.getRotation().angle).toBe(0)
    const media = page.getMediaBox()
    expect(media.width).toBeCloseTo(A4.widthPt, 1)
    expect(media.height).toBeCloseTo(A4.heightPt, 1)
  }
}

describe("compose (vector)", () => {
  const cases: [string, () => Promise<Uint8Array>, Rotation][] = [
    ["A4 portrait", portraitA4Pdf, 0],
    ["US Letter", letterPortraitPdf, 0],
    ["CropBox inside a large MediaBox", letterMediaA4CropPdf, 0],
    ["CropBox with shifted origin", originShiftedCropPdf, 0],
    ["/Rotate 180", rotate180Pdf, 0],
    ["/Rotate 90 on portrait", rotate90PortraitPdf, 0],
    ["/Rotate 270 on landscape (already spine-up)", rotate270LandscapePdf, 270],
    ["landscape page, upright text", landscapeUprightPdf, 270],
    [
      "portrait page, text drawn sideways (90° ccw)",
      () => bodyTextPdf({ textRotate: 90 }),
      270,
    ],
    [
      "portrait page, text drawn sideways (90° cw)",
      () => bodyTextPdf({ textRotate: 270 }),
      270,
    ],
    [
      "portrait page, text drawn upside down",
      () => bodyTextPdf({ textRotate: 180 }),
      0,
    ],
    [
      "landscape page, /Rotate 90, upright body",
      () => bodyTextPdf({ landscape: true, pageRotate: 90 }),
      270,
    ],
  ]

  for (const [label, make, expected] of cases) {
    it(`${label} → A4, text at ${expected}°`, async () => {
      const { out } = await normalise(await make())
      await assertA4(out)
      expect(await outputAngle(out)).toBe(expected)
    })
  }

  it("keeps the content inside the sheet (no clipping of the header)", async () => {
    const { out } = await normalise(await rotate270LandscapePdf())
    const doc = await openPdf(out)
    const strings = await pageStrings(doc, 1)
    await closePdf(doc)
    for (const s of strings) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(s.width)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(s.height)
    }
  })

  it("flattens printable annotations and skips hidden ones", async () => {
    const bytes = await annotatedPdf()
    const { out } = await normalise(bytes, 0)
    const doc = await openPdf(out)
    // Visible stamp: Rect 400..500 x 600..700 on an A4 page.
    const inside = await renderRgbAt(
      doc,
      1,
      450 / A4.widthPt,
      1 - 650 / A4.heightPt
    )
    const hiddenSpot = await renderRgbAt(
      doc,
      1,
      150 / A4.widthPt,
      1 - 150 / A4.heightPt
    )
    await closePdf(doc)
    expect(inside[0]).toBeGreaterThan(200)
    expect(inside[1]).toBeLessThan(60)
    expect(hiddenSpot).toEqual([255, 255, 255])
  })

  it("tints with multiply and stamps numbers", async () => {
    const bytes = await portraitA4Pdf()
    const out = await composeSheets({
      sources: { s: bytes },
      sheets: [
        {
          content: { kind: "vector", sourceId: "s", pageIndex: 0 },
          rotate: 0,
          color: "#ffe08a",
          number: 7,
        },
        {
          content: { kind: "tab", label: "TAB-1" },
          rotate: 0,
          color: null,
          number: 8,
        },
        { content: { kind: "blank" }, rotate: 0, color: null, number: null },
      ],
      numberSize: "large",
    })
    await assertA4(out)
    const doc = await openPdf(out)
    const bg = await renderRgbAt(doc, 1, 0.5, 0.6)
    expect(bg[0]).toBeGreaterThan(240)
    expect(bg[2]).toBeLessThan(160)
    const first = await pageStrings(doc, 1)
    const seven = first.find((s) => s.str === "7")
    expect(seven).toBeDefined()
    expect(seven!.x).toBeGreaterThan(seven!.width * 0.8)
    expect(seven!.y).toBeLessThan(seven!.height * 0.12)
    const tab = await pageStrings(doc, 2)
    expect(tab.map((s) => s.str)).toContain("TAB-1")
    expect(tab.map((s) => s.str)).toContain("8")
    expect(await pageStrings(doc, 3)).toEqual([])
    await closePdf(doc)
  })
})

describe("probe", () => {
  it("flags encrypted files for rasterising", async () => {
    const result = await probeSource(await encryptedPdf())
    expect(result.encrypted).toBe(true)
    expect(result.vectorOk).toBe(false)
    expect(result.pageCount).toBe(1)
  })

  it("rejects garbage without throwing", async () => {
    const result = await probeSource(new TextEncoder().encode("not a pdf"))
    expect(result.vectorOk).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it("produces a faithful probe copy", async () => {
    const bytes = await rotate270LandscapePdf()
    const result = await probeSource(bytes)
    expect(result.vectorOk).toBe(true)
    expect(result.pageErrors).toEqual([])
    const a = await openPdf(bytes)
    const b = await openPdf(result.probe!)
    // Compare inside an A4 frame: the original is A4 already, so sizes match.
    const ra = await renderGray(a, 1, 300)
    const rb = await renderGray(b, 1, 300)
    await closePdf(a)
    await closePdf(b)
    expect(vectorCopyFailed(compareRenders(ra, rb))).toBe(false)
  })
})

describe("image orientation", () => {
  it("finds the direction of a scanned-looking page in all four turns", async () => {
    const doc = await openPdf(await bodyTextPdf())
    const gray = await renderGray(doc, 1, 1200)
    await closePdf(doc)
    for (const turn of ANGLES) {
      const result = detectImageOrientation(rotateGray(gray, turn))
      expect(result.angle, `turned ${turn}`).toBe(turn)
      expect(result.flipConfidence).toBeGreaterThan(0.5)
    }
  })

  it("returns nothing for a blank page", () => {
    const blank = {
      width: 400,
      height: 560,
      data: new Uint8Array(400 * 560).fill(255),
    }
    expect(detectImageOrientation(blank).angle).toBeNull()
  })
})

describe("verify", () => {
  it("catches a blank vector copy", () => {
    const ink = new Uint8Array(100).fill(255)
    ink.fill(0, 0, 20)
    const blank = new Uint8Array(100).fill(255)
    const c = compareRenders(
      { width: 10, height: 10, data: ink },
      { width: 10, height: 10, data: blank }
    )
    expect(vectorCopyFailed(c)).toBe(true)
  })
})

describe("zip", () => {
  it("computes standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
  })
  it("writes a readable archive header", () => {
    const out = zip([{ name: "a.pdf", data: new Uint8Array([1, 2, 3]) }])
    expect(Array.from(out.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(Array.from(out.subarray(out.length - 22, out.length - 18))).toEqual([
      0x50, 0x4b, 0x05, 0x06,
    ])
  })
})
