import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { FilePlus2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  addFiles,
  clearSelection,
  clickItem,
  deletePages,
  redo,
  rotatePages,
  selectAll,
  setTool,
  undo,
  useStore,
} from "@/state/store"
import type { Tool } from "@/state/types"

import { Binder } from "./binder"
import { filesFromDrop, isFileDrag, pickPdfs } from "./files"
import { Inspector } from "./inspector"
import { SheetGrid } from "./sheet-grid"

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(
    el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  )
}

function useShortcuts(tool: Tool) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (document.querySelector("[role=dialog]")) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo(tool)
        else undo(tool)
      } else if (mod && key === "y") {
        event.preventDefault()
        redo(tool)
      } else if (mod && key === "a") {
        event.preventDefault()
        selectAll(tool)
      } else if (!mod && (key === "delete" || key === "backspace")) {
        event.preventDefault()
        deletePages(tool)
      } else if (!mod && key === "r") {
        rotatePages(tool, event.shiftKey ? 270 : 90)
      } else if (!mod && key === "l") {
        rotatePages(tool, 270)
      } else if (key === "escape") {
        clearSelection(tool)
      } else if (!mod && (key === "arrowright" || key === "arrowleft")) {
        const state = useStore.getState()
        const sel = state.selection[tool]
        const doc = state.workspaces[tool].docs.find((d) => d.id === sel.docId)
        if (!doc || doc.items.length === 0) return
        event.preventDefault()
        const at = doc.items.findIndex((i) => i.id === sel.focusId)
        const next = Math.min(
          doc.items.length - 1,
          Math.max(0, (at < 0 ? 0 : at) + (key === "arrowright" ? 1 : -1))
        )
        clickItem(tool, doc.items[next].id, event.shiftKey ? "range" : "single")
        document
          .querySelector(`[data-item-id="${doc.items[next].id}"]`)
          ?.scrollIntoView({ block: "nearest" })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tool])
}

function EmptyWorkspace({ tool }: { tool: Tool }) {
  const bundle = tool === "bundle"
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-xl text-center">
        <div className="sheet mx-auto flex aspect-[1/1.414] w-28 items-center justify-center rounded-sm">
          <FilePlus2 className="size-8 text-registry" strokeWidth={1.5} />
        </div>
        <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">
          {bundle ? "Start a bundle of authorities" : "Fix and combine PDFs"}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {bundle
            ? "Drop the authorities here. Files numbered like “1. …”, “2. …” or “A1”, “A2” are put in that order. Add the cover and index next."
            : "Drop the PDFs here. Each page is fitted to A4 and turned the right way up; you can adjust any page before saving."}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button
            size="lg"
            className="h-10 px-4"
            onClick={() =>
              void pickPdfs().then((f) => {
                if (f.length) void addFiles(tool, f)
              })
            }
          >
            <Upload />
            {bundle ? "Choose authorities" : "Choose PDFs"}
          </Button>
          {bundle ? (
            <Button
              size="lg"
              variant="outline"
              className="h-10 px-4"
              onClick={() =>
                void pickPdfs(false).then((f) => {
                  if (f.length) void addFiles(tool, f, "cover")
                })
              }
            >
              Add cover &amp; index
            </Button>
          ) : null}
        </div>
        <p className="mt-6 text-sm text-ink-soft">
          or drop files anywhere in this window
        </p>
      </div>
    </div>
  )
}

export function Workspace({ tool }: { tool: Tool }) {
  const docs = useStore((s) => s.workspaces[tool].docs)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    setTool(tool)
  }, [tool])
  useShortcuts(tool)

  return (
    <div
      className="relative h-full"
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (isFileDrag(e)) e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        const files = filesFromDrop(e)
        if (!files.length) return
        const onCover = (e.target as HTMLElement).closest("[data-drop-cover]")
        void addFiles(
          tool,
          files,
          tool === "bundle" && onCover ? "cover" : "document"
        )
      }}
    >
      {docs.length === 0 ? (
        <EmptyWorkspace tool={tool} />
      ) : (
        <>
          <div className="hidden h-full grid-cols-[248px_minmax(0,1fr)_300px] md:grid xl:grid-cols-[288px_minmax(0,1fr)_360px]">
            <Binder tool={tool} />
            <SheetGrid tool={tool} />
            <Inspector tool={tool} />
          </div>
          <div className="flex h-full items-center justify-center p-8 text-center md:hidden">
            <p className="max-w-xs text-sm text-ink-soft">
              Page editing needs a wider window. Open this on a laptop or
              desktop, or widen the window.
            </p>
          </div>
        </>
      )}
      <div
        aria-hidden={!dragging}
        className={cn(
          "pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-registry bg-registry-soft/80 text-registry backdrop-blur-[2px] transition-opacity",
          dragging ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="text-center">
          <Upload className="mx-auto size-8" />
          <p className="mt-3 font-display text-xl font-semibold">
            {tool === "bundle" ? "Drop to add authorities" : "Drop to add PDFs"}
          </p>
        </div>
      </div>
    </div>
  )
}
