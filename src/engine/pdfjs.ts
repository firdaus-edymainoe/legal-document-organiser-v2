import type * as PdfjsLib from "pdfjs-dist"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

export type { PDFDocumentProxy, PDFPageProxy }

let lib: Promise<typeof PdfjsLib> | null = null

export function pdfjs(): Promise<typeof PdfjsLib> {
  if (!lib) {
    lib = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = workerUrl
      return mod
    })
  }
  return lib
}

function assetBase(): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href
}

export function pdfjsAssets() {
  const base = assetBase()
  return {
    wasmUrl: `${base}wasm/`,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    iccUrl: `${base}iccs/`,
  }
}

export class PasswordCancelled extends Error {
  constructor() {
    super("A password is needed to open this file")
    this.name = "PasswordCancelled"
  }
}

export type PasswordAsk = (incorrect: boolean) => Promise<string | null>

/**
 * Open a PDF with pdf.js. pdf.js takes ownership of the buffer it is given,
 * so the caller's bytes are copied. `askPassword` is called for protected
 * files; returning null cancels.
 */
export async function openPdf(
  bytes: Uint8Array,
  askPassword?: PasswordAsk,
  knownPassword?: string
): Promise<{ doc: PDFDocumentProxy; password?: string }> {
  const mod = await pdfjs()
  const task = mod.getDocument({
    data: bytes.slice(),
    ...pdfjsAssets(),
    password: knownPassword,
  })
  let used = knownPassword
  let cancelled = false
  task.onPassword = (update: (password: string) => void, reason: number) => {
    const incorrect = reason === mod.PasswordResponses.INCORRECT_PASSWORD
    if (!askPassword) {
      cancelled = true
      void task.destroy()
      return
    }
    void askPassword(incorrect).then((password) => {
      if (password === null) {
        cancelled = true
        void task.destroy()
        return
      }
      used = password
      update(password)
    })
  }
  try {
    const doc = await task.promise
    return { doc, password: used }
  } catch (err) {
    if (cancelled) throw new PasswordCancelled()
    throw err
  }
}

export async function closePdf(
  doc: PDFDocumentProxy | null | undefined
): Promise<void> {
  if (!doc) return
  try {
    // PDFDocumentProxy.destroy() was removed in pdf.js v6; destroy the task.
    await doc.loadingTask.destroy()
  } catch {
    // Already gone.
  }
}

/** Annotations drawn on canvas; combined with the "print" intent this matches the export. */
export async function annotationModeEnable(): Promise<number> {
  return (await pdfjs()).AnnotationMode.ENABLE
}
