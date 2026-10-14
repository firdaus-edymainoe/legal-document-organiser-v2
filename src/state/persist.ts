import {
  BYTES_STORE,
  KV_STORE,
  idbClear,
  idbDelete,
  idbGet,
  idbSet,
} from "./idb"
import type { SourceRecord, Tool, Workspaces } from "./types"

const STATE_KEY = "state-v3"
const LEGACY_KEY = "session"

export type SavedState = {
  version: 3
  tool: Tool
  workspaces: Workspaces
  sources: Record<string, SourceRecord>
}

export async function loadSaved(): Promise<SavedState | null> {
  // Sessions from the previous version use a different layout; drop them.
  if (await idbGet(KV_STORE, LEGACY_KEY)) {
    await Promise.all([idbClear(KV_STORE), idbClear(BYTES_STORE)])
    return null
  }
  const saved = await idbGet<SavedState>(KV_STORE, STATE_KEY)
  return saved?.version === 3 ? saved : null
}

export function saveState(state: SavedState): Promise<void> {
  return idbSet(KV_STORE, STATE_KEY, state)
}

export function saveBytes(id: string, bytes: Uint8Array): Promise<void> {
  return idbSet(BYTES_STORE, `src:${id}`, bytes)
}

export function loadBytes(id: string): Promise<Uint8Array | undefined> {
  return idbGet<Uint8Array>(BYTES_STORE, `src:${id}`)
}

export function deleteBytes(id: string): Promise<void> {
  return idbDelete(BYTES_STORE, `src:${id}`)
}

export async function clearSaved(): Promise<void> {
  await Promise.all([idbClear(KV_STORE), idbClear(BYTES_STORE)])
}
