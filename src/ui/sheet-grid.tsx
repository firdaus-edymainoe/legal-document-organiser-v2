import { useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import {
  AlertTriangle,
  Check,
  CircleCheck,
  FilePlus2,
  GalleryVertical,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Palette,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Undo,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { resolvePage, tabLabel, type ResolvedPage } from "@/state/plan"
import {
  clearSelection,
  clickItem,
  colorPages,
  deletePages,
  insertBlank,
  insertPdf,
  markChecked,
  moveItems,
  rasterPages,
  resetPages,
  rotatePages,
  selectAll,
  useStore,
} from "@/state/store"
import type { Tool } from "@/state/types"

import { AutofixStrip } from "./autofix"
import { ColorPicker } from "./color-picker"
import { pickPdfs } from "./files"
import { sheetSpec } from "./specs"
import { SheetImage } from "./thumb"

type Filter = "all" | "review" | "edited" | "raster"
type Zoom = "s" | "m" | "l"
type View = "grid" | "preview"
const ZOOM_WIDTH: Record<Zoom, number> = { s: 116, m: 164, l: 236 }
/** Preview pages are shown large enough to read a filed page. */
const PREVIEW_WIDTH: Record<Zoom, number> = { s: 440, m: 580, l: 720 }

function bucket(width: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  return Math.round((width * dpr) / 40) * 40
}

function FlagIcons({ page }: { page: ResolvedPage }) {
  return (
    <span className="flex items-center gap-1">
      {page.flags.includes("review") ? (
        <span
          title="Check orientation"
          className="flex size-4 items-center justify-center rounded-full bg-caution text-white"
        >
          <AlertTriangle className="size-2.5" strokeWidth={3} />
        </span>
      ) : null}
      {page.flags.includes("raster") ? (
        <span
          title="Copied as an image"
          className="flex size-4 items-center justify-center rounded-full bg-imaged text-white"
        >
          <ImageIcon className="size-2.5" strokeWidth={3} />
        </span>
      ) : null}
      {page.flags.includes("edited") ? (
        <span
          title="Changed by you"
          className="size-2 rounded-full bg-registry"
        />
      ) : null}
    </span>
  )
}

function PageCard({
  tool,
  page,
  label,
  width,
  selected,
  focused,
  sortable,
}: {
  tool: Tool
  page: ResolvedPage
  label: string
  width: number
  selected: boolean
  focused: boolean
  sortable: boolean
}) {
  const sources = useStore((s) => s.sources)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: page.item.id,
    disabled: !sortable,
  })
  const spec = sheetSpec(page, sources, bucket(width))
  const review = page.flags.includes("review")

  return (
    <div
      ref={setNodeRef}
      data-item-id={page.item.id}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        width,
      }}
      className={cn(
        "group flex flex-col items-center gap-1.5",
        isDragging && "z-10 opacity-80"
      )}
    >
      <div
        {...(sortable ? { ...attributes, ...listeners } : {})}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${label}${review ? ", needs checking" : ""}`}
        onClick={(e) =>
          clickItem(
            tool,
            page.item.id,
            e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "single"
          )
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            clickItem(tool, page.item.id, e.shiftKey ? "range" : "toggle")
            return
          }
          if (sortable) listeners?.onKeyDown?.(e)
        }}
        className={cn(
          "sheet relative aspect-[595/842] w-full cursor-pointer overflow-hidden rounded-[2px] outline-none",
          selected && "ring-2 ring-registry ring-offset-2 ring-offset-desk",
          !selected &&
            focused &&
            "ring-2 ring-ink/40 ring-offset-2 ring-offset-desk",
          review &&
            !selected &&
            "ring-2 ring-caution ring-offset-2 ring-offset-desk"
        )}
      >
        <SheetImage spec={spec} alt={label} priority={focused ? 5 : 0} />
        {!page.ready ? <PendingBadge /> : null}
        <span
          className={cn(
            "absolute top-1.5 left-2 flex size-4 items-center justify-center rounded border bg-sheet transition-opacity",
            selected
              ? "border-registry bg-registry text-white opacity-100"
              : "border-ink-soft/50 opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation()
            clickItem(tool, page.item.id, "toggle")
          }}
        >
          {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      </div>
      <PageCaption page={page} label={label} focused={focused} />
    </div>
  )
}

function PendingBadge() {
  return (
    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-registry-soft py-1 text-[10px] font-medium text-registry">
      <Loader2 className="size-3 animate-spin" /> Auto-fixing
    </span>
  )
}

function PageCaption({
  page,
  label,
  focused,
}: {
  page: ResolvedPage
  label: string
  focused: boolean
}) {
  return (
    <div className="tabular flex w-full items-center justify-between gap-2 px-0.5 text-[11px] text-ink-soft">
      <span className={cn("truncate", focused && "font-semibold text-ink")}>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {page.flags.includes("autofixed") ? (
          <span className="rounded bg-registry-soft px-1 font-medium text-registry">
            Auto-turned
          </span>
        ) : null}
        <FlagIcons page={page} />
      </span>
    </div>
  )
}

/**
 * One page at document size, for reading the file top to bottom. Clicking
 * selects it, as in the grid; pages are not reordered in this view.
 */
function PreviewPage({
  tool,
  page,
  label,
  width,
  selected,
  focused,
}: {
  tool: Tool
  page: ResolvedPage
  label: string
  width: number
  selected: boolean
  focused: boolean
}) {
  const sources = useStore((s) => s.sources)
  const spec = sheetSpec(page, sources, bucket(width))
  const review = page.flags.includes("review")

  return (
    <figure
      data-item-id={page.item.id}
      className="flex w-full flex-col gap-1.5"
      style={{ maxWidth: width }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${label}${review ? ", needs checking" : ""}`}
        onClick={(e) =>
          clickItem(
            tool,
            page.item.id,
            e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "single"
          )
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            clickItem(tool, page.item.id, e.shiftKey ? "range" : "toggle")
          }
        }}
        className={cn(
          "sheet relative aspect-[595/842] w-full cursor-pointer overflow-hidden rounded-[2px] outline-none",
          selected && "ring-2 ring-registry ring-offset-2 ring-offset-desk",
          !selected &&
            focused &&
            "ring-2 ring-ink/40 ring-offset-2 ring-offset-desk",
          review &&
            !selected &&
            "ring-2 ring-caution ring-offset-2 ring-offset-desk"
        )}
      >
        <SheetImage spec={spec} alt={label} priority={focused ? 5 : 0} />
        {!page.ready ? <PendingBadge /> : null}
      </div>
      <figcaption>
        <PageCaption page={page} label={label} focused={focused} />
      </figcaption>
    </figure>
  )
}

/** The whole file, top to bottom, with the focused page in view on open. */
function PreviewList({
  tool,
  pages,
  width,
  selectedIds,
  focusId,
}: {
  tool: Tool
  pages: ResolvedPage[]
  width: number
  selectedIds: Set<string>
  focusId: string | null
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const openedAt = useRef(focusId)

  useEffect(() => {
    // Only on open: after that the scroll position belongs to the reader.
    const id = openedAt.current
    if (!id) return
    listRef.current
      ?.querySelector(`[data-item-id="${id}"]`)
      ?.scrollIntoView({ block: "start" })
  }, [])

  return (
    <div ref={listRef} className="flex flex-col items-center gap-10">
      {pages.map((page, index) => (
        <PreviewPage
          key={page.item.id}
          tool={tool}
          page={page}
          label={
            page.item.kind === "blank" ? `${index + 1} · blank` : `${index + 1}`
          }
          width={width}
          selected={selectedIds.has(page.item.id)}
          focused={focusId === page.item.id}
        />
      ))}
    </div>
  )
}

function ToolButton({
  label,
  hint,
  onClick,
  disabled,
  children,
}: {
  label: string
  hint?: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {hint ? <span className="ml-1 opacity-60">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

function Toolbar({ tool, targets }: { tool: Tool; targets: ResolvedPage[] }) {
  const selectedCount = useStore((s) => s.selection[tool].itemIds.length)
  const none = targets.length === 0
  const allRaster = targets.length > 0 && targets.every((t) => t.raster)
  const forced = targets.some((t) => t.item.forceRaster)
  const someLocked = targets.some(
    (t) => t.rasterReason && t.rasterReason !== "requested"
  )
  const anyReview = targets.some((t) => t.flags.includes("review"))
  const anyEdited = targets.some(
    (t) => t.flags.includes("edited") || t.item.checked
  )
  const current = targets[0]?.item.color ?? null
  const scope = selectedCount > 0 ? `${selectedCount} selected` : "This page"

  return (
    <div className="flex h-11 items-center gap-0.5 border-b border-rule bg-sheet/80 px-3 backdrop-blur">
      <span className="tabular mr-2 min-w-20 text-xs font-medium text-ink-soft">
        {none ? "No page" : scope}
      </span>
      <ToolButton
        label="Turn left"
        hint="L"
        onClick={() => rotatePages(tool, 270)}
        disabled={none}
      >
        <RotateCcw />
      </ToolButton>
      <ToolButton
        label="Turn right"
        hint="R"
        onClick={() => rotatePages(tool, 90)}
        disabled={none}
      >
        <RotateCw />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-rule" />
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={none}
                    aria-label="Page colour"
                  />
                }
              />
            }
          >
            <Palette />
            <span
              className="size-3 rounded-sm border border-black/15"
              style={{ backgroundColor: current ?? "#ffffff" }}
            />
          </TooltipTrigger>
          <TooltipContent>Page colour</TooltipContent>
        </Tooltip>
        <PopoverContent>
          <ColorPicker
            current={current}
            onPick={(hex) => colorPages(tool, hex)}
          />
        </PopoverContent>
      </Popover>
      <Menu>
        <MenuTrigger
          render={
            <Button variant="ghost" size="sm" aria-label="Insert pages" />
          }
        >
          <FilePlus2 /> Insert
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Blank page</MenuLabel>
          <MenuItem onClick={() => insertBlank(tool, "before")}>
            <Square /> Before {selectedCount > 1 ? "selection" : "this page"}
          </MenuItem>
          <MenuItem onClick={() => insertBlank(tool, "after")}>
            <Square /> After {selectedCount > 1 ? "selection" : "this page"}
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Pages from a PDF</MenuLabel>
          <MenuItem
            onClick={() =>
              void pickPdfs().then((f) => {
                if (f.length) void insertPdf(tool, f, "before")
              })
            }
          >
            <FilePlus2 /> Before {selectedCount > 1 ? "selection" : "this page"}
            …
          </MenuItem>
          <MenuItem
            onClick={() =>
              void pickPdfs().then((f) => {
                if (f.length) void insertPdf(tool, f, "after")
              })
            }
          >
            <FilePlus2 /> After {selectedCount > 1 ? "selection" : "this page"}…
          </MenuItem>
        </MenuContent>
      </Menu>
      <ToolButton
        label={
          someLocked
            ? "Already copied as an image"
            : forced
              ? "Copy as text and images again"
              : "Copy as an image (flattens the page)"
        }
        onClick={() => rasterPages(tool, !forced)}
        disabled={
          none ||
          (someLocked && !forced) ||
          targets.every((t) => t.item.kind === "blank")
        }
      >
        <ImageIcon className={cn(allRaster && "text-imaged")} />
        <span className="text-xs">
          {forced || allRaster ? "As image" : "Rasterise"}
        </span>
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-rule" />
      {anyReview ? (
        <Button
          variant="outline"
          size="sm"
          className="border-caution/40 text-caution"
          onClick={() => markChecked(tool)}
        >
          <CircleCheck /> Looks right
        </Button>
      ) : null}
      <ToolButton
        label="Undo my changes to these pages"
        onClick={() => resetPages(tool)}
        disabled={none || !anyEdited}
      >
        <Undo />
        <span className="text-xs">Reset</span>
      </ToolButton>
      <ToolButton
        label="Remove pages"
        hint="Del"
        onClick={() => deletePages(tool)}
        disabled={none}
      >
        <Trash2 />
      </ToolButton>
      <div className="flex-1" />
      {selectedCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => clearSelection(tool)}>
          Clear selection
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => selectAll(tool)}>
          Select all
        </Button>
      )}
    </div>
  )
}

export function SheetGrid({ tool }: { tool: Tool }) {
  const docs = useStore((s) => s.workspaces[tool].docs)
  const sources = useStore((s) => s.sources)
  const selection = useStore((s) => s.selection[tool])
  const tabTemplate = useStore((s) => s.workspaces.bundle.settings.tabLabel)
  const [filter, setFilter] = useState<Filter>("all")
  const [zoom, setZoom] = useState<Zoom>("m")
  const [view, setView] = useState<View>("grid")
  const doc = docs.find((d) => d.id === selection.docId) ?? docs[0]

  const pages = useMemo(
    () => (doc ? doc.items.map((item) => resolvePage(item, sources)) : []),
    [doc, sources]
  )
  const counts = {
    review: pages.filter((p) => p.flags.includes("review")).length,
    edited: pages.filter((p) => p.flags.includes("edited")).length,
    raster: pages.filter((p) => p.flags.includes("raster")).length,
  }
  const shown = pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => filter === "all" || page.flags.includes(filter))

  const selectedIds = new Set(selection.itemIds)
  const targets = pages.filter((p) =>
    selectedIds.size > 0
      ? selectedIds.has(p.item.id)
      : p.item.id === selection.focusId
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = (event: DragEndEvent) => {
    if (!doc) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = doc.items.map((i) => i.id)
    moveItems(
      tool,
      doc.id,
      arrayMove(
        ids,
        ids.indexOf(String(active.id)),
        ids.indexOf(String(over.id))
      )
    )
  }

  if (!doc) return <section className="bg-desk" />

  const rest = docs.filter((d) => d.role !== "cover")
  const tabIndex = rest.findIndex((d) => d.id === doc.id)
  const eyebrow =
    tool === "bundle"
      ? doc.role === "cover"
        ? "Cover & index"
        : tabLabel(tabTemplate, tabIndex + 1)
      : `File ${docs.findIndex((d) => d.id === doc.id) + 1} of ${docs.length}`
  const width = ZOOM_WIDTH[zoom]
  const chips: { key: Filter; label: string; count?: number; tone?: string }[] =
    [
      { key: "all", label: "All pages", count: pages.length },
      {
        key: "review",
        label: "To check",
        count: counts.review,
        tone: "text-caution",
      },
      { key: "edited", label: "Changed", count: counts.edited },
      {
        key: "raster",
        label: "As image",
        count: counts.raster,
        tone: "text-imaged",
      },
    ]

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-desk">
      <div className="flex items-end justify-between gap-4 px-6 pt-5 pb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-manila-deep uppercase">
            {eyebrow}
          </p>
          <h1
            className="truncate font-display text-[22px] leading-tight font-semibold tracking-tight"
            title={doc.fileName}
          >
            {doc.title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-md border border-rule bg-sheet p-0.5"
            role="group"
            aria-label="View"
          >
            {(
              [
                { key: "grid", label: "Grid", Icon: LayoutGrid },
                { key: "preview", label: "Preview", Icon: GalleryVertical },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-ink-soft",
                  view === key && "bg-desk text-ink"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div
            className="flex items-center gap-1 rounded-md border border-rule bg-sheet p-0.5"
            role="group"
            aria-label="Thumbnail size"
          >
            {(["s", "m", "l"] as Zoom[]).map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => setZoom(z)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium text-ink-soft",
                  zoom === z && "bg-desk text-ink"
                )}
              >
                {z.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      {view === "grid" ? (
        <div className="flex items-center gap-1.5 px-6 pb-3">
          {chips
            .filter(
              (c) => c.key === "all" || (c.count ?? 0) > 0 || filter === c.key
            )
            .map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={filter === c.key}
                onClick={() => setFilter(c.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === c.key
                    ? "border-ink bg-ink text-white"
                    : cn(
                        "border-rule bg-sheet hover:border-ink-soft/50",
                        c.tone ?? "text-ink-soft"
                      )
                )}
              >
                {c.label} <span className="tabular opacity-70">{c.count}</span>
              </button>
            ))}
        </div>
      ) : null}
      <AutofixStrip tool={tool} />
      <Toolbar tool={tool} targets={targets} />
      <div
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-10"
        onClick={(e) => {
          if (e.target === e.currentTarget) clearSelection(tool)
        }}
      >
        {view === "preview" ? (
          <PreviewList
            key={doc.id}
            tool={tool}
            pages={pages}
            width={PREVIEW_WIDTH[zoom]}
            selectedIds={selectedIds}
            focusId={selection.focusId}
          />
        ) : shown.length === 0 ? (
          <p className="pt-10 text-center text-sm text-ink-soft">
            No pages match this filter.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={shown.map(({ page }) => page.item.id)}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap gap-x-5 gap-y-6">
                {shown.map(({ page, index }) => (
                  <PageCard
                    key={page.item.id}
                    tool={tool}
                    page={page}
                    label={
                      page.item.kind === "blank"
                        ? `${index + 1} · blank`
                        : `${index + 1}`
                    }
                    width={width}
                    selected={selectedIds.has(page.item.id)}
                    focused={selection.focusId === page.item.id}
                    sortable={filter === "all"}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </section>
  )
}
