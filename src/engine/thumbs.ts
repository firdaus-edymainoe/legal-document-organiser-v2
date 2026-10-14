import type { Box, Rotation } from "@/pdf-kernel"

import { canvasToBlob, freeCanvas, renderPage, renderSheet } from "./render"
import { openSource } from "./sources"

export type ThumbSpec = {
  /** null for blank and TAB sheets. */
  sourceId: string | null
  pageIndex: number
  extra: Rotation
  color: string | null
  label?: string
  /** Part of the page to draw (a scan), in page coordinates. */
  crop?: Box | null
  width: number
  /** "sheet" = how the output looks; "original" = the page as filed. */
  view: "sheet" | "original"
}

export function thumbKey(s: ThumbSpec): string {
  return [
    s.view,
    s.sourceId ?? "-",
    s.pageIndex,
    s.extra,
    s.color ?? "-",
    s.label ?? "-",
    s.crop ? [s.crop.x, s.crop.y, s.crop.width, s.crop.height].join(",") : "-",
    s.width,
  ].join("|")
}

const CACHE_LIMIT = 400
const cache = new Map<string, Promise<string>>()
const settled = new Map<string, string>()

function remember(key: string, promise: Promise<string>) {
  cache.set(key, promise)
  promise.then(
    (url) => settled.set(key, url),
    () => cache.delete(key)
  )
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string
    cache.delete(oldest)
    const url = settled.get(oldest)
    settled.delete(oldest)
    if (url) URL.revokeObjectURL(url)
  }
}

type Job = {
  key: string
  spec: ThumbSpec
  priority: number
  resolve: (url: string) => void
  reject: (e: unknown) => void
  cancelled: boolean
}

const jobs: Job[] = []
let active = 0
const CONCURRENCY = 2

async function draw(spec: ThumbSpec): Promise<string> {
  let canvas: HTMLCanvasElement
  if (spec.view === "original") {
    if (!spec.sourceId) throw new Error("No page")
    const doc = await openSource(spec.sourceId)
    const page = await doc.getPage(spec.pageIndex + 1)
    canvas = await renderPage(page, {
      fit: { width: spec.width, height: spec.width * 1.6 },
    })
    page.cleanup()
  } else {
    let page = null
    if (spec.sourceId) {
      const doc = await openSource(spec.sourceId)
      page = await doc.getPage(spec.pageIndex + 1)
    }
    canvas = await renderSheet(
      {
        page,
        extra: spec.extra,
        color: spec.color,
        label: spec.label,
        crop: spec.crop,
      },
      spec.width
    )
    page?.cleanup()
  }
  try {
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.85)
    return URL.createObjectURL(blob)
  } finally {
    freeCanvas(canvas)
  }
}

function pump() {
  while (active < CONCURRENCY && jobs.length > 0) {
    jobs.sort((a, b) => b.priority - a.priority)
    const job = jobs.shift()!
    if (job.cancelled) continue
    active += 1
    draw(job.spec)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1
        pump()
      })
  }
}

export function peekThumb(spec: ThumbSpec): string | null {
  return settled.get(thumbKey(spec)) ?? null
}

/**
 * Request a rendered image of a page. Higher `priority` renders first (the
 * large preview outranks grid thumbnails). Calling `cancel` before the job
 * starts drops it.
 */
export function requestThumb(
  spec: ThumbSpec,
  priority = 0
): { promise: Promise<string>; cancel: () => void } {
  const key = thumbKey(spec)
  const existing = cache.get(key)
  if (existing) return { promise: existing, cancel: () => undefined }
  let job: Job | null = null
  const promise = new Promise<string>((resolve, reject) => {
    job = { key, spec, priority, resolve, reject, cancelled: false }
    jobs.push(job)
  })
  remember(key, promise)
  pump()
  return {
    promise,
    cancel: () => {
      if (job && jobs.includes(job)) {
        job.cancelled = true
        jobs.splice(jobs.indexOf(job), 1)
        cache.delete(key)
        job.reject(new Error("cancelled"))
      }
    },
  }
}
