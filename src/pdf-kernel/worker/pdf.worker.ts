/// <reference lib="webworker" />

import { composePdf, ingestPdf, normalizeDocument } from ".."
import { cloneBytes } from "../geometry"
import type { WorkerRequest, WorkerResponse } from "./protocol"

function packed(bytes: Uint8Array): { bytes: Uint8Array; buffer: ArrayBuffer } {
  const copy = cloneBytes(bytes)
  return { bytes: copy, buffer: copy.buffer as ArrayBuffer }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { requestId, job } = event.data
  try {
    if (job.type === "ingest") {
      const result = await ingestPdf(job.bytes, {
        landscapePolicy: job.landscapePolicy,
      })
      const unlocked = packed(result.unlocked)
      const canonical = packed(result.canonical)
      const response: WorkerResponse = {
        requestId,
        ok: true,
        payload: {
          type: "ingest",
          result: { ...result, unlocked: unlocked.bytes, canonical: canonical.bytes },
        },
      }
      self.postMessage(response, { transfer: [unlocked.buffer, canonical.buffer] })
      return
    }
    if (job.type === "normalize") {
      const packedBytes = packed(await normalizeDocument(job.bytes, job.plans))
      const response: WorkerResponse = {
        requestId,
        ok: true,
        payload: { type: "normalize", bytes: packedBytes.bytes },
      }
      self.postMessage(response, { transfer: [packedBytes.buffer] })
      return
    }
    const packedBytes = packed(await composePdf(job.input))
    const response: WorkerResponse = {
      requestId,
      ok: true,
      payload: { type: "compose", bytes: packedBytes.bytes },
    }
    self.postMessage(response, { transfer: [packedBytes.buffer] })
  } catch (err) {
    const response: WorkerResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
