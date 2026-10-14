import { zip, type SheetSpec } from "@/pdf-kernel"
import { pdfWorker } from "@/pdf-kernel/worker/client"
import { rasterisePage } from "@/engine/render"
import { openSource, sourceBytes } from "@/engine/sources"

import { planBundle, planFixer, type PlannedFile } from "./plan"
import { setExportState, useStore, type ExportFile } from "./store"
import type { Tool } from "./types"

function plannedFiles(tool: Tool): {
  files: PlannedFile[]
  problems: string[]
} {
  const { workspaces, sources } = useStore.getState()
  if (tool === "bundle") {
    const plan = planBundle(workspaces.bundle, sources)
    return { files: [plan.file], problems: plan.problems.map((p) => p.message) }
  }
  const plan = planFixer(workspaces.fixer, sources)
  return { files: plan.files, problems: plan.problems.map((p) => p.message) }
}

export function exportProblems(tool: Tool): string[] {
  return plannedFiles(tool).problems
}

async function buildFile(
  file: PlannedFile,
  tool: Tool,
  report: (step: string, done: number, total: number) => void
): Promise<Uint8Array> {
  const settings = useStore.getState().workspaces[tool].settings
  const rasterCount = file.sheets.filter(
    (s) => s.kind === "page" && s.raster
  ).length
  let rastered = 0
  const sheets: SheetSpec[] = []
  const sources: Record<string, Uint8Array> = {}

  for (const sheet of file.sheets) {
    if (sheet.kind === "tab") {
      sheets.push({
        content: { kind: "tab", label: sheet.label },
        rotate: 0,
        color: null,
        number: sheet.number,
      })
      continue
    }
    if (sheet.kind === "blank") {
      sheets.push({
        content: { kind: "blank" },
        rotate: 0,
        color: sheet.color,
        number: sheet.number,
      })
      continue
    }
    if (sheet.raster) {
      report(`Converting pages to images — ${file.name}`, rastered, rasterCount)
      const doc = await openSource(sheet.sourceId)
      const page = await doc.getPage(sheet.pageIndex + 1)
      const image = await rasterisePage(page)
      page.cleanup()
      rastered += 1
      sheets.push({
        content: { kind: "raster", ...image },
        rotate: sheet.rotate,
        color: sheet.color,
        number: sheet.number,
      })
      continue
    }
    sources[sheet.sourceId] ??= sourceBytes(sheet.sourceId)
    sheets.push({
      content: {
        kind: "vector",
        sourceId: sheet.sourceId,
        pageIndex: sheet.pageIndex,
      },
      rotate: sheet.rotate,
      color: sheet.color,
      number: sheet.number,
    })
  }

  report(`Assembling ${file.name}`, 0, sheets.length)
  return pdfWorker().compose(
    {
      sources,
      sheets,
      numberSize: settings.numberSize,
      title: file.name.replace(/\.pdf$/i, ""),
    },
    (done, total) => report(`Assembling ${file.name}`, done, total)
  )
}

export async function runExport(tool: Tool) {
  const { files, problems } = plannedFiles(tool)
  if (problems.length > 0) {
    setExportState({ phase: "error", message: problems.join("\n") })
    return
  }
  setExportState({ phase: "running", step: "Preparing", done: 0, total: 1 })
  try {
    const out: ExportFile[] = []
    for (const file of files) {
      const bytes = await buildFile(file, tool, (step, done, total) =>
        setExportState({ phase: "running", step, done, total })
      )
      out.push({ name: file.name, bytes })
    }
    setExportState({ phase: "done", files: out, tool })
  } catch (err) {
    setExportState({
      phase: "error",
      message: err instanceof Error ? err.message : "Could not build the PDF",
    })
  }
}

export function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function downloadExport(files: ExportFile[], zipName: string) {
  if (files.length === 1) {
    downloadBytes(files[0].bytes, files[0].name, "application/pdf")
    return
  }
  downloadBytes(
    zip(files.map((f) => ({ name: f.name, data: f.bytes }))),
    zipName,
    "application/zip"
  )
}
