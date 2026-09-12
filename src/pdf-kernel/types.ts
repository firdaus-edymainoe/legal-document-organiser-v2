export const A4 = {
  widthPt: 595.28,
  heightPt: 841.89,
} as const

export const A4_TOLERANCE_PT = 12

export const STAMP_MARGIN_PT = 24
export const STAMP_SIZE_PT = 12

export type Rotation = 0 | 90 | 180 | 270

export type LandscapePolicy = "letterbox" | "rotate-cw" | "rotate-ccw"

export type PageIssue = "not-a4" | "not-portrait" | "sideways-text"

export type Box = {
  x: number
  y: number
  width: number
  height: number
}

export type PageAnalysis = {
  index: number
  mediaBox: Box
  cropBox: Box
  sourceRotation: Rotation
  displayedWidthPt: number
  displayedHeightPt: number
  /** Dominant text angle in content space, or null when there is no text layer. */
  contentTextAngle: number | null
  /** Content angle plus source /Rotate — what a viewer shows. */
  displayTextAngle: number | null
  issues: PageIssue[]
}

export type AnalyzeResult = {
  pageCount: number
  pages: PageAnalysis[]
}

export type PagePlan = {
  index: number
  /** Extra clockwise rotation on top of source /Rotate, applied when drawing. */
  rotate: Rotation
  landscapePolicy: LandscapePolicy
  color: string | null
  issues: PageIssue[]
  autoFixed: boolean
  userOverride: boolean
}

export type CanonicalDocument = {
  bytes: Uint8Array
  pageCount: number
  imageOnly: boolean
  pages: PagePlan[]
}

export type UnlockResult = {
  bytes: Uint8Array
  bypassApplied: boolean
  reasons: string[]
}

export type ComposeSlot =
  | {
      kind: "cover"
      fileId: string
      fileName: string
      pageIndex: number
    }
  | {
      kind: "tab"
      fileId: string
      fileName: string
      tabNumber: number
    }
  | {
      kind: "body"
      fileId: string
      fileName: string
      pageIndex: number
      tabNumber: number
    }

export type TocRow = {
  tabNumber: number
  startPage: number
  fileName: string
}

export type ComposeSettings = {
  tabDividers: boolean
  pageNumbers: boolean
  startNumber: number
  numberCover: boolean
}

export type ComposeDocument = {
  id: string
  fileName: string
  bytes: Uint8Array
  pageCount: number
}

export type ComposeInput = {
  cover: ComposeDocument | null
  documents: ComposeDocument[]
  settings: ComposeSettings
}

export type ComposePlan = {
  slots: ComposeSlot[]
  toc: TocRow[]
  numberedPageCount: number
}

export type IngestOptions = {
  landscapePolicy: LandscapePolicy
}

export type IngestResult = {
  unlocked: Uint8Array
  bypassApplied: boolean
  reasons: string[]
  analysis: AnalyzeResult
  plans: PagePlan[]
  canonical: Uint8Array
  imageOnly: boolean
}
