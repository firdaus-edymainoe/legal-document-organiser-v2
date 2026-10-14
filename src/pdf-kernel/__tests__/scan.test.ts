import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { imagePlacements, scanBox, type ImageOps } from "../scan"
import { closePdf, openPdf } from "./node-pdfjs"

const PAGE = { x: 0, y: 0, width: 612, height: 792 }

describe("scanBox", () => {
  it("finds a scan sitting on part of the page", () => {
    const box = scanBox([{ x0: 0, y0: 144, x1: 432, y1: 792 }], PAGE)
    expect(box).toEqual({ x: 0, y: 144, width: 432, height: 648 })
  })

  it("treats tiles of one scan as a single region", () => {
    const box = scanBox(
      [
        { x0: 0, y0: 400, x1: 200, y1: 792 },
        { x0: 200, y0: 400, x1: 432, y1: 792 },
        { x0: 0, y0: 144, x1: 432, y1: 400 },
      ],
      PAGE
    )
    expect(box).toEqual({ x: 0, y: 144, width: 432, height: 648 })
  })

  it("ignores a small logo beside a scan", () => {
    const box = scanBox(
      [
        { x0: 0, y0: 144, x1: 432, y1: 792 },
        { x0: 500, y0: 740, x1: 540, y1: 780 },
      ],
      PAGE
    )
    expect(box).toEqual({ x: 0, y: 144, width: 432, height: 648 })
  })

  it("leaves full-page scans alone", () => {
    expect(scanBox([{ x0: 0, y0: 0, x1: 612, y1: 792 }], PAGE)).toBeNull()
  })

  it("ignores a page with no image, or only a small one", () => {
    expect(scanBox([], PAGE)).toBeNull()
    expect(scanBox([{ x0: 10, y0: 10, x1: 60, y1: 60 }], PAGE)).toBeNull()
  })
})

describe("imagePlacements", () => {
  // Fake operator codes; the real ones come from pdf.js.
  const ops: ImageOps = {
    save: 1,
    restore: 2,
    transform: 3,
    paintFormXObjectBegin: 4,
    paintFormXObjectEnd: 5,
    paintImageXObject: 6,
    paintInlineImageXObject: 7,
    paintImageMaskXObject: 8,
  }

  it("places a unit-square image through the current matrix", () => {
    const placed = imagePlacements(
      [ops.save, ops.transform, ops.paintImageXObject, ops.restore],
      [null, [432, 0, 0, 648, 0, 144], [0], null],
      ops
    )
    expect(placed).toEqual([{ x0: 0, y0: 144, x1: 432, y1: 792 }])
  })

  it("restores the matrix after q/Q", () => {
    const placed = imagePlacements(
      [ops.save, ops.transform, ops.restore, ops.paintImageXObject],
      [null, [100, 0, 0, 100, 0, 0], null, [0]],
      ops
    )
    expect(placed).toEqual([{ x0: 0, y0: 0, x1: 1, y1: 1 }])
  })
})

const SAMPLE = "/Users/m.firdaus98/Desktop/4.pdf"

describe("imagePlacements with clip paths", () => {
  const ops: ImageOps = {
    save: 1,
    restore: 2,
    transform: 3,
    paintFormXObjectBegin: 4,
    paintFormXObjectEnd: 5,
    paintImageXObject: 6,
    paintInlineImageXObject: 7,
    paintImageMaskXObject: 8,
    clip: 9,
    eoClip: 10,
    constructPath: 11,
    endPath: 12,
  }

  it("cuts an image to the clip path that was set before it", () => {
    const placed = imagePlacements(
      [
        ops.save,
        ops.clip,
        ops.constructPath,
        ops.transform,
        ops.paintImageXObject,
        ops.restore,
      ],
      [
        null,
        null,
        [null, null, { 0: 0, 1: 144, 2: 216, 3: 792 }],
        [432, 0, 0, 648, 0, 144],
        [0],
        null,
      ],
      ops
    )
    expect(placed).toEqual([{ x0: 0, y0: 144, x1: 216, y1: 792 }])
  })

  it("drops an image that lies wholly outside the clip", () => {
    const placed = imagePlacements(
      [ops.clip, ops.constructPath, ops.paintImageXObject],
      [null, [null, null, { 0: 0, 1: 0, 2: 100, 3: 100 }], [0]],
      ops
    )
    expect(placed).toEqual([{ x0: 0, y0: 0, x1: 1, y1: 1 }])
    const outside = imagePlacements(
      // Clip first (page space 0..100), then move the image to 500.
      [ops.clip, ops.constructPath, ops.transform, ops.paintImageXObject],
      [
        null,
        [null, null, { 0: 0, 1: 0, 2: 100, 3: 100 }],
        [1, 0, 0, 1, 500, 500],
        [0],
      ],
      ops
    )
    expect(outside).toEqual([])
  })

  it("restores the clip after Q", () => {
    const placed = imagePlacements(
      [
        ops.save,
        ops.clip,
        ops.constructPath,
        ops.restore,
        ops.paintImageXObject,
      ],
      [null, null, [null, null, { 0: 0, 1: 0, 2: 1, 3: 1 }], null, [0]],
      ops
    )
    expect(placed).toEqual([{ x0: 0, y0: 0, x1: 1, y1: 1 }])
  })
})

describe("imagePlacements through forms", () => {
  const ops: ImageOps = {
    save: 1,
    restore: 2,
    transform: 3,
    paintFormXObjectBegin: 4,
    paintFormXObjectEnd: 5,
    paintImageXObject: 6,
    paintInlineImageXObject: 7,
    paintImageMaskXObject: 8,
  }

  it("applies a form's matrix when pdf.js passes it as an index-keyed object", () => {
    const formMatrix = { 0: 864, 1: 0, 2: 0, 3: 1296, 4: 0, 5: 288 }
    const placed = imagePlacements(
      [
        ops.save,
        ops.transform,
        ops.paintFormXObjectBegin,
        ops.paintImageXObject,
        ops.paintFormXObjectEnd,
        ops.restore,
      ],
      [null, [0.5, 0, 0, 0.5, 0, 0], [formMatrix, null], [0], null, null],
      ops
    )
    expect(placed).toEqual([{ x0: 0, y0: 144, x1: 432, y1: 792 }])
  })
})

describe.skipIf(!existsSync(SAMPLE))("real scan file", () => {
  it("finds the scan on every page of 4.pdf", async () => {
    const doc = await openPdf(new Uint8Array(readFileSync(SAMPLE)))
    const pdfjs = await import(
      // Same OPS table the app uses.
      "pdfjs-dist/legacy/build/pdf.mjs"
    )
    const found: unknown[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const { fnArray, argsArray } = await page.getOperatorList()
      const placements = imagePlacements(fnArray, argsArray, pdfjs.OPS)
      found.push(scanBox(placements, { x: 0, y: 0, width: 612, height: 792 }))
    }
    await closePdf(doc)
    expect(found.every((b) => b !== null)).toBe(true)
    expect(found[0]).toEqual({ x: 0, y: 144, width: 432, height: 648 })
  }, 120000)
})
