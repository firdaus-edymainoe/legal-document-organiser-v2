import { describe, expect, it } from "vitest"

import type { PageAnalysis } from "../types"
import { A4 } from "../types"
import { planPage } from "../plan"

function analysis(partial: Partial<PageAnalysis>): PageAnalysis {
  return {
    index: 0,
    mediaBox: { x: 0, y: 0, width: A4.widthPt, height: A4.heightPt },
    cropBox: { x: 0, y: 0, width: A4.widthPt, height: A4.heightPt },
    sourceRotation: 0,
    displayedWidthPt: A4.widthPt,
    displayedHeightPt: A4.heightPt,
    contentTextAngle: 0,
    displayTextAngle: 0,
    issues: [],
    ...partial,
  }
}

describe("planPage", () => {
  it("is a no-op extra rotate for upright portrait A4", () => {
    const plan = planPage(analysis({}), "letterbox")
    expect(plan.rotate).toBe(0)
    expect(plan.autoFixed).toBe(false)
  })

  it("flips upside-down text with 180 before landscape policy", () => {
    const plan = planPage(
      analysis({
        displayTextAngle: 180,
        contentTextAngle: 180,
        issues: [],
      }),
      "rotate-ccw",
    )
    expect(plan.rotate).toBe(180)
  })

  it("letterboxes landscape upright text without turning it", () => {
    const plan = planPage(
      analysis({
        cropBox: { x: 0, y: 0, width: A4.heightPt, height: A4.widthPt },
        displayedWidthPt: A4.heightPt,
        displayedHeightPt: A4.widthPt,
        displayTextAngle: 0,
        issues: ["not-portrait"],
      }),
      "letterbox",
    )
    expect(plan.rotate).toBe(0)
    expect(plan.autoFixed).toBe(true)
  })

  it("rotates landscape upright text CCW for court bundles", () => {
    const plan = planPage(
      analysis({
        cropBox: { x: 0, y: 0, width: A4.heightPt, height: A4.widthPt },
        displayedWidthPt: A4.heightPt,
        displayedHeightPt: A4.widthPt,
        displayTextAngle: 0,
        issues: ["not-portrait"],
      }),
      "rotate-ccw",
    )
    expect(plan.rotate).toBe(270)
  })

  it("does not apply a leftover 270 on already-upright portrait", () => {
    const plan = planPage(
      analysis({
        sourceRotation: 90,
        displayedWidthPt: A4.widthPt,
        displayedHeightPt: A4.heightPt,
        displayTextAngle: 0,
        contentTextAngle: 90,
      }),
      "rotate-ccw",
    )
    expect(plan.rotate).toBe(0)
  })
})
