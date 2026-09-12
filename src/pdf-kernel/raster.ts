import { PDFDocument } from "pdf-lib"

import { A4, type LandscapePolicy } from "./types"
import { SAVE_OPTIONS } from "./unlock"
import { getPdfjs, destroyPdf } from "./pdfjs"
import { displayedSize, normalizeRotation } from "./geometry"

const DEFAULT_DPI = 150

type RasterCanvas = {
  width: number
  height: number
  getContext: (type: "2d") => CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  convertToBlob?: (opts: { type: string }) => Promise<Blob>
  toDataURL?: (type: string) => string
}

function makeCanvas(width: number, height: number): RasterCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as RasterCanvas
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new Error("No canvas implementation available for raster fallback")
}

async function canvasPng(canvas: RasterCanvas): Promise<Uint8Array> {
  if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: "image/png" })
    return new Uint8Array(await blob.arrayBuffer())
  }
  if (canvas.toDataURL) {
    const dataUrl = canvas.toDataURL("image/png")
    const base64 = dataUrl.split(",")[1] ?? ""
    const binary = atob(base64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }
  throw new Error("Cannot export canvas to PNG")
}

/** Rasterize every page onto portrait A4. Last-resort fallback only. */
export async function rasterizePdfToA4(
  bytes: Uint8Array,
  _policy: LandscapePolicy,
  dpi = DEFAULT_DPI,
): Promise<Uint8Array> {
  const pdfjs = await getPdfjs()
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    verbosity: 0,
  })
  const pdf = await loadingTask.promise
  const out = await PDFDocument.create()
  const targetW = Math.round((A4.widthPt / 72) * dpi)
  const targetH = Math.round((A4.heightPt / 72) * dpi)

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const sourceRotation = normalizeRotation(page.rotate)
      const viewport = page.getViewport({ scale: 1, rotation: sourceRotation })
      const displayed = displayedSize(viewport.width, viewport.height, 0)
      const scale = Math.min(targetW / displayed.width, targetH / displayed.height)
      const draw = page.getViewport({ scale, rotation: sourceRotation })
      const src = makeCanvas(Math.ceil(draw.width), Math.ceil(draw.height))
      const srcCtx = src.getContext("2d")
      if (!srcCtx) throw new Error("2d context unavailable")
      srcCtx.fillStyle = "#ffffff"
      srcCtx.fillRect(0, 0, src.width, src.height)
      await page.render({
        canvasContext: srcCtx as CanvasRenderingContext2D,
        viewport: draw,
        canvas: src as unknown as HTMLCanvasElement,
      }).promise

      const dest = makeCanvas(targetW, targetH)
      const destCtx = dest.getContext("2d")
      if (!destCtx) throw new Error("2d context unavailable")
      destCtx.fillStyle = "#ffffff"
      destCtx.fillRect(0, 0, targetW, targetH)
      const dx = Math.floor((targetW - src.width) / 2)
      const dy = Math.floor((targetH - src.height) / 2)
      destCtx.drawImage(src as unknown as CanvasImageSource, dx, dy)

      const png = await canvasPng(dest)
      const image = await out.embedPng(png)
      const outPage = out.addPage([A4.widthPt, A4.heightPt])
      outPage.drawImage(image, {
        x: 0,
        y: 0,
        width: A4.widthPt,
        height: A4.heightPt,
      })
    }
  } finally {
    await destroyPdf(pdf)
  }

  return out.save(SAVE_OPTIONS)
}
