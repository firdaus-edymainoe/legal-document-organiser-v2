import {
  BYTES_STORE,
  KV_STORE,
  idbClear,
  idbDelete,
  idbGet,
  idbGetAll,
  idbSet,
} from "./idb"
import type { JobSnapshot } from "@/features/job-types"

const SESSION_KEY = "session"

export async function persistJob(job: JobSnapshot): Promise<void> {
  await idbSet(KV_STORE, SESSION_KEY, job)
}

export async function persistBytes(
  id: string,
  kind: "orig" | "auto" | "current",
  bytes: Uint8Array,
): Promise<void> {
  await idbSet(BYTES_STORE, `${kind}:${id}`, bytes)
}

export async function loadBytes(
  id: string,
  kind: "orig" | "auto" | "current",
): Promise<Uint8Array | undefined> {
  return idbGet<Uint8Array>(BYTES_STORE, `${kind}:${id}`)
}

export async function deleteDocBytes(id: string): Promise<void> {
  await Promise.all([
    idbDelete(BYTES_STORE, `orig:${id}`),
    idbDelete(BYTES_STORE, `auto:${id}`),
    idbDelete(BYTES_STORE, `current:${id}`),
  ])
}

export async function loadPersistedJob(): Promise<{
  job: JobSnapshot | undefined
  bytes: { key: string; value: Uint8Array }[]
}> {
  const [job, bytes] = await Promise.all([
    idbGet<JobSnapshot>(KV_STORE, SESSION_KEY),
    idbGetAll<Uint8Array>(BYTES_STORE),
  ])
  return { job, bytes }
}

export async function clearPersisted(): Promise<void> {
  await Promise.all([idbClear(KV_STORE), idbClear(BYTES_STORE)])
}
