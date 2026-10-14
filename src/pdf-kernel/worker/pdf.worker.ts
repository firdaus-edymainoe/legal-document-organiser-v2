/// <reference lib="webworker" />

import { composeSheets } from "../pdflib/compose"
import { probeSource } from "../pdflib/probe"
import type { WorkerReply, WorkerRequest } from "./protocol"

const scope = self as unknown as DedicatedWorkerGlobalScope

function reply(message: WorkerReply, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer)
}

/** Copy into a fresh, exactly-sized buffer we can transfer. */
function owned(bytes: Uint8Array): Uint8Array {
  return bytes.slice()
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { requestId, job } = event.data
  try {
    if (job.type === "probe") {
      const result = await probeSource(job.bytes)
      const probe = result.probe ? owned(result.probe) : null
      reply(
        { requestId, kind: "probe", result: { ...result, probe } },
        probe ? [probe.buffer] : []
      )
      return
    }
    let last = 0
    const bytes = owned(
      await composeSheets(job.request, (done, total) => {
        const now = Date.now()
        if (done === total || now - last > 120) {
          last = now
          reply({ requestId, kind: "progress", done, total })
        }
      })
    )
    reply({ requestId, kind: "compose", bytes }, [bytes.buffer])
  } catch (err) {
    reply({
      requestId,
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
