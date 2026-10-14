import { A4, addRotation, displayedSize, type Rotation } from "@/pdf-kernel"
import type { PageAnalysis, RasterReason } from "@/engine/analyze"

import type {
  BundleSettings,
  DocRecord,
  FixerSettings,
  PageFlag,
  PageItem,
  SourceRecord,
  Workspace,
} from "./types"

export type ResolvedPage = {
  item: PageItem
  analysis: PageAnalysis | null
  /** Final clockwise turn applied to the page as displayed. */
  rotate: Rotation
  raster: boolean
  rasterReason: RasterReason | "requested" | null
  flags: PageFlag[]
  ready: boolean
}

export const RASTER_REASON_TEXT: Record<RasterReason | "requested", string> = {
  encrypted: "The file is protected, so its pages are copied as images",
  unreadable:
    "The file is damaged or unusual, so its pages are copied as images",
  "embed-failed":
    "This page could not be copied as text and shapes, so it is copied as an image",
  "render-mismatch":
    "A text-and-shapes copy of this page did not match the original, so it is copied as an image",
  requested: "You chose to copy this page as an image",
}

type Sources = Record<string, SourceRecord>

export function resolvePage(item: PageItem, sources: Sources): ResolvedPage {
  if (item.kind === "blank") {
    const flags: PageFlag[] = []
    if (item.color) flags.push("edited")
    return {
      item,
      analysis: null,
      rotate: 0,
      raster: false,
      rasterReason: null,
      flags,
      ready: true,
    }
  }
  const source = item.sourceId ? sources[item.sourceId] : undefined
  const analysis = source?.analysis?.pages[item.pageIndex ?? -1] ?? null
  if (!analysis) {
    return {
      item,
      analysis: null,
      rotate: item.turn,
      raster: item.forceRaster,
      rasterReason: item.forceRaster ? "requested" : null,
      flags: ["pending"],
      ready: false,
    }
  }

  const rotate = addRotation(analysis.autoRotate, item.turn)
  const rasterReason =
    analysis.raster ?? (item.forceRaster ? "requested" : null)
  const flags: PageFlag[] = []
  if (analysis.detection.review && item.turn === 0 && !item.checked)
    flags.push("review")
  if (rotate !== 0 || analysis.rotate !== 0) flags.push("rotated")
  const placed = displayedSize(analysis.width, analysis.height, rotate)
  const isA4 =
    Math.abs(placed.width - A4.widthPt) < 3 &&
    Math.abs(placed.height - A4.heightPt) < 3
  if (!isA4) flags.push("scaled")
  if (rasterReason) flags.push("raster")
  if (item.turn !== 0 || item.color || item.forceRaster) flags.push("edited")

  return {
    item,
    analysis,
    rotate,
    raster: rasterReason !== null,
    rasterReason,
    flags,
    ready: true,
  }
}

export type PlannedSheet =
  | {
      kind: "page"
      sourceId: string
      pageIndex: number
      rotate: Rotation
      color: string | null
      raster: boolean
      number: number | null
    }
  | { kind: "blank"; color: string | null; number: number | null }
  | { kind: "tab"; label: string; number: number | null }

export type IndexRow = {
  docId: string
  tab: number
  title: string
  page: number | null
}

export type PlannedFile = { name: string; sheets: PlannedSheet[] }

export function tabLabel(template: string, n: number): string {
  const trimmed = template.trim() || "TAB-{n}"
  return trimmed.includes("{n}")
    ? trimmed.split("{n}").join(String(n))
    : `${trimmed} ${n}`
}

export function safeFileName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return `${cleaned || fallback}.pdf`
}

function sheetFor(page: ResolvedPage, number: number | null): PlannedSheet {
  if (page.item.kind === "blank")
    return { kind: "blank", color: page.item.color, number }
  return {
    kind: "page",
    sourceId: page.item.sourceId!,
    pageIndex: page.item.pageIndex!,
    rotate: page.rotate,
    color: page.item.color,
    raster: page.raster,
    number,
  }
}

export type PlanProblem = { docId: string; message: string }

function problemsFor(docs: DocRecord[], sources: Sources): PlanProblem[] {
  const problems: PlanProblem[] = []
  for (const doc of docs) {
    if (doc.items.length === 0) {
      problems.push({ docId: doc.id, message: `"${doc.title}" has no pages` })
      continue
    }
    const ids = new Set(
      doc.items.map((item) => item.sourceId).filter(Boolean) as string[]
    )
    for (const id of ids) {
      const source = sources[id]
      if (!source)
        problems.push({
          docId: doc.id,
          message: `"${doc.title}" is missing a file`,
        })
      else if (source.status === "error")
        problems.push({
          docId: doc.id,
          message: `"${doc.title}" could not be read`,
        })
      else if (source.status === "locked")
        problems.push({
          docId: doc.id,
          message: `"${doc.title}" needs its password`,
        })
      else if (source.status !== "ready")
        problems.push({
          docId: doc.id,
          message: `"${doc.title}" is still being checked`,
        })
    }
  }
  return problems
}

export function planBundle(
  workspace: Workspace<BundleSettings>,
  sources: Sources
): { file: PlannedFile; index: IndexRow[]; problems: PlanProblem[] } {
  const s = workspace.settings
  const cover = workspace.docs.find((doc) => doc.role === "cover") ?? null
  const documents = workspace.docs.filter((doc) => doc.role === "document")
  const problems = problemsFor(workspace.docs, sources)
  if (documents.length === 0)
    problems.push({ docId: "", message: "Add at least one authority" })

  const sheets: PlannedSheet[] = []
  const index: IndexRow[] = []
  let next = s.startNumber
  const take = (numbered: boolean) => {
    if (!s.numberPages || !numbered) return null
    return next++
  }

  if (cover) {
    for (const item of cover.items) {
      sheets.push(sheetFor(resolvePage(item, sources), take(s.numberCover)))
    }
  }

  documents.forEach((doc, i) => {
    const tab = i + 1
    let first: number | null = null
    if (s.tabSheets) {
      const number = take(true)
      first = number
      sheets.push({ kind: "tab", label: tabLabel(s.tabLabel, tab), number })
    }
    doc.items.forEach((item, j) => {
      const number = take(true)
      if (j === 0 && !s.tabSheets) first = number
      sheets.push(sheetFor(resolvePage(item, sources), number))
    })
    index.push({ docId: doc.id, tab, title: doc.title, page: first })
  })

  return {
    file: { name: safeFileName(s.fileName, "Bundle of Authorities"), sheets },
    index,
    problems,
  }
}

export function planFixer(
  workspace: Workspace<FixerSettings>,
  sources: Sources
): { files: PlannedFile[]; problems: PlanProblem[] } {
  const s = workspace.settings
  const problems = problemsFor(workspace.docs, sources)
  if (workspace.docs.length === 0)
    problems.push({ docId: "", message: "Add a PDF first" })

  const build = (docs: DocRecord[]) => {
    let next = s.startNumber
    const sheets: PlannedSheet[] = []
    for (const doc of docs) {
      for (const item of doc.items) {
        sheets.push(
          sheetFor(resolvePage(item, sources), s.numberPages ? next++ : null)
        )
      }
    }
    return sheets
  }

  if (s.output === "merged") {
    return {
      files: [
        {
          name: safeFileName(s.fileName, "Combined"),
          sheets: build(workspace.docs),
        },
      ],
      problems,
    }
  }
  const used = new Set<string>()
  const files = workspace.docs.map((doc) => {
    let name = safeFileName(doc.title, "Document")
    let n = 2
    while (used.has(name.toLowerCase()))
      name = safeFileName(`${doc.title} (${n++})`, "Document")
    used.add(name.toLowerCase())
    return { name, sheets: build([doc]) }
  })
  return { files, problems }
}

export function indexAsText(rows: IndexRow[]): string {
  return [
    "Tab\tAuthority\tPage",
    ...rows.map((r) => `${r.tab}\t${r.title}\t${r.page ?? ""}`),
  ].join("\r\n")
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  )
}

/** HTML table — pastes into Word as a real table. */
export function indexAsHtml(rows: IndexRow[]): string {
  const cell =
    "border:1px solid #000;padding:4pt 6pt;font-family:Arial;font-size:11pt"
  const head = ["Tab", "Authority", "Page"]
    .map((h) => `<th style="${cell};text-align:left">${h}</th>`)
    .join("")
  const body = rows
    .map(
      (r) =>
        `<tr><td style="${cell}">${r.tab}</td><td style="${cell}">${escapeHtml(r.title)}</td><td style="${cell};text-align:right">${r.page ?? ""}</td></tr>`
    )
    .join("")
  return `<table style="border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}
