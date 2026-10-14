/**
 * Orientation check against real filings. Opt-in: point SAMPLE_DIR at a
 * folder of PDFs (it is skipped when the folder is missing).
 *
 *   SAMPLE_DIR=~/Downloads/filings npm test
 *
 * Every sampled page is turned 0/90/180/270 and the detector must either
 * get it right or say it is unsure — never confidently wrong.
 */
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { imageIsConfident } from "../orientation/decide"
import { detectImageOrientation, rotateGray } from "../orientation/image"
import { closePdf, openPdf, pageText, renderGray } from "./node-pdfjs"

const DIR = process.env.SAMPLE_DIR ?? ""
const STEP = Number(process.env.SAMPLE_STEP ?? 9)

describe.skipIf(!DIR || !existsSync(DIR))("real filings", () => {
  it(
    "never confidently mis-reads page direction",
    async () => {
      const names = (await readdir(DIR))
        .filter((n) => n.toLowerCase().endsWith(".pdf"))
        .sort()
      let checked = 0
      let decided = 0
      const wrong: string[] = []
      for (const name of names) {
        const doc = await openPdf(
          new Uint8Array(await readFile(path.join(DIR, name)))
        )
        for (let n = 1; n <= doc.numPages; n += STEP) {
          const text = await pageText(doc, n)
          // Pages with a full text layer give ground truth; others are
          // assumed filed upright (true for court e-filings).
          const truth = text.chars >= 200 && text.share >= 0.9 ? text.angle! : 0
          const gray = await renderGray(doc, n, 1200)
          for (const turn of [0, 90, 180, 270] as const) {
            const result = detectImageOrientation(rotateGray(gray, turn))
            checked += 1
            if (!imageIsConfident(result)) continue
            decided += 1
            const expected = (truth + turn) % 360
            if (result.angle !== expected)
              wrong.push(`${name} p${n} turned ${turn}: got ${result.angle}`)
          }
        }
        await closePdf(doc)
      }
      console.info(
        `orientation: ${decided}/${checked} decided, ${wrong.length} wrong`
      )
      expect(wrong).toEqual([])
    },
    30 * 60_000
  )
})
