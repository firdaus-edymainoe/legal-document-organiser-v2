import { useState } from "react"
import { cn } from "cn"
import {
  AlertTriangle,
  CircleCheck,
  ClipboardCopy,
  RotateCcw,
  RotateCw,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { NumberSize } from "@/pdf-kernel"
import { exportProblems } from "@/state/export"
import {
  RASTER_REASON_TEXT,
  indexAsHtml,
  indexAsText,
  planBundle,
  resolvePage,
  tabLabel,
  type ResolvedPage,
} from "@/state/plan"
import {
  markChecked,
  setFullPage,
  rotatePages,
  updateBundleSettings,
  updateFixerSettings,
  useStore,
} from "@/state/store"
import type { SourceRecord, Tool } from "@/state/types"

import { paperName, sheetSpec } from "./specs"
import { SheetImage } from "./thumb"

function turnText(deg: number): string {
  if (deg === 0) return "Not turned"
  if (deg === 90) return "Turned a quarter clockwise"
  if (deg === 180) return "Turned upside down"
  return "Turned a quarter anticlockwise"
}

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function PagePanel({ tool }: { tool: Tool }) {
  const [view, setView] = useState<"sheet" | "original">("sheet")
  const sources = useStore((s) => s.sources)
  const selection = useStore((s) => s.selection[tool])
  const doc = useStore((s) =>
    s.workspaces[tool].docs.find((d) => d.id === selection.docId)
  )
  const index = doc?.items.findIndex((i) => i.id === selection.focusId) ?? -1
  const item = index >= 0 ? doc!.items[index] : null
  if (!doc || !item) {
    return (
      <p className="p-5 text-sm text-ink-soft">
        Select a page to see how it will be filed.
      </p>
    )
  }
  const page = resolvePage(item, sources)
  const original = page.item.kind === "page" && view === "original"
  const spec = original
    ? {
        ...sheetSpec(page, sources, 640)!,
        view: "original" as const,
        extra: 0 as const,
        color: null,
      }
    : sheetSpec(page, sources, 640)
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <p className="tabular text-sm font-semibold">
          Page {index + 1}{" "}
          <span className="font-normal text-ink-soft">
            of {doc.items.length}
          </span>
        </p>
        {item.kind === "page" ? (
          <div
            className="flex rounded-md border border-rule bg-desk p-0.5 text-xs"
            role="group"
            aria-label="Preview"
          >
            {(["sheet", "original"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium text-ink-soft",
                  view === v && "bg-sheet text-ink shadow-sm"
                )}
              >
                {v === "sheet" ? "As filed" : "Original"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className={cn("flex items-center justify-center", !original && "px-6")}
      >
        <div
          className={cn(
            "w-full",
            original ? "aspect-square" : "sheet aspect-[595/842] rounded-[2px]"
          )}
        >
          <SheetImage
            spec={spec}
            priority={10}
            alt={`Page ${index + 1} preview`}
          />
        </div>
      </div>
      {page.flags.includes("review") ? (
        <ReviewCallout tool={tool} page={page} />
      ) : null}
      {page.analysis?.scan ? <ScanRow tool={tool} page={page} /> : null}
      <PageFacts page={page} sources={sources} />
    </div>
  )
}

function ReviewCallout({ tool, page }: { tool: Tool; page: ResolvedPage }) {
  return (
    <div className="rounded-md border border-caution/30 bg-caution-soft p-3 text-[13px]">
      <p className="flex items-center gap-1.5 font-semibold text-caution">
        <AlertTriangle className="size-4" /> Check this page
      </p>
      <p className="mt-1 text-ink-soft">
        {page.analysis?.detection.note}. Turn it if it reads wrong.
      </p>
      <div className="mt-2.5 flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => rotatePages(tool, 270)}
        >
          <RotateCcw /> Left
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => rotatePages(tool, 90)}
        >
          <RotateCw /> Right
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => markChecked(tool)}>
          <CircleCheck /> Looks right
        </Button>
      </div>
    </div>
  )
}

function PageFacts({
  page,
  sources,
}: {
  page: ResolvedPage
  sources: Record<string, SourceRecord>
}) {
  if (page.item.kind === "blank") {
    return (
      <dl className="divide-y divide-rule border-y border-rule">
        <Fact label="Page">Blank A4 sheet you inserted</Fact>
        <Fact label="Colour">{page.item.color ?? "White"}</Fact>
      </dl>
    )
  }
  const source = page.item.sourceId ? sources[page.item.sourceId] : undefined
  const a = page.analysis
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      <Fact label="From">
        <span className="break-words">
          {source?.fileName ?? "Unknown file"}
        </span>
        <span className="tabular text-ink-soft">
          {" "}
          · p. {(page.item.pageIndex ?? 0) + 1}
        </span>
      </Fact>
      {a ? (
        <>
          <Fact label="Original">{paperName(a.width, a.height)}</Fact>
          <Fact label="Direction">{a.detection.note}</Fact>
          <Fact label="Filed as">
            {turnText(page.rotate)}
            {page.item.turn !== 0 ? (
              <span className="text-registry"> · includes your turn</span>
            ) : null}
            <br />
            <span className="text-ink-soft">
              {page.flags.includes("scaled")
                ? "Resized to fit A4"
                : "Already A4"}
            </span>
          </Fact>
          <Fact label="Copied as">
            {page.raster ? (
              <>
                <span className="text-imaged">Image (200 dpi)</span>
                <br />
                <span className="text-ink-soft">
                  {RASTER_REASON_TEXT[page.rasterReason!]}
                </span>
              </>
            ) : (
              "Text and shapes — stays sharp and searchable"
            )}
          </Fact>
          <Fact label="Colour">{page.item.color ?? "White"}</Fact>
        </>
      ) : (
        <Fact label="Status">
          {source?.status === "error"
            ? (source.error ?? "Could not be read")
            : source?.status === "locked"
              ? "Needs its password"
              : "Checking orientation and size…"}
        </Fact>
      )}
    </dl>
  )
}

/** Shown for a page whose scan covers only part of it. */
function ScanRow({ tool, page }: { tool: Tool; page: ResolvedPage }) {
  const scanned = page.crop !== null
  return (
    <Row
      label="Fit scan to page"
      hint={
        scanned
          ? "The scan is enlarged to fill the sheet"
          : "The whole page is shown as filed"
      }
    >
      <Switch
        checked={scanned}
        onCheckedChange={(on) => setFullPage(tool, !on)}
      />
    </Row>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        {hint ? <p className="text-xs text-ink-soft">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      className="flex rounded-md border border-rule bg-desk p-0.5 text-xs"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2 py-1 font-medium text-ink-soft",
            value === o.value && "bg-sheet text-ink shadow-sm"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const SIZES: { value: NumberSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
]

function NumberStart({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <Input
      type="number"
      min={1}
      value={value}
      onChange={(e) =>
        onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))
      }
      className="tabular h-7 w-16 text-right"
      aria-label="First page number"
    />
  )
}

function Problems({ tool }: { tool: Tool }) {
  useStore((s) => s.sources)
  useStore((s) => s.workspaces)
  const problems = exportProblems(tool)
  if (problems.length === 0) return null
  return (
    <div className="rounded-md border border-caution/30 bg-caution-soft p-3 text-[13px]">
      <p className="font-semibold text-caution">Before you export</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-soft">
        {problems.slice(0, 5).map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function BundleOutput() {
  const settings = useStore((s) => s.workspaces.bundle.settings)
  const workspace = useStore((s) => s.workspaces.bundle)
  const sources = useStore((s) => s.sources)
  const { index } = planBundle(workspace, sources)

  const copy = async () => {
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([indexAsHtml(index)], { type: "text/html" }),
            "text/plain": new Blob([indexAsText(index)], {
              type: "text/plain",
            }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(indexAsText(index))
      }
      toast.success("Index copied", {
        description: "Paste it into Word as a table.",
      })
    } catch {
      toast.error("The browser did not allow copying")
    }
  }

  return (
    <div className="space-y-5 p-5">
      <Problems tool="bundle" />
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Index</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copy()}
            disabled={index.length === 0}
          >
            <ClipboardCopy /> Copy for Word
          </Button>
        </div>
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-ink-soft">
              <th className="py-1.5 pr-2 font-medium">Tab</th>
              <th className="py-1.5 pr-2 font-medium">Authority</th>
              <th className="py-1.5 text-right font-medium">Page</th>
            </tr>
          </thead>
          <tbody>
            {index.map((row) => (
              <tr key={row.docId} className="border-b border-rule/70 align-top">
                <td className="tabular py-1.5 pr-2 whitespace-nowrap text-manila-deep">
                  {tabLabel(settings.tabLabel, row.tab)}
                </td>
                <td className="py-1.5 pr-2 break-words">{row.title}</td>
                <td className="tabular py-1.5 text-right">{row.page ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-soft">
          Page numbers point to each{" "}
          {settings.tabSheets ? "TAB sheet" : "authority's first page"}.
          Double-click an authority in the list to rename it.
        </p>
      </section>

      <section className="divide-y divide-rule border-y border-rule">
        <Row label="TAB divider sheets" hint="A sheet before each authority">
          <Switch
            checked={settings.tabSheets}
            onCheckedChange={(v) => updateBundleSettings({ tabSheets: v })}
          />
        </Row>
        {settings.tabSheets ? (
          <Row label="TAB label" hint="{n} is the tab number">
            <Input
              value={settings.tabLabel}
              onChange={(e) =>
                updateBundleSettings({ tabLabel: e.target.value })
              }
              className="h-7 w-28"
              aria-label="TAB label"
            />
          </Row>
        ) : null}
        <Row label="Page numbers" hint="Top right of every sheet">
          <Switch
            checked={settings.numberPages}
            onCheckedChange={(v) => updateBundleSettings({ numberPages: v })}
          />
        </Row>
        {settings.numberPages ? (
          <>
            <Row label="Number the cover & index">
              <Switch
                checked={settings.numberCover}
                onCheckedChange={(v) =>
                  updateBundleSettings({ numberCover: v })
                }
              />
            </Row>
            <Row label="Start at">
              <NumberStart
                value={settings.startNumber}
                onChange={(n) => updateBundleSettings({ startNumber: n })}
              />
            </Row>
            <Row label="Number size">
              <Segmented
                label="Number size"
                value={settings.numberSize}
                options={SIZES}
                onChange={(v) => updateBundleSettings({ numberSize: v })}
              />
            </Row>
          </>
        ) : null}
        <Row label="File name">
          <Input
            value={settings.fileName}
            onChange={(e) => updateBundleSettings({ fileName: e.target.value })}
            className="h-7 w-44"
            aria-label="File name"
          />
        </Row>
      </section>
    </div>
  )
}

function FixerOutput() {
  const settings = useStore((s) => s.workspaces.fixer.settings)
  return (
    <div className="space-y-5 p-5">
      <Problems tool="fixer" />
      <section className="divide-y divide-rule border-y border-rule">
        <Row
          label="Save as"
          hint={
            settings.output === "merged"
              ? "All files in list order"
              : "Downloads as a ZIP"
          }
        >
          <Segmented
            label="Save as"
            value={settings.output}
            options={[
              { value: "merged", label: "One file" },
              { value: "separate", label: "One per file" },
            ]}
            onChange={(v) => updateFixerSettings({ output: v })}
          />
        </Row>
        {settings.output === "merged" ? (
          <Row label="File name">
            <Input
              value={settings.fileName}
              onChange={(e) =>
                updateFixerSettings({ fileName: e.target.value })
              }
              className="h-7 w-44"
              aria-label="File name"
            />
          </Row>
        ) : null}
        <Row
          label="Page numbers"
          hint={
            settings.output === "merged"
              ? "Run through the whole file"
              : "Restart in each file"
          }
        >
          <Switch
            checked={settings.numberPages}
            onCheckedChange={(v) => updateFixerSettings({ numberPages: v })}
          />
        </Row>
        {settings.numberPages ? (
          <>
            <Row label="Start at">
              <NumberStart
                value={settings.startNumber}
                onChange={(n) => updateFixerSettings({ startNumber: n })}
              />
            </Row>
            <Row label="Number size">
              <Segmented
                label="Number size"
                value={settings.numberSize}
                options={SIZES}
                onChange={(v) => updateFixerSettings({ numberSize: v })}
              />
            </Row>
          </>
        ) : null}
      </section>
    </div>
  )
}

export function Inspector({ tool }: { tool: Tool }) {
  const [tab, setTab] = useState<"page" | "output">("page")
  return (
    <aside className="flex min-h-0 flex-col border-l border-rule bg-sheet">
      <div
        className="flex h-11 shrink-0 items-stretch gap-1 border-b border-rule px-3"
        role="tablist"
      >
        {(
          [
            ["page", "This page"],
            ["output", tool === "bundle" ? "Index & output" : "Output"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "relative px-2.5 text-[13px] font-medium text-ink-soft hover:text-ink",
              tab === key &&
                "text-ink after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-registry"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === "page" ? (
          <PagePanel tool={tool} />
        ) : tool === "bundle" ? (
          <BundleOutput />
        ) : (
          <FixerOutput />
        )}
      </div>
    </aside>
  )
}
