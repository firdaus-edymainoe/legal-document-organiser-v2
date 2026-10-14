import type { ComposeRequest, ProbeResult } from "../types"

export type WorkerJob =
  | { type: "probe"; bytes: Uint8Array }
  | { type: "compose"; request: ComposeRequest }

export type WorkerRequest = { requestId: string; job: WorkerJob }

export type WorkerReply =
  | { requestId: string; kind: "progress"; done: number; total: number }
  | { requestId: string; kind: "probe"; result: ProbeResult }
  | { requestId: string; kind: "compose"; bytes: Uint8Array }
  | { requestId: string; kind: "error"; error: string }
