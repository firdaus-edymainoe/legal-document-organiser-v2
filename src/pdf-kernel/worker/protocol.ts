import type { ComposeInput, IngestResult, LandscapePolicy, PagePlan } from "../index"

export type WorkerJob =
  | {
      type: "ingest"
      bytes: Uint8Array
      landscapePolicy: LandscapePolicy
    }
  | {
      type: "normalize"
      bytes: Uint8Array
      plans: PagePlan[]
    }
  | {
      type: "compose"
      input: ComposeInput
    }

export type WorkerOk =
  | { type: "ingest"; result: IngestResult }
  | { type: "normalize"; bytes: Uint8Array }
  | { type: "compose"; bytes: Uint8Array }

export type WorkerRequest = {
  requestId: string
  job: WorkerJob
}

export type WorkerResponse =
  | { requestId: string; ok: true; payload: WorkerOk }
  | { requestId: string; ok: false; error: string }
