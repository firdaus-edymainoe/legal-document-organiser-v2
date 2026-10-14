import { useState } from "react"
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import {
  AlertTriangle,
  ArrowDownAZ,
  BookOpen,
  GripVertical,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { resolvePage } from "@/state/plan"
import {
  addFiles,
  removeDoc,
  renameDoc,
  reorderDocs,
  retrySource,
  selectDoc,
  setRole,
  sortDocsByName,
  useStore,
} from "@/state/store"
import { tabLabel } from "@/state/plan"
import type { DocRecord, SourceRecord, Tool } from "@/state/types"

import { pickPdfs } from "./files"

function docStatus(doc: DocRecord, sources: Record<string, SourceRecord>) {
  const ids = new Set([
    doc.sourceId,
    ...doc.items.map((i) => i.sourceId).filter(Boolean),
  ] as string[])
  const records = [...ids].map((id) => sources[id]).filter(Boolean)
  const busy = records.filter(
    (r) => r.status === "queued" || r.status === "analyzing"
  )
  const failed = records.find((r) => r.status === "error")
  const locked = records.find((r) => r.status === "locked")
  const progress = busy.length
    ? busy.reduce(
        (n, r) => n + (r.status === "analyzing" ? r.progress : 0),
        0
      ) / busy.length
    : 1
  let review = 0
  let imaged = 0
  for (const item of doc.items) {
    const page = resolvePage(item, sources)
    if (page.flags.includes("review")) review += 1
    if (page.raster) imaged += 1
  }
  const encrypted = records.some((r) => r.analysis?.encrypted)
  return {
    busy: busy.length > 0,
    progress,
    failed,
    locked,
    review,
    imaged,
    encrypted,
  }
}

function DocRow({
  tool,
  doc,
  marker,
  active,
  sortable,
}: {
  tool: Tool
  doc: DocRecord
  marker: string | null
  active: boolean
  sortable: boolean
}) {
  const sources = useStore((s) => s.sources)
  const status = docStatus(doc, sources)
  const [editing, setEditing] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: doc.id,
    disabled: !sortable,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group relative mr-14 rounded-md border bg-sheet pr-8 transition-shadow",
        active
          ? "border-registry shadow-[0_0_0_1px_var(--registry)]"
          : "border-rule hover:border-ink-soft/40",
        isDragging && "z-10 shadow-lg"
      )}
    >
      <div className="flex items-start gap-1.5 py-2.5 pl-1.5">
        {sortable ? (
          <button
            type="button"
            aria-label={`Reorder ${doc.title}`}
            className="mt-0.5 cursor-grab rounded p-0.5 text-ink-soft/60 hover:text-ink active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : (
          <span className="mt-0.5 p-0.5 text-registry">
            <BookOpen className="size-4" />
          </span>
        )}
        <button
          type="button"
          className="min-w-0 flex-1 text-left outline-none"
          onClick={() => selectDoc(tool, doc.id)}
          onDoubleClick={() => setEditing(true)}
        >
          {editing ? (
            <input
              autoFocus
              defaultValue={doc.title}
              className="w-full rounded border border-registry bg-sheet px-1 py-0.5 text-sm outline-none"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                renameDoc(tool, doc.id, e.target.value)
                setEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                if (e.key === "Escape") setEditing(false)
              }}
            />
          ) : (
            <span
              className="line-clamp-2 text-sm leading-snug font-medium break-words"
              title={doc.fileName}
            >
              {doc.title}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            {status.failed ? (
              <span className="text-destructive">Could not be read</span>
            ) : status.locked ? (
              <span className="text-caution">Needs password</span>
            ) : (
              <span className="tabular">
                {doc.items.length} page{doc.items.length === 1 ? "" : "s"}
              </span>
            )}
            {status.busy ? (
              <span className="inline-flex items-center gap-1 rounded bg-registry-soft px-1.5 font-medium text-registry">
                <Loader2 className="size-3 animate-spin" />
                Auto-fixing
              </span>
            ) : null}
            {status.review > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-caution-soft px-1.5 font-medium text-caution">
                <AlertTriangle className="size-3" />
                {status.review} to check
              </span>
            ) : null}
            {status.imaged > 0 ? (
              <span className="rounded bg-imaged-soft px-1.5 font-medium text-imaged">
                {status.encrypted
                  ? "Protected · as images"
                  : `${status.imaged} as image`}
              </span>
            ) : null}
          </span>
          {status.busy ? (
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-desk">
              <span
                className="block h-full rounded-full bg-registry transition-[width] duration-300"
                style={{ width: `${Math.max(6, status.progress * 100)}%` }}
              />
            </span>
          ) : null}
        </button>
      </div>
      {(status.failed || status.locked) && (
        <div className="-mt-1 pb-2.5 pl-8">
          <Button
            size="xs"
            variant="outline"
            onClick={() => retrySource((status.failed ?? status.locked)!.id)}
          >
            {status.locked ? <KeyRound /> : <RotateCw />}
            {status.locked ? "Enter password" : "Try again"}
          </Button>
        </div>
      )}
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Options for ${doc.title}`}
              />
            }
          >
            <MoreHorizontal />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onClick={() => setEditing(true)}>
              <Pencil /> Rename
            </MenuItem>
            {tool === "bundle" ? (
              doc.role === "cover" ? (
                <MenuItem onClick={() => setRole(tool, doc.id, "document")}>
                  <BookOpen /> Make it an authority
                </MenuItem>
              ) : (
                <MenuItem onClick={() => setRole(tool, doc.id, "cover")}>
                  <BookOpen /> Use as cover &amp; index
                </MenuItem>
              )
            ) : null}
            <MenuSeparator />
            <MenuItem destructive onClick={() => removeDoc(tool, doc.id)}>
              <Trash2 /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {marker ? <span className="index-tab tabular">{marker}</span> : null}
    </div>
  )
}

export function Binder({ tool }: { tool: Tool }) {
  const docs = useStore((s) => s.workspaces[tool].docs)
  const settings = useStore((s) => s.workspaces.bundle.settings)
  const activeId = useStore((s) => s.selection[tool].docId)
  const cover =
    tool === "bundle" ? (docs.find((d) => d.role === "cover") ?? null) : null
  const rest = docs.filter((d) => d.role !== "cover")
  const totalPages = docs.reduce((n, d) => n + d.items.length, 0)
  const [coverHover, setCoverHover] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = rest.map((d) => d.id)
    reorderDocs(
      tool,
      arrayMove(
        ids,
        ids.indexOf(String(active.id)),
        ids.indexOf(String(over.id))
      )
    )
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-rule bg-[#f4f6f8]">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <h2 className="text-[13px] font-semibold">
            {tool === "bundle" ? "Authorities" : "Files"}
          </h2>
          <p className="tabular text-xs text-ink-soft">
            {rest.length}{" "}
            {tool === "bundle"
              ? rest.length === 1
                ? "authority"
                : "authorities"
              : rest.length === 1
                ? "file"
                : "files"}{" "}
            · {totalPages} pages
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="List options"
                />
              }
            >
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onClick={() => sortDocsByName(tool)}>
                <ArrowDownAZ /> Sort by file number
              </MenuItem>
            </MenuContent>
          </Menu>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void pickPdfs().then((f) => {
                if (f.length) void addFiles(tool, f)
              })
            }
          >
            <Plus /> Add
          </Button>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto pb-6 pl-3">
        {tool === "bundle" ? (
          <div className="mb-4">
            <p className="mb-1.5 pl-1 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
              Cover &amp; index
            </p>
            {cover ? (
              <DocRow
                tool={tool}
                doc={cover}
                marker={null}
                active={cover.id === activeId}
                sortable={false}
              />
            ) : (
              <button
                type="button"
                data-drop-cover
                onDragEnter={() => setCoverHover(true)}
                onDragLeave={() => setCoverHover(false)}
                onDrop={() => setCoverHover(false)}
                onClick={() =>
                  void pickPdfs(false).then((f) => {
                    if (f.length) void addFiles(tool, f, "cover")
                  })
                }
                className={cn(
                  "mr-14 flex w-[calc(100%-3.5rem)] flex-col items-start rounded-md border border-dashed px-3 py-3 text-left text-sm transition-colors",
                  coverHover
                    ? "relative z-50 border-registry bg-registry-soft text-registry"
                    : "border-ink-soft/40 text-ink-soft hover:border-registry hover:text-registry"
                )}
              >
                <span className="font-medium">Add cover &amp; index</span>
                <span className="text-xs opacity-80">
                  Optional · goes first, before TAB-1
                </span>
              </button>
            )}
            <p className="mt-4 mb-1.5 pl-1 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
              Authorities
            </p>
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rest.map((d) => d.id)}
            strategy={verticalListSortingStrategy}
          >
            {rest.map((doc, i) => (
              <DocRow
                key={doc.id}
                tool={tool}
                doc={doc}
                marker={
                  tool === "bundle"
                    ? tabLabel(settings.tabLabel, i + 1)
                    : String(i + 1)
                }
                active={doc.id === activeId}
                sortable
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </aside>
  )
}
