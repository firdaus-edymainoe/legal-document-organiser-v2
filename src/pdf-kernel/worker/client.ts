import { cloneBytes } from "../geometry"
import type { ComposeInput, IngestResult, LandscapePolicy, PagePlan } from "../index"
import type { WorkerJob, WorkerRequest, WorkerResponse } from "./protocol"

function transferable(bytes: Uint8Array): { bytes: Uint8Array; buffer: ArrayBuffer } {
  const copy = cloneBytes(bytes)
  return { bytes: copy, buffer: copy.buffer as ArrayBuffer }
}

type Pending = {
  resolve: (value: WorkerResponse) => void
  reject: (reason: unknown) => void
}

export class PdfWorkerClient {
  private worker: Worker | null = null
  private queue: Promise<void> = Promise.resolve()
  private pending = new Map<string, Pending>()

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
        type: "module",
      })
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const pending = this.pending.get(event.data.requestId)
        if (!pending) return
        this.pending.delete(event.data.requestId)
        pending.resolve(event.data)
      }
      this.worker.onerror = (event) => {
        const first = this.pending.values().next().value
        if (first) first.reject(event.error ?? event.message)
      }
    }
    return this.worker
  }

  private enqueue<T>(
    job: WorkerJob,
    transfer: ArrayBuffer[],
    pick: (response: WorkerResponse) => T,
  ): Promise<T> {
    const requestId = crypto.randomUUID()
    const run = async () => {
      const worker = this.ensureWorker()
      const response = await new Promise<WorkerResponse>((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject })
        const request: WorkerRequest = { requestId, job }
        worker.postMessage(request, transfer)
      })
      return pick(response)
    }
    const result = this.queue.then(run, run)
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  ingest(bytes: Uint8Array, landscapePolicy: LandscapePolicy): Promise<IngestResult> {
    const packed = transferable(bytes)
    return this.enqueue(
      { type: "ingest", bytes: packed.bytes, landscapePolicy },
      [packed.buffer],
      (response) => {
        if (!response.ok) throw new Error(response.error)
        if (response.payload.type !== "ingest") throw new Error("Unexpected worker reply")
        return response.payload.result
      },
    )
  }

  normalize(bytes: Uint8Array, plans: PagePlan[]): Promise<Uint8Array> {
    const packed = transferable(bytes)
    return this.enqueue(
      { type: "normalize", bytes: packed.bytes, plans },
      [packed.buffer],
      (response) => {
        if (!response.ok) throw new Error(response.error)
        if (response.payload.type !== "normalize") throw new Error("Unexpected worker reply")
        return response.payload.bytes
      },
    )
  }

  compose(input: ComposeInput): Promise<Uint8Array> {
    const coverPacked = input.cover ? transferable(input.cover.bytes) : null
    const docPacked = input.documents.map((doc) => transferable(doc.bytes))
    const cloned: ComposeInput = {
      ...input,
      cover: input.cover && coverPacked
        ? { ...input.cover, bytes: coverPacked.bytes }
        : null,
      documents: input.documents.map((doc, index) => ({
        ...doc,
        bytes: docPacked[index]?.bytes ?? cloneBytes(doc.bytes),
      })),
    }
    const transfer = [
      ...(coverPacked ? [coverPacked.buffer] : []),
      ...docPacked.map((row) => row.buffer),
    ]
    return this.enqueue({ type: "compose", input: cloned }, transfer, (response) => {
      if (!response.ok) throw new Error(response.error)
      if (response.payload.type !== "compose") throw new Error("Unexpected worker reply")
      return response.payload.bytes
    })
  }
}

let client: PdfWorkerClient | null = null

export function pdfWorker(): PdfWorkerClient {
  if (!client) client = new PdfWorkerClient()
  return client
}
