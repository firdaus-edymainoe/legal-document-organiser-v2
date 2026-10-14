import { Loader2 } from "lucide-react"

import { sourceIdsOf, turnPhrase } from "@/state/plan"
import { useStore } from "@/state/store"
import type { SourceRecord, Tool } from "@/state/types"

const FINISHED: SourceRecord["status"][] = ["ready", "locked", "error"]

/**
 * Shown above the grid while any file in this workspace is still being
 * auto-fixed. Names the latest page the fix turned, so progress is visible
 * even before the file is finished.
 */
export function AutofixStrip({ tool }: { tool: Tool }) {
  const docs = useStore((s) => s.workspaces[tool].docs)
  const sources = useStore((s) => s.sources)
  const fixes = useStore((s) => s.fixes)

  const ids = sourceIdsOf(docs)
  const records = ids.map((id) => sources[id]).filter(Boolean)
  const busy = records.filter(
    (r) => r.status === "queued" || r.status === "analyzing"
  )
  if (busy.length === 0) return null

  const finished = records.filter((r) => FINISHED.includes(r.status)).length
  const progress =
    records.reduce(
      (n, r) => n + (FINISHED.includes(r.status) ? 1 : r.progress),
      0
    ) / records.length

  const latest = fixes.find((f) => ids.includes(f.sourceId))
  const latestDoc = latest
    ? docs.find(
        (d) =>
          d.sourceId === latest.sourceId ||
          d.items.some((i) => i.sourceId === latest.sourceId)
      )
    : undefined
  const latestName =
    latestDoc?.title ?? sources[latest?.sourceId ?? ""]?.fileName ?? ""

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-3 border-b border-registry/20 bg-registry-soft px-6 py-2 text-xs"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-registry" />
      <span className="shrink-0 font-semibold text-registry">
        Auto-fixing orientation
      </span>
      <span className="tabular shrink-0 text-ink-soft">
        {finished} of {records.length} files
      </span>
      <span className="block h-1 w-20 shrink-0 overflow-hidden rounded-full bg-sheet">
        <span
          className="block h-full rounded-full bg-registry transition-[width] duration-300"
          style={{ width: `${Math.max(6, progress * 100)}%` }}
        />
      </span>
      {latest ? (
        <span
          key={latest.id}
          className="min-w-0 truncate text-ink"
          title={`${latestName}, page ${latest.pageIndex + 1}`}
        >
          <span className="font-semibold">{latestName}</span>
          <span className="tabular"> · p. {latest.pageIndex + 1} </span>
          {turnPhrase(latest.turn)}
        </span>
      ) : (
        <span className="min-w-0 truncate text-ink-soft">
          Reading each page&rsquo;s orientation&hellip;
        </span>
      )}
    </div>
  )
}
