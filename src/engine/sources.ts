import {
  closePdf,
  openPdf,
  PasswordCancelled,
  type PDFDocumentProxy,
} from "./pdfjs"

/**
 * In-memory registry of source files and their open pdf.js documents.
 * One pdf.js document per file, shared by thumbnails, previews, analysis and
 * export, and destroyed when the file is removed.
 */

type Entry = {
  name: string
  bytes: Uint8Array
  doc: Promise<PDFDocumentProxy> | null
  password?: string
}

const registry = new Map<string, Entry>()

export type PasswordRequest = (
  fileName: string,
  incorrect: boolean
) => Promise<string | null>

let passwordRequest: PasswordRequest = async () => null

export function setPasswordRequest(fn: PasswordRequest) {
  passwordRequest = fn
}

export function registerSource(id: string, name: string, bytes: Uint8Array) {
  const existing = registry.get(id)
  if (existing) {
    existing.bytes = bytes
    existing.name = name
    return
  }
  registry.set(id, { name, bytes, doc: null })
}

export function hasSource(id: string): boolean {
  return registry.has(id)
}

export function sourceBytes(id: string): Uint8Array {
  const entry = registry.get(id)
  if (!entry) throw new Error("This file is no longer loaded — add it again")
  return entry.bytes
}

export function openSource(id: string): Promise<PDFDocumentProxy> {
  const entry = registry.get(id)
  if (!entry)
    return Promise.reject(
      new Error("This file is no longer loaded — add it again")
    )
  if (!entry.doc) {
    entry.doc = openPdf(
      entry.bytes,
      (incorrect) => passwordRequest(entry.name, incorrect),
      entry.password
    ).then(
      ({ doc, password }) => {
        entry.password = password
        return doc
      },
      (err) => {
        // Let a later attempt ask again.
        entry.doc = null
        throw err
      }
    )
  }
  return entry.doc
}

export async function releaseSource(id: string) {
  const entry = registry.get(id)
  registry.delete(id)
  if (entry?.doc) {
    try {
      await closePdf(await entry.doc)
    } catch {
      // Never opened.
    }
  }
}

export async function releaseAll() {
  await Promise.all([...registry.keys()].map((id) => releaseSource(id)))
}

export { PasswordCancelled }
