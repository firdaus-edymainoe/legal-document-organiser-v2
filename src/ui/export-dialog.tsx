import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { Download, FileText, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { closePdf, openPdf, type PDFDocumentProxy } from "@/engine/pdfjs"
import { canvasToBlob, freeCanvas, renderPage } from "@/engine/render"
import { downloadExport } from "@/state/export"
import { setExportState, useStore, type ExportFile } from "@/state/store"

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function PreviewPage({
  doc,
  number,
}: {
  doc: PDFDocumentProxy
  number: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let alive = true
    let made: string | null = null
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        try {
          const page = await doc.getPage(number)
          const canvas = await renderPage(page, {
            fit: { width: 360, height: 510 },
          })
          const blob = await canvasToBlob(canvas, "image/jpeg", 0.85)
          freeCanvas(canvas)
          page.cleanup()
          made = URL.createObjectURL(blob)
          if (alive) setUrl(made)
        } catch {
          // Leave the placeholder.
        }
      },
      { rootMargin: "300px" }
    )
    observer.observe(node)
    return () => {
      alive = false
      observer.disconnect()
      if (made) URL.revokeObjectURL(made)
    }
  }, [doc, number])
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        className="sheet aspect-[595/842] w-full overflow-hidden rounded-[2px]"
      >
        {url ? (
          <img
            src={url}
            alt={`Page ${number}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-ink-soft/50" />
          </div>
        )}
      </div>
      <span className="tabular text-[11px] text-ink-soft">{number}</span>
    </div>
  )
}

function Preview({ file }: { file: ExportFile }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    let opened: PDFDocumentProxy | null = null
    openPdf(file.bytes).then(
      ({ doc }) => {
        opened = doc
        if (alive) setDoc(doc)
        else void closePdf(doc)
      },
      () => alive && setError(true)
    )
    return () => {
      alive = false
      void closePdf(opened)
    }
  }, [file])
  if (error)
    return (
      <p className="p-6 text-sm text-destructive">
        The exported file could not be previewed.
      </p>
    )
  if (!doc) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-ink-soft" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-4 gap-y-5 p-5">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PreviewPage key={i} doc={doc} number={i + 1} />
      ))}
    </div>
  )
}

export function ExportDialog() {
  const state = useStore((s) => s.exportState)
  const [active, setActive] = useState(0)
  const close = () => {
    setActive(0)
    setExportState({ phase: "idle" })
  }
  const open = state.phase !== "idle"
  const wide = state.phase === "done"

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && state.phase !== "running" && close()}
    >
      <DialogContent
        showCloseButton={state.phase !== "running"}
        className={cn(
          wide ? "flex h-[86vh] flex-col gap-0 p-0 sm:max-w-5xl" : "sm:max-w-md"
        )}
      >
        {state.phase === "running" ? (
          <>
            <DialogHeader>
              <DialogTitle>Preparing your PDF</DialogTitle>
              <DialogDescription>{state.step}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <Loader2 className="size-4 animate-spin text-registry" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-desk">
                <div
                  className="h-full bg-registry transition-[width]"
                  style={{
                    width: `${state.total ? Math.max(4, (state.done / state.total) * 100) : 4}%`,
                  }}
                />
              </div>
              <span className="tabular text-xs text-ink-soft">
                {state.done}/{state.total}
              </span>
            </div>
          </>
        ) : state.phase === "done" ? (
          <>
            <DialogHeader className="border-b border-rule px-5 py-4">
              <DialogTitle className="font-display text-lg">
                Check before you download
              </DialogTitle>
              <DialogDescription>
                This is the exported file exactly as it will be saved.
              </DialogDescription>
            </DialogHeader>
            {state.files.length > 1 ? (
              <div className="flex gap-1 overflow-x-auto border-b border-rule px-4 py-2">
                {state.files.map((f, i) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => setActive(i)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-ink-soft",
                      active === i && "bg-desk text-ink"
                    )}
                  >
                    <FileText className="size-3.5" /> {f.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-desk">
              <Preview
                key={state.files[active]?.name}
                file={state.files[active] ?? state.files[0]}
              />
            </div>
            <DialogFooter className="m-0 items-center rounded-b-xl border-t border-rule bg-sheet px-5 py-3">
              <span className="tabular mr-auto text-xs text-ink-soft">
                {state.files.length === 1
                  ? `${state.files[0].name} · ${formatSize(state.files[0].bytes.length)}`
                  : `${state.files.length} files · saved together as a ZIP`}
              </span>
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              <Button
                onClick={() =>
                  downloadExport(
                    state.files,
                    `${state.tool === "bundle" ? "Bundle of Authorities" : "Fixed PDFs"}.zip`
                  )
                }
              >
                <Download /> Download
              </Button>
            </DialogFooter>
          </>
        ) : state.phase === "error" ? (
          <>
            <DialogHeader>
              <DialogTitle>Export could not finish</DialogTitle>
              <DialogDescription className="whitespace-pre-line">
                {state.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={close}>Close</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
