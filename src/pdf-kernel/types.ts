export const A4 = {
  widthPt: 595.28,
  heightPt: 841.89,
} as const

export type Rotation = 0 | 90 | 180 | 270

export type Box = {
  x: number
  y: number
  width: number
  height: number
}

/** Facts about one source page, as pdf-lib reads it. */
export type SourcePageInfo = {
  index: number
  cropBox: Box
  /** Page /Rotate, clockwise. */
  rotate: Rotation
  /** Size as a viewer displays it (after /Rotate), in points. */
  displayedWidth: number
  displayedHeight: number
}

export type ProbeResult = {
  /** pdf-lib could parse the file and embed its pages as vectors. */
  vectorOk: boolean
  /** The file is encrypted; pdf-lib cannot decrypt it, so pages are rasterised. */
  encrypted: boolean
  pageCount: number
  pages: SourcePageInfo[]
  /** Pages pdf-lib failed to embed. Rasterised instead. */
  pageErrors: number[]
  /**
   * Every page embedded onto A4 with no extra rotation, used to check that the
   * vector copy draws the same thing pdf.js draws for the original.
   */
  probe: Uint8Array | null
  error?: string
}

/** What goes on one output sheet. */
export type SheetContent =
  | {
      kind: "vector"
      sourceId: string
      pageIndex: number
      /** Only this part of the page is drawn (a scan), in page coordinates. */
      crop?: Box | null
    }
  | {
      kind: "raster"
      /** JPEG of the page exactly as a viewer displays it (after /Rotate). */
      image: Uint8Array
      widthPx: number
      heightPx: number
    }
  | { kind: "blank" }
  | { kind: "tab"; label: string }

export type SheetSpec = {
  content: SheetContent
  /**
   * Extra clockwise rotation applied to the page *as displayed*. The kernel
   * adds the source /Rotate itself for vector pages.
   */
  rotate: Rotation
  /** Page colour (#rrggbb), multiplied over the sheet so scans tint too. */
  color: string | null
  /** Page number to stamp, or null. */
  number: number | null
}

export type NumberSize = "small" | "medium" | "large"

export type ComposeRequest = {
  sources: Record<string, Uint8Array>
  sheets: SheetSpec[]
  numberSize: NumberSize
  title?: string
}
