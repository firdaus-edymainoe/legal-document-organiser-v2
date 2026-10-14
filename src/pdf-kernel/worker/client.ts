import { newId } from "@/state/ids"
import type { ComposeRequest, ProbeResult } from "../types"
import type { WorkerJob, WorkerReply, WorkerRequest } from "./protocol"

type Pending = {
  resolve: (reply: WorkerReply) => void
  reject: (err: Error) => void
  onProgress?: (done: number, total: number) => void
}

/**
 * One pdf-lib worker, one job at a time (pdf-lib work is memory hungry).
 * If the worker dies (out of memory on a huge file), every pending job is
 * rejected and the next job starts a fresh worker.
 */
class PdfWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, Pending>()
  private queue: Promise<unknown> = Promise.resolve()

  private ensure(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const message = event.data
      const entry = this.pending.get(message.requestId)
      if (!entry) return
      if (message.kind === "progress") {
        entry.onProgress?.(message.done, message.total)
        return
      }
      this.pending.delete(message.requestId)
      entry.resolve(message)
    }
    const fail = (reason: string) => {
      const error = new Error(reason)
      for (const entry of this.pending.values()) entry.reject(error)
      this.pending.clear()
      worker.terminate()
      if (this.worker === worker) this.worker = null
    }
    worker.onerror = (event) => {
      event.preventDefault()
      fail(
        event.message ||
          "The PDF worker stopped unexpectedly (the file may be too large)"
      )
    }
    worker.onmessageerror = () =>
      fail("The PDF worker sent an unreadable reply")
    this.worker = worker
    return worker
  }

  private run(
    job: WorkerJob,
    transfer: Transferable[],
    onProgress?: (done: number, total: number) => void
  ): Promise<WorkerReply> {
    const task = () =>
      new Promise<WorkerReply>((resolve, reject) => {
        const requestId = newId()
        this.pending.set(requestId, { resolve, reject, onProgress })
        const request: WorkerRequest = { requestId, job }
        this.ensure().postMessage(request, transfer)
      })
    const result = this.queue.then(task, task)
    this.queue = result.catch(() => undefined)
    return result
  }

  async probe(bytes: Uint8Array): Promise<ProbeResult> {
    const copy = bytes.slice()
    const reply = await this.run({ type: "probe", bytes: copy }, [copy.buffer])
    if (reply.kind === "error") throw new Error(reply.error)
    if (reply.kind !== "probe") throw new Error("Unexpected worker reply")
    return reply.result
  }

  async compose(
    request: ComposeRequest,
    onProgress?: (done: number, total: number) => void
  ): Promise<Uint8Array> {
    // Sources are copied (structured clone) so the caller keeps its bytes;
    // raster images are throwaway, so transfer them.
    const transfer: Transferable[] = []
    for (const sheet of request.sheets) {
      if (sheet.content.kind === "raster")
        transfer.push(sheet.content.image.buffer)
    }
    const reply = await this.run(
      { type: "compose", request },
      transfer,
      onProgress
    )
    if (reply.kind === "error") throw new Error(reply.error)
    if (reply.kind !== "compose") throw new Error("Unexpected worker reply")
    return reply.bytes
  }
}

let client: PdfWorkerClient | null = null

export function pdfWorker(): PdfWorkerClient {
  if (!client) client = new PdfWorkerClient()
  return client
}
