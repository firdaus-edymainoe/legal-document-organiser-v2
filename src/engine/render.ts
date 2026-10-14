import { A4, addRotation, type GrayImage, type Rotation } from "@/pdf-kernel"

import { annotationModeEnable, type PDFPageProxy } from "./pdfjs"

export const SHEET_RATIO = A4.heightPt / A4.widthPt

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export function freeCanvas(canvas: HTMLCanvasElement) {
  // Safari keeps canvas memory until the size is zeroed.
  canvas.width = 0
  canvas.height = 0
}

/**
 * Render a page as a viewer shows it, turned a further `extra` degrees
 * clockwise, either at `scale` or fitted inside `fit`.
 */
export async function renderPage(
  page: PDFPageProxy,
  options: {
    extra?: Rotation
    scale?: number
    fit?: { width: number; height: number }
  }
): Promise<HTMLCanvasElement> {
  const rotation = addRotation(page.rotate, options.extra ?? 0)
  const base = page.getViewport({ scale: 1, rotation })
  let scale = options.scale ?? 1
  if (options.fit) {
    scale = Math.min(
      options.fit.width / base.width,
      options.fit.height / base.height
    )
  }
  const viewport = page.getViewport({ scale, rotation })
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  )
  const ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) throw new Error("Canvas is unavailable")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    annotationMode: await annotationModeEnable(),
    // Print intent: only printable annotations, as in the exported file.
    intent: "print",
  }).promise
  return canvas
}

export type SheetDrawing = {
  page: PDFPageProxy | null
  extra: Rotation
  color: string | null
  label?: string
}

/** Draw an output sheet (A4 portrait) the way the exported PDF will look. */
export async function renderSheet(
  drawing: SheetDrawing,
  width: number
): Promise<HTMLCanvasElement> {
  const height = Math.round(width * SHEET_RATIO)
  const sheet = createCanvas(width, height)
  const ctx = sheet.getContext("2d", { alpha: false })
  if (!ctx) throw new Error("Canvas is unavailable")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)

  if (drawing.page) {
    const pixelRatio = 1
    const content = await renderPage(drawing.page, {
      extra: drawing.extra,
      fit: { width: width * pixelRatio, height: height * pixelRatio },
    })
    const dx = (width - content.width) / 2
    const dy = (height - content.height) / 2
    ctx.drawImage(content, dx, dy)
    freeCanvas(content)
  }

  if (drawing.label) {
    let size = width * 0.09
    ctx.fillStyle = "#000000"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    do {
      ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`
      size -= 1
    } while (ctx.measureText(drawing.label).width > width * 0.84 && size > 6)
    ctx.fillText(drawing.label, width / 2, height / 2)
  }

  if (drawing.color && drawing.color.toLowerCase() !== "#ffffff") {
    ctx.globalCompositeOperation = "multiply"
    ctx.fillStyle = drawing.color
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = "source-over"
  }
  return sheet
}

export function toGray(canvas: HTMLCanvasElement): GrayImage {
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const data = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  }
  return { width: canvas.width, height: canvas.height, data }
}

/** Fit an already-rendered page into an A4 frame and return it as gray. */
export function frameGray(
  content: HTMLCanvasElement,
  width: number
): GrayImage {
  const height = Math.round(width * SHEET_RATIO)
  const frame = createCanvas(width, height)
  const ctx = frame.getContext("2d", { alpha: false })
  if (!ctx) throw new Error("Canvas is unavailable")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  const scale = Math.min(width / content.width, height / content.height)
  const w = content.width * scale
  const h = content.height * scale
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(content, (width - w) / 2, (height - h) / 2, w, h)
  const gray = toGray(frame)
  freeCanvas(frame)
  return gray
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.9
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not encode the page image")),
      type,
      quality
    )
  })
}

const RASTER_DPI = 200
const RASTER_MAX_PIXELS = 24_000_000

/**
 * Rasterise a page exactly as displayed (after /Rotate) to a JPEG. Used for
 * encrypted files and pages that do not survive a vector copy.
 */
export async function rasterisePage(
  page: PDFPageProxy
): Promise<{ image: Uint8Array; widthPx: number; heightPx: number }> {
  const base = page.getViewport({ scale: 1, rotation: page.rotate })
  let scale = RASTER_DPI / 72
  const pixels = base.width * base.height * scale * scale
  if (pixels > RASTER_MAX_PIXELS)
    scale = Math.sqrt(RASTER_MAX_PIXELS / (base.width * base.height))
  const canvas = await renderPage(page, { scale })
  try {
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9)
    return {
      image: new Uint8Array(await blob.arrayBuffer()),
      widthPx: canvas.width,
      heightPx: canvas.height,
    }
  } finally {
    freeCanvas(canvas)
  }
}
