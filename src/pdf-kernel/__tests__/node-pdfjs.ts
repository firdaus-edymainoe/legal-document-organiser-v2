import { createRequire } from "node:module"
import path from "node:path"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

import type { GrayImage } from "../orientation/image"
import { textOrientation, type TextOrientation } from "../orientation/text"

const require = createRequire(import.meta.url)
const { createCanvas } =
  require("@napi-rs/canvas") as typeof import("@napi-rs/canvas")
const root = path.dirname(require.resolve("pdfjs-dist/package.json"))
const asset = (name: string) => `${path.join(root, name)}/`

type Doc = Awaited<ReturnType<typeof getDocument>["promise"]>

export async function openPdf(bytes: Uint8Array): Promise<Doc> {
  return getDocument({
    data: bytes.slice(),
    verbosity: 0,
    wasmUrl: asset("wasm"),
    standardFontDataUrl: asset("standard_fonts"),
    cMapUrl: asset("cmaps"),
    iccUrl: asset("iccs"),
  }).promise
}

export async function closePdf(doc: Doc): Promise<void> {
  await doc.loadingTask.destroy()
}

export async function pageText(
  doc: Doc,
  pageNumber: number
): Promise<TextOrientation> {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  return textOrientation(content.items as never[], page.rotate)
}

export async function pageStrings(doc: Doc, pageNumber: number) {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  return (content.items as { str: string; transform: number[] }[])
    .filter((item) => item.str.trim())
    .map((item) => {
      const [x, y] = viewport.convertToViewportPoint(
        item.transform[4],
        item.transform[5]
      )
      return {
        str: item.str,
        x,
        y,
        width: viewport.width,
        height: viewport.height,
      }
    })
}

/** Render a page as displayed, grayscale, longest side `longSide` px. */
export async function renderGray(
  doc: Doc,
  pageNumber: number,
  longSide = 1200
): Promise<GrayImage> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({
    scale: longSide / Math.max(base.width, base.height),
  })
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  )
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvasContext: ctx as never,
    canvas: canvas as never,
    viewport,
  }).promise
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const data = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < data.length; i++) {
    data[i] =
      (rgba[i * 4] * 0.299 +
        rgba[i * 4 + 1] * 0.587 +
        rgba[i * 4 + 2] * 0.114) |
      0
  }
  return { width: canvas.width, height: canvas.height, data }
}

export async function renderRgbAt(
  doc: Doc,
  pageNumber: number,
  xFrac: number,
  yFrac: number
): Promise<[number, number, number]> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 0.5 })
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  )
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvasContext: ctx as never,
    canvas: canvas as never,
    viewport,
  }).promise
  const x = Math.floor(canvas.width * xFrac)
  const y = Math.floor(canvas.height * yFrac)
  const px = ctx.getImageData(x, y, 1, 1).data
  return [px[0], px[1], px[2]]
}
