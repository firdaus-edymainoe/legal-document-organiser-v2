import { useEffect, useRef } from "react"

import { cloneBytes, destroyPdf, getPdfjs } from "@/pdf-kernel"

type PdfPageCanvasProps = {
  bytes: Uint8Array | undefined
  pageIndex: number
  className?: string
}

let renderQueue: Promise<void> = Promise.resolve()

function enqueueRender(work: () => Promise<void>): Promise<void> {
  const run = renderQueue.then(work, work)
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function PdfPageCanvas({ bytes, pageIndex, className }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!bytes || !canvasRef.current) return
    let cancelled = false
    const canvas = canvasRef.current
    const data = cloneBytes(bytes)

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.fillStyle = "#fffcf7"
      ctx.fillRect(0, 0, canvas.width || 1, canvas.height || 1)
    }

    void enqueueRender(async () => {
      if (cancelled) return
      const pdfjs = await getPdfjs()
      if (cancelled) return
      const task = pdfjs.getDocument({ data, verbosity: 0 })
      try {
        const pdf = await task.promise
        try {
          if (cancelled) return
          const page = await pdf.getPage(pageIndex + 1)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const target = Math.min(900, canvas.parentElement?.clientWidth || 400)
          const scale = target / Math.max(base.width, 1)
          const viewport = page.getViewport({ scale })
          canvas.width = viewport.width
          canvas.height = viewport.height
          const context = canvas.getContext("2d")
          if (!context) return
          context.fillStyle = "#fffcf7"
          context.fillRect(0, 0, canvas.width, canvas.height)
          const renderTask = page.render({
            canvasContext: context,
            viewport,
            canvas,
          })
          try {
            await renderTask.promise
          } catch {
            renderTask.cancel()
          }
        } finally {
          await destroyPdf(pdf)
        }
      } catch {
        if (!cancelled) {
          try {
            task.destroy()
          } catch {
            /* ignore */
          }
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [bytes, pageIndex])

  return <canvas ref={canvasRef} className={className} />
}
