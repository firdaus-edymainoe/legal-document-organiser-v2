import { describe, expect, it } from "vitest"

import { A4 } from "../types"
import { cwToCcw, flattenViewerRotation, placementOnA4 } from "../geometry"

describe("placementOnA4", () => {
  it("is identity for portrait A4 with rotate 0", () => {
    const place = placementOnA4(A4.widthPt, A4.heightPt, 0)
    expect(place.scale).toBeCloseTo(1, 6)
    expect(place.rotateCcw).toBe(0)
    expect(place.x).toBeCloseTo(0, 6)
    expect(place.y).toBeCloseTo(0, 6)
    expect(place.width).toBeCloseTo(A4.widthPt, 4)
    expect(place.height).toBeCloseTo(A4.heightPt, 4)
  })

  it("letterboxes landscape content into portrait A4", () => {
    const place = placementOnA4(A4.heightPt, A4.widthPt, 0)
    expect(place.rotateCcw).toBe(0)
    expect(place.width).toBeCloseTo(A4.widthPt, 4)
    expect(place.x).toBeCloseTo(0, 4)
    expect(place.y).toBeGreaterThan(1)
    expect(place.y + place.height).toBeLessThan(A4.heightPt - 1)
  })

  it("turns landscape content with clockwise 90 into a filled portrait", () => {
    const place = placementOnA4(A4.heightPt, A4.widthPt, 90)
    expect(place.rotateCcw).toBe(270)
    expect(place.scale).toBeCloseTo(1, 5)
    expect(place.boundWidth).toBeCloseTo(A4.widthPt, 4)
    expect(place.boundHeight).toBeCloseTo(A4.heightPt, 4)
  })

  it("maps viewer-style clockwise rotation to pdf-lib CCW", () => {
    expect(cwToCcw(0)).toBe(0)
    expect(cwToCcw(90)).toBe(270)
    expect(cwToCcw(180)).toBe(180)
    expect(cwToCcw(270)).toBe(90)
  })

  it("bakes Acrobat /Rotate 270 as 90 CW for pdf-lib drawPage", () => {
    expect(flattenViewerRotation(0)).toBe(0)
    expect(flattenViewerRotation(90)).toBe(270)
    expect(flattenViewerRotation(180)).toBe(180)
    expect(flattenViewerRotation(270)).toBe(90)
  })
})
