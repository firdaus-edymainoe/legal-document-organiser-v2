import type {
  ComposeSettings,
  IngestResult,
  LandscapePolicy,
  PageAnalysis,
  PagePlan,
  Rotation,
} from "@/pdf-kernel"

export type JobMode = "combine" | "bundle"
export type PageView = "original" | "auto" | "manual"
export type DocStatus = "uploading" | "scanning" | "autofixing" | "ready" | "error"
export type DocRole = "cover" | "doc"

export type PageMeta = {
  index: number
  analysis: PageAnalysis
  userExtra: Rotation
  color: string | null
  autoFixed: boolean
  userOverride: boolean
  issues: PageAnalysis["issues"]
}

export type DocRecord = {
  id: string
  fileName: string
  role: DocRole
  pageCount: number
  status: DocStatus
  error?: string
  imageOnly: boolean
  pages: PageMeta[]
  landscapePolicy: LandscapePolicy
}

export type JobSnapshot = {
  mode: JobMode
  docs: DocRecord[]
  selectedDocId: string | null
  selectedPage: number
  autofixEnabled: boolean
  pageView: PageView
  settings: ComposeSettings
  pendingNames: string[]
  updatedAt: number
}

export type { IngestResult, PagePlan }
