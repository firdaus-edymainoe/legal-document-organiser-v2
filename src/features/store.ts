import { create } from "zustand"
import { toast } from "sonner"

import {
  addRotation,
  isPdfFile,
  planPage,
  sortByFilename,
} from "@/pdf-kernel"
import type { ComposeDocument, IngestResult, LandscapePolicy, Rotation } from "@/pdf-kernel"
import { pdfWorker } from "@/pdf-kernel/worker/client"
import {
  clearPersisted,
  deleteDocBytes,
  loadPersistedJob,
  persistBytes,
  persistJob,
} from "@/persist/session"
import type { DocRecord, JobMode, JobSnapshot, PageMeta, PageView } from "./job-types"

const origBytes = new Map<string, Uint8Array>()
const autoBytes = new Map<string, Uint8Array>()
const currentBytes = new Map<string, Uint8Array>()
let pendingFiles: File[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null

const defaultSettings = {
  combine: {
    tabDividers: false,
    pageNumbers: true,
    startNumber: 1,
    numberCover: false,
  },
  bundle: {
    tabDividers: true,
    pageNumbers: true,
    startNumber: 1,
    numberCover: false,
  },
} as const

function policyFor(mode: JobMode): LandscapePolicy {
  return mode === "bundle" ? "rotate-ccw" : "letterbox"
}

function newId(): string {
  return crypto.randomUUID()
}

function schedulePersist(job: JobSnapshot) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistJob(job).catch(() => {
      toast.error("Could not save this session")
    })
  }, 400)
}

function snapshotFrom(state: JobState): JobSnapshot {
  return {
    mode: state.mode,
    docs: state.docs,
    selectedDocId: state.selectedDocId,
    selectedPage: state.selectedPage,
    autofixEnabled: state.autofixEnabled,
    pageView: state.pageView,
    settings: state.settings,
    pendingNames: pendingFiles.map((file) => file.name),
    updatedAt: Date.now(),
  }
}

function pagesFromIngest(result: IngestResult): PageMeta[] {
  return result.analysis.pages.map((analysis, index) => {
    const plan = result.plans[index]
    return {
      index: analysis.index,
      analysis,
      userExtra: 0,
      color: null,
      autoFixed: plan?.autoFixed ?? false,
      userOverride: false,
      issues: analysis.issues,
    }
  })
}

export function getDocBytes(
  id: string,
  kind: "orig" | "auto" | "current",
): Uint8Array | undefined {
  if (kind === "orig") return origBytes.get(id)
  if (kind === "auto") return autoBytes.get(id)
  return currentBytes.get(id)
}

type JobState = {
  ready: boolean
  busy: boolean
  mode: JobMode
  docs: DocRecord[]
  selectedDocId: string | null
  selectedPage: number
  autofixEnabled: boolean
  pageView: PageView
  settings: JobSnapshot["settings"]
  pendingNames: string[]
  hydrate: () => Promise<void>
  setPendingFiles: (files: File[]) => void
  takePendingFiles: () => File[]
  setMode: (mode: JobMode) => void
  addFiles: (files: File[], role?: "cover" | "doc") => Promise<void>
  removeDoc: (id: string) => Promise<void>
  selectDoc: (id: string) => void
  selectPage: (index: number) => void
  setAutofixEnabled: (on: boolean) => void
  setPageView: (view: PageView) => void
  rotateSelected: (delta: Rotation) => Promise<void>
  resetSelected: () => Promise<void>
  setPageNumbers: (on: boolean) => void
  setStartNumber: (n: number) => void
  setTabDividers: (on: boolean) => void
  reorderDocs: (ids: string[]) => void
  resetJob: () => Promise<void>
  download: () => Promise<void>
  preview: () => Promise<void>
}

export const useJob = create<JobState>((set, get) => ({
  ready: false,
  busy: false,
  mode: "combine",
  docs: [],
  selectedDocId: null,
  selectedPage: 0,
  autofixEnabled: true,
  pageView: "auto",
  settings: { ...defaultSettings.combine },
  pendingNames: [],

  hydrate: async () => {
    try {
      const { job, bytes } = await loadPersistedJob()
      for (const row of bytes) {
        const [kind, id] = row.key.split(":")
        if (!id || row.value.byteLength === 0) continue
        if (kind === "orig") origBytes.set(id, row.value)
        if (kind === "auto") autoBytes.set(id, row.value)
        if (kind === "current") currentBytes.set(id, row.value)
      }
      if (job) {
        const docs = job.docs.filter((doc) => origBytes.has(doc.id))
        if (job.docs.some((doc) => !origBytes.has(doc.id))) {
          toast.message("Some files could not be restored")
        }
        set({
          ready: true,
          mode: job.mode,
          docs,
          selectedDocId: docs.find((d) => d.id === job.selectedDocId)?.id ?? docs[0]?.id ?? null,
          selectedPage: job.selectedPage,
          autofixEnabled: job.autofixEnabled,
          pageView: job.pageView,
          settings: job.settings,
        })
        return
      }
    } catch {
      toast.error("Could not open saved session")
    }
    set({ ready: true })
  },

  setPendingFiles: (files) => {
    pendingFiles = files.filter(isPdfFile)
    set({ pendingNames: pendingFiles.map((file) => file.name) })
  },

  takePendingFiles: () => {
    const files = pendingFiles
    pendingFiles = []
    set({ pendingNames: [] })
    return files
  },

  setMode: (mode) => {
    const state = get()
    if (state.mode === mode) return
    const policy = policyFor(mode)
    set({
      mode,
      settings: { ...defaultSettings[mode] },
    })
    const needsReplan = state.docs.some(
      (doc) => doc.status === "ready" && doc.landscapePolicy !== policy,
    )
    if (needsReplan) {
      void replanDocs(get, set, policy)
      return
    }
    schedulePersist(
      snapshotFrom({ ...get(), mode, settings: { ...defaultSettings[mode] } }),
    )
  },

  addFiles: async (files, role = "doc") => {
    const pdfs = files.filter(isPdfFile)
    if (pdfs.length === 0) {
      toast.error("Drop PDF files only")
      return
    }
    const mode = get().mode
    const policy = policyFor(mode)
    if (role === "cover") {
      const oldCovers = get().docs.filter((doc) => doc.role === "cover")
      for (const old of oldCovers) {
        origBytes.delete(old.id)
        autoBytes.delete(old.id)
        currentBytes.delete(old.id)
        await deleteDocBytes(old.id)
      }
      set((state) => ({ docs: state.docs.filter((doc) => doc.role !== "cover") }))
    }
    set({ busy: true })
    try {
      for (const file of pdfs) {
        const id = newId()
        const placeholder: DocRecord = {
          id,
          fileName: file.name,
          role: role === "cover" || /^cover/i.test(file.name) ? "cover" : "doc",
          pageCount: 0,
          status: "scanning",
          imageOnly: false,
          pages: [],
          landscapePolicy: policy,
        }
        set((state) => ({ docs: mergeDocs(state.docs, placeholder, mode) }))
        const bytes = new Uint8Array(await file.arrayBuffer())
        set((state) => ({
          docs: state.docs.map((doc) =>
            doc.id === id ? { ...doc, status: "autofixing" } : doc,
          ),
        }))
        try {
          const result = await pdfWorker().ingest(bytes, policy)
          origBytes.set(id, result.unlocked)
          autoBytes.set(id, result.canonical)
          currentBytes.set(id, result.canonical)
          await Promise.all([
            persistBytes(id, "orig", result.unlocked),
            persistBytes(id, "auto", result.canonical),
            persistBytes(id, "current", result.canonical),
          ])
          const record: DocRecord = {
            ...placeholder,
            pageCount: result.analysis.pageCount,
            status: "ready",
            imageOnly: result.imageOnly,
            pages: pagesFromIngest(result),
          }
          set((state) => ({
            docs: mergeDocs(
              state.docs.map((doc) => (doc.id === id ? record : doc)),
              record,
              mode,
            ),
            selectedDocId: state.selectedDocId ?? id,
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not read that PDF"
          toast.error(`${file.name}: ${message}`)
          set((state) => ({
            docs: state.docs.map((doc) =>
              doc.id === id ? { ...doc, status: "error", error: message } : doc,
            ),
          }))
        }
      }
      const next = snapshotFrom(get())
      schedulePersist(next)
    } finally {
      set({ busy: false })
    }
  },

  removeDoc: async (id) => {
    origBytes.delete(id)
    autoBytes.delete(id)
    currentBytes.delete(id)
    await deleteDocBytes(id)
    set((state) => {
      const docs = state.docs.filter((doc) => doc.id !== id)
      return {
        docs,
        selectedDocId:
          state.selectedDocId === id ? (docs[0]?.id ?? null) : state.selectedDocId,
      }
    })
    schedulePersist(snapshotFrom(get()))
  },

  selectDoc: (id) => set({ selectedDocId: id, selectedPage: 0, pageView: get().autofixEnabled ? (currentOverride(get(), id, 0) ? "manual" : "auto") : "original" }),

  selectPage: (index) => {
    const { selectedDocId, autofixEnabled } = get()
    set({
      selectedPage: index,
      pageView: autofixEnabled
        ? currentOverride(get(), selectedDocId, index)
          ? "manual"
          : "auto"
        : "original",
    })
  },

  setAutofixEnabled: (on) => {
    set({
      autofixEnabled: on,
      pageView: on ? "auto" : "original",
    })
    schedulePersist(snapshotFrom(get()))
  },

  setPageView: (view) => set({ pageView: view }),

  rotateSelected: async (delta) => {
    const state = get()
    const doc = state.docs.find((item) => item.id === state.selectedDocId)
    if (!doc || !state.autofixEnabled) return
    const orig = origBytes.get(doc.id)
    if (!orig) {
      toast.error("Missing bytes for this file")
      return
    }
    const pages = doc.pages.map((page) =>
      page.index === state.selectedPage
        ? {
            ...page,
            userExtra: addRotation(page.userExtra, delta),
            userOverride: true,
          }
        : page,
    )
    set({ busy: true, docs: state.docs.map((item) => (item.id === doc.id ? { ...doc, pages } : item)), pageView: "manual" })
    try {
      const plans = pages.map((page) => ({
        ...planPage(page.analysis, doc.landscapePolicy, page.userExtra),
        color: page.color,
        userOverride: page.userOverride,
      }))
      const next = await pdfWorker().normalize(orig, plans)
      currentBytes.set(doc.id, next)
      await persistBytes(doc.id, "current", next)
      schedulePersist(snapshotFrom(get()))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rotate that page")
    } finally {
      set({ busy: false })
    }
  },

  resetSelected: async () => {
    const state = get()
    const doc = state.docs.find((item) => item.id === state.selectedDocId)
    if (!doc) return
    const orig = origBytes.get(doc.id)
    if (!orig) return
    const pages = doc.pages.map((page) =>
      page.index === state.selectedPage
        ? { ...page, userExtra: 0 as Rotation, userOverride: false }
        : page,
    )
    set({ busy: true, pageView: "auto", docs: state.docs.map((item) => (item.id === doc.id ? { ...doc, pages } : item)) })
    try {
      const plans = pages.map((page) =>
        planPage(page.analysis, doc.landscapePolicy, page.userExtra),
      )
      const next = await pdfWorker().normalize(orig, plans)
      currentBytes.set(doc.id, next)
      await persistBytes(doc.id, "current", next)
      schedulePersist(snapshotFrom(get()))
    } finally {
      set({ busy: false })
    }
  },

  setPageNumbers: (on) => {
    set((state) => ({ settings: { ...state.settings, pageNumbers: on } }))
    schedulePersist(snapshotFrom(get()))
  },
  setStartNumber: (n) => {
    set((state) => ({ settings: { ...state.settings, startNumber: Math.max(1, n) } }))
    schedulePersist(snapshotFrom(get()))
  },
  setTabDividers: (on) => {
    set((state) => ({ settings: { ...state.settings, tabDividers: on } }))
    schedulePersist(snapshotFrom(get()))
  },
  reorderDocs: (ids) => {
    set((state) => {
      const cover = state.docs.filter((doc) => doc.role === "cover")
      const byId = new Map(state.docs.filter((doc) => doc.role !== "cover").map((doc) => [doc.id, doc]))
      const docs = [...cover, ...ids.map((id) => byId.get(id)).filter(Boolean)] as DocRecord[]
      return { docs }
    })
    schedulePersist(snapshotFrom(get()))
  },

  resetJob: async () => {
    origBytes.clear()
    autoBytes.clear()
    currentBytes.clear()
    pendingFiles = []
    await clearPersisted()
    set({
      docs: [],
      selectedDocId: null,
      selectedPage: 0,
      autofixEnabled: true,
      pageView: "auto",
      pendingNames: [],
    })
  },

  download: async () => {
    set({ busy: true })
    try {
      const bytes = await composeCurrent(get())
      saveBlob(bytes, filenameFor(get()))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the PDF")
    } finally {
      set({ busy: false })
    }
  },

  preview: async () => {
    set({ busy: true })
    try {
      const bytes = await composeCurrent(get())
      const url = URL.createObjectURL(new Blob([toBlobPart(bytes)], { type: "application/pdf" }))
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not preview the PDF")
    } finally {
      set({ busy: false })
    }
  },
}))

function currentOverride(state: JobState, id: string | null, pageIndex: number): boolean {
  if (!id) return false
  const doc = state.docs.find((item) => item.id === id)
  return Boolean(doc?.pages[pageIndex]?.userOverride)
}

function mergeDocs(existing: DocRecord[], incoming: DocRecord, mode: JobMode): DocRecord[] {
  const has = existing.some((doc) => doc.id === incoming.id)
  const next = has
    ? existing.map((doc) => (doc.id === incoming.id ? incoming : doc))
    : [...existing, incoming]
  if (mode === "bundle") {
    const covers = next.filter((doc) => doc.role === "cover")
    const docs = sortByFilename(next.filter((doc) => doc.role !== "cover"))
    return [...covers, ...docs]
  }
  return next
}

async function replanDocs(
  get: () => JobState,
  set: (
    partial:
      | Partial<JobState>
      | ((state: JobState) => Partial<JobState>),
  ) => void,
  policy: LandscapePolicy,
) {
  set({ busy: true })
  try {
    for (const doc of get().docs) {
      if (doc.status !== "ready") continue
      const orig = origBytes.get(doc.id)
      if (!orig) continue
      const pages = doc.pages.map((page) => {
        const planned = planPage(page.analysis, policy, 0)
        return {
          ...page,
          userExtra: 0 as Rotation,
          userOverride: false,
          autoFixed: planned.autoFixed,
        }
      })
      const next = await pdfWorker().normalize(
        orig,
        pages.map((page) => planPage(page.analysis, policy, 0)),
      )
      autoBytes.set(doc.id, next)
      currentBytes.set(doc.id, next)
      await Promise.all([
        persistBytes(doc.id, "auto", next),
        persistBytes(doc.id, "current", next),
      ])
      set((state) => ({
        docs: state.docs.map((item) =>
          item.id === doc.id
            ? { ...item, pages, landscapePolicy: policy, status: "ready" }
            : item,
        ),
        pageView: "auto",
      }))
    }
    schedulePersist(snapshotFrom(get()))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not apply this tool's page policy")
  } finally {
    set({ busy: false })
  }
}

function filenameFor(state: JobState): string {
  return state.mode === "bundle" ? "bundle-of-authorities.pdf" : "combined.pdf"
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  return Uint8Array.from(bytes) as BlobPart
}

function saveBlob(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([toBlobPart(bytes)], { type: "application/pdf" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function composeCurrent(state: JobState): Promise<Uint8Array> {
  const docs = state.docs.filter((doc) => doc.status === "ready")
  if (docs.length === 0) throw new Error("Add a PDF first")

  const coverRow = state.mode === "bundle" ? docs.find((doc) => doc.role === "cover") : undefined
  const body = docs.filter((doc) => doc.role !== "cover")
  const kind = state.autofixEnabled ? "current" : "orig"

  const toCompose = (doc: DocRecord): ComposeDocument => {
    const bytes = getDocBytes(doc.id, kind)
    if (!bytes) throw new Error(`Missing bytes for "${doc.fileName}"`)
    return { id: doc.id, fileName: doc.fileName, bytes, pageCount: doc.pageCount }
  }

  return pdfWorker().compose({
    cover: coverRow ? toCompose(coverRow) : null,
    documents: body.map(toCompose),
    settings: {
      ...state.settings,
      tabDividers: state.mode === "bundle" && state.settings.tabDividers,
    },
  })
}

export function jobStats(docs: DocRecord[]) {
  const pages = docs.flatMap((doc) => doc.pages)
  const autoFixed = pages.filter((page) => page.autoFixed && !page.userOverride).length
  const toCheck = pages.filter(
    (page) => page.issues.length > 0 && !page.autoFixed && !page.userOverride,
  ).length
  const overridden = pages.filter((page) => page.userOverride).length
  return { total: pages.length, autoFixed, toCheck, overridden }
}

export function tabNumber(docs: DocRecord[], id: string): number | null {
  const body = docs.filter((doc) => doc.role !== "cover")
  const index = body.findIndex((doc) => doc.id === id)
  return index >= 0 ? index + 1 : null
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.assign(window, {
    __legalE2E: {
      addFiles: (files: File[], role?: "cover" | "doc") =>
        useJob.getState().addFiles(files, role),
      resetJob: () => useJob.getState().resetJob(),
      rotate: (delta: Rotation) => useJob.getState().rotateSelected(delta),
      resetPage: () => useJob.getState().resetSelected(),
      selectDoc: (id: string) => useJob.getState().selectDoc(id),
      selectPage: (index: number) => useJob.getState().selectPage(index),
      setPageView: (view: PageView) => useJob.getState().setPageView(view),
      download: () => useJob.getState().download(),
      preview: () => useJob.getState().preview(),
      build: async () => {
        const bytes = await composeCurrent(useJob.getState())
        return {
          byteLength: bytes.byteLength,
          magic: String.fromCharCode(...Array.from(bytes.subarray(0, 5))),
        }
      },
      bytesMeta: (id: string, kind: "orig" | "auto" | "current") => {
        const bytes = getDocBytes(id, kind)
        if (!bytes) return null
        return {
          byteLength: bytes.byteLength,
          head: Array.from(bytes.subarray(0, 16)),
        }
      },
      snapshot: () => {
        const state = useJob.getState()
        return {
          ready: state.ready,
          busy: state.busy,
          mode: state.mode,
          selectedDocId: state.selectedDocId,
          selectedPage: state.selectedPage,
          autofixEnabled: state.autofixEnabled,
          pageView: state.pageView,
          docs: state.docs.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            role: doc.role,
            status: doc.status,
            pageCount: doc.pageCount,
            error: doc.error,
            landscapePolicy: doc.landscapePolicy,
            autoFixed: doc.pages.filter((page) => page.autoFixed).length,
            issues: doc.pages.flatMap((page) => page.issues),
          })),
        }
      },
    },
  })
}
