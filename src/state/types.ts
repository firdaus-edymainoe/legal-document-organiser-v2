import type { NumberSize, Rotation } from "@/pdf-kernel"
import type { SourceAnalysis } from "@/engine/analyze"

export type Tool = "bundle" | "fixer"

export type SourceStatus = "queued" | "analyzing" | "ready" | "error" | "locked"

export type SourceRecord = {
  id: string
  fileName: string
  size: number
  status: SourceStatus
  progress: number
  error?: string
  analysis?: SourceAnalysis
}

export type PageItem = {
  id: string
  kind: "page" | "blank"
  sourceId?: string
  pageIndex?: number
  /** Extra clockwise turn the user added on top of auto-fix. */
  turn: Rotation
  color: string | null
  /** User asked for this page to be rasterised. */
  forceRaster: boolean
  /** User confirmed a page flagged for review is fine as is. */
  checked?: boolean
}

export type DocRole = "cover" | "document"

export type DocRecord = {
  id: string
  /** Title used in the index; defaults to the file name. */
  title: string
  fileName: string
  role: DocRole
  sourceId: string
  items: PageItem[]
}

export type BundleSettings = {
  tabSheets: boolean
  tabLabel: string
  numberPages: boolean
  numberCover: boolean
  startNumber: number
  numberSize: NumberSize
  fileName: string
}

export type FixerSettings = {
  numberPages: boolean
  startNumber: number
  numberSize: NumberSize
  output: "merged" | "separate"
  fileName: string
}

export type Workspace<S> = {
  docs: DocRecord[]
  settings: S
}

export type Workspaces = {
  bundle: Workspace<BundleSettings>
  fixer: Workspace<FixerSettings>
}

export const DEFAULT_BUNDLE: BundleSettings = {
  tabSheets: true,
  tabLabel: "TAB-{n}",
  numberPages: true,
  numberCover: true,
  startNumber: 1,
  numberSize: "large",
  fileName: "Bundle of Authorities",
}

export const DEFAULT_FIXER: FixerSettings = {
  numberPages: false,
  startNumber: 1,
  numberSize: "large",
  output: "merged",
  fileName: "Combined",
}

export type PageFlag =
  | "review"
  | "rotated"
  | "autofixed"
  | "scaled"
  | "raster"
  | "edited"
  | "pending"
