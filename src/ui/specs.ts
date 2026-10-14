import type { ThumbSpec } from "@/engine/thumbs"
import type { ResolvedPage } from "@/state/plan"
import type { SourceRecord } from "@/state/types"

export function sheetSpec(
  page: ResolvedPage,
  sources: Record<string, SourceRecord>,
  width: number
): ThumbSpec | null {
  const item = page.item
  if (item.kind === "blank") {
    return {
      view: "sheet",
      sourceId: null,
      pageIndex: 0,
      extra: 0,
      color: item.color,
      width,
    }
  }
  const source = item.sourceId ? sources[item.sourceId] : undefined
  if (!source || source.status === "locked" || source.status === "error")
    return null
  return {
    view: "sheet",
    sourceId: item.sourceId!,
    pageIndex: item.pageIndex!,
    extra: page.rotate,
    color: item.color,
    width,
  }
}

const PAPER: { name: string; w: number; h: number }[] = [
  { name: "A4", w: 595, h: 842 },
  { name: "A3", w: 842, h: 1191 },
  { name: "A5", w: 420, h: 595 },
  { name: "Letter", w: 612, h: 792 },
  { name: "Legal", w: 612, h: 1008 },
]

export function paperName(width: number, height: number): string {
  const short = Math.min(width, height)
  const long = Math.max(width, height)
  const match = PAPER.find(
    (p) => Math.abs(p.w - short) < 6 && Math.abs(p.h - long) < 6
  )
  const mm = (pt: number) => Math.round((pt / 72) * 25.4)
  const shape = width > height * 1.02 ? "landscape" : "portrait"
  return `${match ? `${match.name} · ` : ""}${mm(width)} × ${mm(height)} mm · ${shape}`
}
