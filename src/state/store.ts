import { create } from "zustand"
import { toast } from "sonner"

import { addRotation, sortByFilename, type Rotation } from "@/pdf-kernel"
import { analyzeSource, type PageAnalysis } from "@/engine/analyze"
import {
  openSource,
  PasswordCancelled,
  registerSource,
  releaseAll,
  releaseSource,
  setPasswordRequest,
} from "@/engine/sources"

import { newId } from "./ids"
import {
  clearSaved,
  deleteBytes,
  loadBytes,
  loadSaved,
  saveBytes,
  saveState,
} from "./persist"
import {
  DEFAULT_BUNDLE,
  DEFAULT_FIXER,
  type BundleSettings,
  type DocRecord,
  type DocRole,
  type FixerSettings,
  type PageItem,
  type SourceRecord,
  type Tool,
  type Workspaces,
} from "./types"

export type Selection = {
  docId: string | null
  itemIds: string[]
  focusId: string | null
}

type History = { past: Workspaces[Tool][]; future: Workspaces[Tool][] }

export type ExportFile = { name: string; bytes: Uint8Array }

export type ExportState =
  | { phase: "idle" }
  | { phase: "running"; step: string; done: number; total: number }
  | { phase: "done"; files: ExportFile[]; tool: Tool }
  | { phase: "error"; message: string }

export type PasswordPrompt = { fileName: string; incorrect: boolean }

/** A page the auto-fix turned, shown as it happens. */
export type AutoFix = {
  id: string
  sourceId: string
  pageIndex: number
  turn: Rotation
}

type State = {
  ready: boolean
  tool: Tool
  workspaces: Workspaces
  sources: Record<string, SourceRecord>
  selection: Record<Tool, Selection>
  history: Record<Tool, History>
  exportState: ExportState
  passwordPrompt: PasswordPrompt | null
  /** Newest first. Not persisted: it only describes the current analysis. */
  fixes: AutoFix[]
}

const emptySelection = (): Selection => ({
  docId: null,
  itemIds: [],
  focusId: null,
})

const initialWorkspaces = (): Workspaces => ({
  bundle: { docs: [], settings: { ...DEFAULT_BUNDLE } },
  fixer: { docs: [], settings: { ...DEFAULT_FIXER } },
})

export const useStore = create<State>(() => ({
  ready: false,
  tool: "bundle",
  workspaces: initialWorkspaces(),
  sources: {},
  selection: { bundle: emptySelection(), fixer: emptySelection() },
  history: {
    bundle: { past: [], future: [] },
    fixer: { past: [], future: [] },
  },
  exportState: { phase: "idle" },
  passwordPrompt: null,
  fixes: [],
}))

const set = useStore.setState
const get = useStore.getState

/* ───────────────────────── persistence ───────────────────────── */

let persistTimer: ReturnType<typeof setTimeout> | null = null
let storageWarned = false

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const { tool, workspaces, sources } = get()
    saveState({ version: 3, tool, workspaces, sources }).catch(() =>
      warnStorage()
    )
  }, 300)
}

function warnStorage() {
  if (storageWarned) return
  storageWarned = true
  toast.warning("This browser's storage is full", {
    description:
      "Your work is safe in this tab, but it will not be restored if you close it.",
  })
}

/* ───────────────────────── passwords ───────────────────────── */

let passwordResolve: ((value: string | null) => void) | null = null

setPasswordRequest((fileName, incorrect) => {
  return new Promise((resolve) => {
    passwordResolve = resolve
    set({ passwordPrompt: { fileName, incorrect } })
  })
})

export function answerPassword(password: string | null) {
  const resolve = passwordResolve
  passwordResolve = null
  set({ passwordPrompt: null })
  resolve?.(password)
}

/* ───────────────────────── analysis queue ───────────────────────── */

/** Files analysed at the same time. Each one is its own pdf.js document. */
const ANALYSIS_CONCURRENCY = 4
/** How many auto-fixes the activity line remembers. */
const FIX_LOG_LIMIT = 20

const queue: string[] = []
const running = new Set<string>()
const stopped = new Set<string>()

function patchSource(id: string, patch: Partial<SourceRecord>) {
  set((state) => {
    const current = state.sources[id]
    if (!current) return {}
    return { sources: { ...state.sources, [id]: { ...current, ...patch } } }
  })
}

function enqueue(id: string) {
  if (!queue.includes(id) && !running.has(id)) queue.push(id)
  pump()
}

function pump() {
  while (running.size < ANALYSIS_CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!
    running.add(id)
    void analyseOne(id).finally(() => {
      running.delete(id)
      schedulePersist()
      pump()
    })
  }
}

function recordFix(sourceId: string, page: PageAnalysis) {
  const fix: AutoFix = {
    id: newId(),
    sourceId,
    pageIndex: page.index,
    turn: page.autoRotate,
  }
  set((state) => ({ fixes: [fix, ...state.fixes].slice(0, FIX_LOG_LIMIT) }))
}

async function analyseOne(id: string) {
  if (!get().sources[id]) return
  patchSource(id, {
    status: "analyzing",
    progress: 0,
    error: undefined,
    analysis: undefined,
  })
  let lastUpdate = 0
  try {
    const analysis = await analyzeSource(id, {
      shouldStop: () => stopped.has(id) || !get().sources[id],
      onPage: (page, soFar) => {
        if (page.autoRotate !== 0) recordFix(id, page)
        // Throttled: pages can finish faster than the UI should repaint.
        const now = Date.now()
        if (now - lastUpdate > 150) {
          lastUpdate = now
          const done = soFar.pages.filter(Boolean).length
          patchSource(id, { progress: done / soFar.pageCount, analysis: soFar })
        }
      },
    })
    if (!get().sources[id]) return
    patchSource(id, { status: "ready", progress: 1, analysis })
    fillEmptyDocs(id, analysis.pageCount)
    const review = analysis.pages.filter((p) => p.detection.review).length
    if (review > 0) {
      const name = get().sources[id]?.fileName ?? "A file"
      toast.message(
        `${name}: ${review} page${review === 1 ? "" : "s"} to check`,
        {
          description: "Orientation could not be decided with confidence.",
        }
      )
    }
  } catch (err) {
    if (!get().sources[id] || stopped.has(id)) return
    if (err instanceof PasswordCancelled) {
      patchSource(id, {
        status: "locked",
        progress: 0,
        error: err.message,
        analysis: undefined,
      })
    } else {
      const message = err instanceof Error ? err.message : String(err)
      patchSource(id, {
        status: "error",
        progress: 0,
        error: message,
        analysis: undefined,
      })
      toast.error(
        `${get().sources[id]?.fileName ?? "File"} could not be read`,
        {
          description: message,
        }
      )
    }
  }
}

function makeItems(sourceId: string, pageCount: number): PageItem[] {
  return Array.from({ length: pageCount }, (_, pageIndex) => ({
    id: newId(),
    kind: "page" as const,
    sourceId,
    pageIndex,
    turn: 0 as Rotation,
    color: null,
    forceRaster: false,
  }))
}

/** Docs whose file was locked when added get their pages once it opens. */
function fillEmptyDocs(sourceId: string, pageCount: number) {
  set((state) => {
    let changed = false
    const next = { ...state.workspaces }
    for (const tool of ["bundle", "fixer"] as const) {
      const docs = state.workspaces[tool].docs.map((doc) => {
        if (doc.sourceId !== sourceId || doc.items.length > 0) return doc
        changed = true
        return { ...doc, items: makeItems(sourceId, pageCount) }
      })
      next[tool] = { ...state.workspaces[tool], docs } as never
    }
    return changed ? { workspaces: next } : {}
  })
}

/* ───────────────────────── history & mutation ───────────────────────── */

const HISTORY_LIMIT = 60

function mutate(tool: Tool, fn: (docs: DocRecord[]) => DocRecord[]) {
  set((state) => {
    const workspace = state.workspaces[tool]
    const docs = fn(workspace.docs)
    if (docs === workspace.docs) return {}
    const history = state.history[tool]
    return {
      workspaces: { ...state.workspaces, [tool]: { ...workspace, docs } },
      history: {
        ...state.history,
        [tool]: {
          past: [...history.past, workspace].slice(-HISTORY_LIMIT),
          future: [],
        },
      },
    }
  })
  schedulePersist()
  void collectUnusedSources()
}

export function undo(tool: Tool) {
  set((state) => {
    const history = state.history[tool]
    const previous = history.past[history.past.length - 1]
    if (!previous) return {}
    return {
      workspaces: { ...state.workspaces, [tool]: previous },
      history: {
        ...state.history,
        [tool]: {
          past: history.past.slice(0, -1),
          future: [state.workspaces[tool], ...history.future],
        },
      },
    }
  })
  sanitizeSelection(tool)
  schedulePersist()
}

export function redo(tool: Tool) {
  set((state) => {
    const history = state.history[tool]
    const nextWs = history.future[0]
    if (!nextWs) return {}
    return {
      workspaces: { ...state.workspaces, [tool]: nextWs },
      history: {
        ...state.history,
        [tool]: {
          past: [...history.past, state.workspaces[tool]],
          future: history.future.slice(1),
        },
      },
    }
  })
  sanitizeSelection(tool)
  schedulePersist()
}

/** Remove sources no workspace or undo step refers to any more. */
async function collectUnusedSources() {
  const state = get()
  const used = new Set<string>()
  const scan = (docs: DocRecord[]) => {
    for (const doc of docs) {
      used.add(doc.sourceId)
      for (const item of doc.items) if (item.sourceId) used.add(item.sourceId)
    }
  }
  for (const tool of ["bundle", "fixer"] as const) {
    scan(state.workspaces[tool].docs)
    for (const ws of state.history[tool].past) scan(ws.docs)
    for (const ws of state.history[tool].future) scan(ws.docs)
  }
  const unused = Object.keys(state.sources).filter((id) => !used.has(id))
  if (unused.length === 0) return
  set((s) => {
    const sources = { ...s.sources }
    for (const id of unused) delete sources[id]
    return { sources }
  })
  for (const id of unused) {
    stopped.add(id)
    await releaseSource(id)
    await deleteBytes(id).catch(() => undefined)
  }
  schedulePersist()
}

/* ───────────────────────── selection ───────────────────────── */

function setSelection(tool: Tool, patch: Partial<Selection>) {
  set((state) => ({
    selection: {
      ...state.selection,
      [tool]: { ...state.selection[tool], ...patch },
    },
  }))
}

function sanitizeSelection(tool: Tool) {
  const state = get()
  const docs = state.workspaces[tool].docs
  const sel = state.selection[tool]
  const doc = docs.find((d) => d.id === sel.docId) ?? docs[0] ?? null
  const ids = new Set(doc?.items.map((i) => i.id) ?? [])
  setSelection(tool, {
    docId: doc?.id ?? null,
    itemIds: sel.itemIds.filter((id) => ids.has(id)),
    focusId:
      sel.focusId && ids.has(sel.focusId)
        ? sel.focusId
        : (doc?.items[0]?.id ?? null),
  })
}

export function selectDoc(tool: Tool, docId: string) {
  const doc = get().workspaces[tool].docs.find((d) => d.id === docId)
  setSelection(tool, { docId, itemIds: [], focusId: doc?.items[0]?.id ?? null })
}

export function clickItem(
  tool: Tool,
  itemId: string,
  mode: "single" | "toggle" | "range"
) {
  const state = get()
  const sel = state.selection[tool]
  const doc = state.workspaces[tool].docs.find((d) => d.id === sel.docId)
  if (!doc) return
  if (mode === "single") {
    setSelection(tool, { itemIds: [], focusId: itemId })
    return
  }
  if (mode === "toggle") {
    const base =
      sel.itemIds.length === 0 && sel.focusId ? [sel.focusId] : sel.itemIds
    const itemIds = base.includes(itemId)
      ? base.filter((id) => id !== itemId)
      : [...base, itemId]
    setSelection(tool, { itemIds, focusId: itemId })
    return
  }
  const order = doc.items.map((i) => i.id)
  const from = order.indexOf(sel.focusId ?? itemId)
  const to = order.indexOf(itemId)
  const [a, b] = from <= to ? [from, to] : [to, from]
  setSelection(tool, { itemIds: order.slice(a, b + 1), focusId: itemId })
}

export function selectAll(tool: Tool) {
  const state = get()
  const doc = state.workspaces[tool].docs.find(
    (d) => d.id === state.selection[tool].docId
  )
  if (!doc) return
  setSelection(tool, { itemIds: doc.items.map((i) => i.id) })
}

export function clearSelection(tool: Tool) {
  setSelection(tool, { itemIds: [] })
}

function targets(tool: Tool): { docId: string; ids: Set<string> } | null {
  const sel = get().selection[tool]
  if (!sel.docId) return null
  const ids = new Set(
    sel.itemIds.length > 0 ? sel.itemIds : sel.focusId ? [sel.focusId] : []
  )
  if (ids.size === 0) return null
  return { docId: sel.docId, ids }
}

function editTargets(tool: Tool, fn: (item: PageItem) => PageItem) {
  const t = targets(tool)
  if (!t) return
  mutate(tool, (docs) =>
    docs.map((doc) =>
      doc.id !== t.docId
        ? doc
        : {
            ...doc,
            items: doc.items.map((item) =>
              t.ids.has(item.id) ? fn(item) : item
            ),
          }
    )
  )
}

/* ───────────────────────── page edits ───────────────────────── */

export function rotatePages(tool: Tool, delta: Rotation) {
  editTargets(tool, (item) =>
    item.kind === "blank"
      ? item
      : { ...item, turn: addRotation(item.turn, delta) }
  )
}

export function colorPages(tool: Tool, color: string | null) {
  const normalized =
    color && color.toLowerCase() !== "#ffffff" ? color.toLowerCase() : null
  editTargets(tool, (item) => ({ ...item, color: normalized }))
}

export function rasterPages(tool: Tool, on: boolean) {
  editTargets(tool, (item) =>
    item.kind === "blank" ? item : { ...item, forceRaster: on }
  )
}

export function markChecked(tool: Tool) {
  editTargets(tool, (item) => ({ ...item, checked: true }))
}

export function resetPages(tool: Tool) {
  editTargets(tool, (item) => ({
    ...item,
    turn: 0,
    color: null,
    forceRaster: false,
    checked: false,
  }))
}

export function deletePages(tool: Tool) {
  const t = targets(tool)
  if (!t) return
  const doc = get().workspaces[tool].docs.find((d) => d.id === t.docId)
  if (!doc) return
  if (doc.items.every((item) => t.ids.has(item.id))) {
    toast.error("A document needs at least one page", {
      description: "Remove the whole document from the list instead.",
    })
    return
  }
  const order = doc.items.map((i) => i.id)
  const firstIndex = Math.min(...[...t.ids].map((id) => order.indexOf(id)))
  mutate(tool, (docs) =>
    docs.map((d) =>
      d.id !== t.docId
        ? d
        : { ...d, items: d.items.filter((i) => !t.ids.has(i.id)) }
    )
  )
  const remaining =
    get().workspaces[tool].docs.find((d) => d.id === t.docId)?.items ?? []
  setSelection(tool, {
    itemIds: [],
    focusId: remaining[Math.min(firstIndex, remaining.length - 1)]?.id ?? null,
  })
}

function insertionIndex(
  tool: Tool,
  where: "before" | "after"
): { docId: string; at: number } | null {
  const state = get()
  const sel = state.selection[tool]
  const doc = state.workspaces[tool].docs.find((d) => d.id === sel.docId)
  if (!doc) return null
  const order = doc.items.map((i) => i.id)
  const picked =
    sel.itemIds.length > 0 ? sel.itemIds : sel.focusId ? [sel.focusId] : []
  if (picked.length === 0)
    return { docId: doc.id, at: where === "before" ? 0 : order.length }
  const positions = picked.map((id) => order.indexOf(id)).filter((i) => i >= 0)
  return {
    docId: doc.id,
    at:
      where === "before" ? Math.min(...positions) : Math.max(...positions) + 1,
  }
}

export function insertBlank(tool: Tool, where: "before" | "after") {
  const pos = insertionIndex(tool, where)
  if (!pos) return
  const blank: PageItem = {
    id: newId(),
    kind: "blank",
    turn: 0,
    color: null,
    forceRaster: false,
  }
  mutate(tool, (docs) =>
    docs.map((d) =>
      d.id !== pos.docId
        ? d
        : {
            ...d,
            items: [
              ...d.items.slice(0, pos.at),
              blank,
              ...d.items.slice(pos.at),
            ],
          }
    )
  )
  setSelection(tool, { itemIds: [], focusId: blank.id })
}

export async function insertPdf(
  tool: Tool,
  files: File[],
  where: "before" | "after"
) {
  const pos = insertionIndex(tool, where)
  if (!pos) return
  const added: PageItem[] = []
  for (const file of files) {
    const source = await createSource(file)
    if (!source) continue
    try {
      const doc = await openSource(source.id)
      added.push(...makeItems(source.id, doc.numPages))
    } catch (err) {
      toast.error(`${file.name} could not be opened`, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }
  if (added.length === 0) {
    void collectUnusedSources()
    return
  }
  mutate(tool, (docs) =>
    docs.map((d) =>
      d.id !== pos.docId
        ? d
        : {
            ...d,
            items: [
              ...d.items.slice(0, pos.at),
              ...added,
              ...d.items.slice(pos.at),
            ],
          }
    )
  )
  setSelection(tool, { itemIds: added.map((i) => i.id), focusId: added[0].id })
  toast.success(`Inserted ${added.length} page${added.length === 1 ? "" : "s"}`)
}

export function moveItems(tool: Tool, docId: string, orderedIds: string[]) {
  mutate(tool, (docs) =>
    docs.map((d) => {
      if (d.id !== docId) return d
      const byId = new Map(d.items.map((i) => [i.id, i]))
      const items = orderedIds
        .map((id) => byId.get(id))
        .filter(Boolean) as PageItem[]
      return items.length === d.items.length ? { ...d, items } : d
    })
  )
}

/* ───────────────────────── documents ───────────────────────── */

async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const text = new TextDecoder("latin1").decode(head)
  return text.includes("%PDF")
}

async function createSource(file: File): Promise<SourceRecord | null> {
  if (!(await looksLikePdf(file))) {
    toast.error(`${file.name} is not a PDF`)
    return null
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = newId()
  registerSource(id, file.name, bytes)
  const record: SourceRecord = {
    id,
    fileName: file.name,
    size: file.size,
    status: "queued",
    progress: 0,
  }
  set((state) => ({ sources: { ...state.sources, [id]: record } }))
  saveBytes(id, bytes).catch(() => warnStorage())
  enqueue(id)
  return record
}

function titleFor(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").trim() || fileName
}

export async function addFiles(
  tool: Tool,
  files: File[],
  role: DocRole = "document"
) {
  const list =
    tool === "bundle"
      ? sortByFilename(files.map((f) => ({ fileName: f.name, f }))).map(
          (x) => x.f
        )
      : files
  const picked = role === "cover" ? list.slice(0, 1) : list
  const created: DocRecord[] = []
  for (const file of picked) {
    const source = await createSource(file)
    if (!source) continue
    let items: PageItem[] = []
    try {
      const pdf = await openSource(source.id)
      items = makeItems(source.id, pdf.numPages)
    } catch (err) {
      if (!(err instanceof PasswordCancelled)) {
        // The analysis queue reports the error on the file row.
      }
    }
    created.push({
      id: newId(),
      title: titleFor(file.name),
      fileName: file.name,
      role,
      sourceId: source.id,
      items,
    })
  }
  if (created.length === 0) return

  mutate(tool, (docs) => {
    if (role === "cover") {
      // A replaced cover is removed, not silently turned into an authority.
      return [created[0], ...docs.filter((d) => d.role !== "cover")]
    }
    return [...docs, ...created]
  })
  const sel = get().selection[tool]
  if (!sel.docId || role === "cover") selectDoc(tool, created[0].id)
  else if (
    created.length > 0 &&
    !get().workspaces[tool].docs.some((d) => d.id === sel.docId)
  ) {
    selectDoc(tool, created[0].id)
  }
}

export function removeDoc(tool: Tool, docId: string) {
  mutate(tool, (docs) => docs.filter((d) => d.id !== docId))
  const state = get()
  if (state.selection[tool].docId === docId) {
    const first = state.workspaces[tool].docs[0]
    if (first) selectDoc(tool, first.id)
    else setSelection(tool, emptySelection())
  }
}

export function renameDoc(tool: Tool, docId: string, title: string) {
  const clean = title.trim()
  if (!clean) return
  mutate(tool, (docs) =>
    docs.map((d) => (d.id === docId ? { ...d, title: clean } : d))
  )
}

export function reorderDocs(tool: Tool, orderedIds: string[]) {
  mutate(tool, (docs) => {
    const byId = new Map(docs.map((d) => [d.id, d]))
    const cover = docs.filter((d) => d.role === "cover")
    const rest = orderedIds
      .map((id) => byId.get(id))
      .filter((d) => d && d.role !== "cover") as DocRecord[]
    if (rest.length + cover.length !== docs.length) return docs
    return [...cover, ...rest]
  })
}

export function sortDocsByName(tool: Tool) {
  mutate(tool, (docs) => {
    const cover = docs.filter((d) => d.role === "cover")
    const rest = sortByFilename(docs.filter((d) => d.role !== "cover"))
    return [...cover, ...rest]
  })
}

export function setRole(tool: Tool, docId: string, role: DocRole) {
  mutate(tool, (docs) => {
    if (role === "cover") {
      const target = docs.find((d) => d.id === docId)
      if (!target) return docs
      const others = docs
        .filter((d) => d.id !== docId)
        .map((d) =>
          d.role === "cover" ? { ...d, role: "document" as const } : d
        )
      return [{ ...target, role: "cover" }, ...others]
    }
    return docs.map((d) =>
      d.id === docId ? { ...d, role: "document" as const } : d
    )
  })
}

export function retrySource(id: string) {
  stopped.delete(id)
  patchSource(id, { status: "queued", progress: 0, error: undefined })
  enqueue(id)
  // Locked docs with no pages get filled once the analysis succeeds.
}

/* ───────────────────────── settings & tool ───────────────────────── */

export function setTool(tool: Tool) {
  set({ tool })
  sanitizeSelection(tool)
  schedulePersist()
}

export function updateBundleSettings(patch: Partial<BundleSettings>) {
  set((state) => ({
    workspaces: {
      ...state.workspaces,
      bundle: {
        ...state.workspaces.bundle,
        settings: { ...state.workspaces.bundle.settings, ...patch },
      },
    },
  }))
  schedulePersist()
}

export function updateFixerSettings(patch: Partial<FixerSettings>) {
  set((state) => ({
    workspaces: {
      ...state.workspaces,
      fixer: {
        ...state.workspaces.fixer,
        settings: { ...state.workspaces.fixer.settings, ...patch },
      },
    },
  }))
  schedulePersist()
}

export async function clearWorkspace(tool: Tool) {
  set((state) => ({
    workspaces: {
      ...state.workspaces,
      [tool]: { ...state.workspaces[tool], docs: [] },
    },
    history: { ...state.history, [tool]: { past: [], future: [] } },
    selection: { ...state.selection, [tool]: emptySelection() },
  }))
  schedulePersist()
  await collectUnusedSources()
}

export async function clearEverything() {
  queue.length = 0
  for (const id of Object.keys(get().sources)) stopped.add(id)
  await releaseAll()
  await clearSaved()
  set({
    workspaces: initialWorkspaces(),
    sources: {},
    selection: { bundle: emptySelection(), fixer: emptySelection() },
    history: {
      bundle: { past: [], future: [] },
      fixer: { past: [], future: [] },
    },
  })
}

/* ───────────────────────── export state ───────────────────────── */

export function setExportState(exportState: ExportState) {
  set({ exportState })
}

/* ───────────────────────── hydrate ───────────────────────── */

export async function hydrate() {
  try {
    const saved = await loadSaved()
    if (saved) {
      const sources: Record<string, SourceRecord> = {}
      const missing: string[] = []
      for (const record of Object.values(saved.sources)) {
        const bytes = await loadBytes(record.id)
        if (!bytes) {
          missing.push(record.id)
          continue
        }
        registerSource(record.id, record.fileName, bytes)
        sources[record.id] =
          record.status === "ready" || record.status === "locked"
            ? record
            : { ...record, status: "queued", progress: 0 }
      }
      const known = (id?: string) => !id || Boolean(sources[id])
      const prune = <S>(ws: { docs: DocRecord[]; settings: S }) => ({
        ...ws,
        docs: ws.docs
          .filter((d) => known(d.sourceId))
          .map((d) => ({
            ...d,
            items: d.items.filter((i) => known(i.sourceId)),
          })),
      })
      const workspaces: Workspaces = {
        bundle: prune({
          ...saved.workspaces.bundle,
          settings: { ...DEFAULT_BUNDLE, ...saved.workspaces.bundle.settings },
        }),
        fixer: prune({
          ...saved.workspaces.fixer,
          settings: { ...DEFAULT_FIXER, ...saved.workspaces.fixer.settings },
        }),
      }
      set({ tool: saved.tool, workspaces, sources, ready: true })
      sanitizeSelection("bundle")
      sanitizeSelection("fixer")
      if (missing.length > 0)
        toast.message("Some files could not be restored and were removed")
      for (const record of Object.values(sources)) {
        if (record.status === "queued") enqueue(record.id)
      }
      return
    }
  } catch {
    toast.error("Your previous session could not be restored")
  }
  set({ ready: true })
}

export const actions = {
  addFiles,
  removeDoc,
  renameDoc,
  reorderDocs,
  sortDocsByName,
  setRole,
  selectDoc,
  clickItem,
  selectAll,
  clearSelection,
  rotatePages,
  colorPages,
  rasterPages,
  markChecked,
  resetPages,
  deletePages,
  insertBlank,
  insertPdf,
  moveItems,
  undo,
  redo,
  setTool,
  updateBundleSettings,
  updateFixerSettings,
  clearWorkspace,
  clearEverything,
  retrySource,
}
