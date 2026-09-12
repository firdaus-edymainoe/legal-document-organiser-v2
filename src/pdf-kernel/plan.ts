import type { LandscapePolicy, PageAnalysis, PageIssue, PagePlan, Rotation } from "./types"
import {
  addRotation,
  displayedSize,
  isA4Size,
  isPortrait,
  normalizeRotation,
} from "./geometry"

function issuesFor(
  displayedWidth: number,
  displayedHeight: number,
  displayTextAngle: number | null,
): PageIssue[] {
  const issues: PageIssue[] = []
  if (!isA4Size(displayedWidth, displayedHeight)) issues.push("not-a4")
  if (!isPortrait(displayedWidth, displayedHeight)) issues.push("not-portrait")
  if (displayTextAngle === 90 || displayTextAngle === 270) {
    issues.push("sideways-text")
  }
  return issues
}

function extraToUprightText(displayTextAngle: number): Rotation {
  if (displayTextAngle === 180) return 180
  if (displayTextAngle === 90) return 270
  if (displayTextAngle === 270) return 90
  return 0
}

/**
 * Plan one page. Text is made upright first; remaining landscape sheets
 * then follow the job-level landscape policy. Output /Rotate is never used —
 * `rotate` is extra clockwise draw rotation on top of the source flag.
 */
export function planPage(
  analysis: PageAnalysis,
  landscapePolicy: LandscapePolicy,
  userExtraRotate: Rotation = 0,
): PagePlan {
  let extra: Rotation = 0

  if (analysis.displayTextAngle !== null) {
    extra = extraToUprightText(analysis.displayTextAngle)
  }

  const afterText = displayedSize(
    analysis.displayedWidthPt,
    analysis.displayedHeightPt,
    extra,
  )

  if (!isPortrait(afterText.width, afterText.height)) {
    if (landscapePolicy === "rotate-cw") extra = addRotation(extra, 90)
    else if (landscapePolicy === "rotate-ccw") extra = addRotation(extra, 270)
  }

  extra = addRotation(extra, userExtraRotate)

  const originShifted = analysis.cropBox.x !== 0 || analysis.cropBox.y !== 0
  const cropDiffers =
    Math.abs(analysis.cropBox.width - analysis.mediaBox.width) > 0.5 ||
    Math.abs(analysis.cropBox.height - analysis.mediaBox.height) > 0.5
  const autoFixed =
    analysis.issues.length > 0 ||
    analysis.sourceRotation !== 0 ||
    extra !== 0 ||
    originShifted ||
    cropDiffers ||
    userExtraRotate !== 0

  return {
    index: analysis.index,
    rotate: extra,
    landscapePolicy,
    color: null,
    issues: analysis.issues,
    autoFixed,
    userOverride: userExtraRotate !== 0,
  }
}

export function planDocument(
  pages: PageAnalysis[],
  landscapePolicy: LandscapePolicy,
  userExtraByPage: ReadonlyMap<number, Rotation> = new Map(),
): PagePlan[] {
  return pages.map((page) =>
    planPage(page, landscapePolicy, userExtraByPage.get(page.index) ?? 0),
  )
}

export { issuesFor, extraToUprightText }

export function classifyIssues(
  displayedWidth: number,
  displayedHeight: number,
  displayTextAngle: number | null,
): PageIssue[] {
  return issuesFor(displayedWidth, displayedHeight, displayTextAngle)
}

export function snapTextAngle(degrees: number): Rotation {
  return normalizeRotation(degrees)
}
