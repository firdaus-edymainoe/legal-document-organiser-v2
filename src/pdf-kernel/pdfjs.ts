import type { PDFDocumentProxy } from "pdfjs-dist"

type Pdfjs = typeof import("pdfjs-dist")

let pdfjsPromise: Promise<Pdfjs> | null = null

function isNodeRuntime(): boolean {
  const global = globalThis as { WorkerGlobalScope?: unknown; window?: unknown }
  const inBrowserMain = typeof global.window !== "undefined"
  const inWorker = typeof global.WorkerGlobalScope !== "undefined"
  return !inBrowserMain && !inWorker
}

export async function getPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = loadPdfjs()
  }
  return pdfjsPromise
}

async function loadPdfjs(): Promise<Pdfjs> {
  if (isNodeRuntime()) {
    const pdfjs = (await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    )) as unknown as Pdfjs
    const { createRequire } = await import("node:module")
    const { pathToFileURL } = await import("node:url")
    const require = createRequire(import.meta.url)
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
    ).href
    return pdfjs
  }

  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()
  return pdfjs
}

export async function destroyPdf(doc: PDFDocumentProxy | unknown): Promise<void> {
  try {
    await (doc as { destroy?: () => Promise<void> }).destroy?.()
  } catch {
    // Ignore teardown errors.
  }
}
