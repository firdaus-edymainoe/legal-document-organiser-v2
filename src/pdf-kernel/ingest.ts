import type { IngestOptions, IngestResult } from "./types"
import { analyzePdf } from "./analyze"
import { planDocument } from "./plan"
import { normalizeDocument } from "./normalize"
import { rasterizePdfToA4 } from "./raster"
import { normalizePdfForEditing, loadPdfForEditing } from "./unlock"

export function isPdfFile(file: { type: string; name: string }): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

export async function ingestPdf(
  bytes: Uint8Array,
  options: IngestOptions,
): Promise<IngestResult> {
  const unlocked = await normalizePdfForEditing(bytes)
  const readable = await canReadPages(unlocked.bytes)

  if (!readable) {
    const rastered = await rasterizePdfToA4(unlocked.bytes, options.landscapePolicy)
    const analysis = await analyzePdf(rastered)
    const plans = planDocument(analysis.pages, options.landscapePolicy)
    return {
      unlocked: unlocked.bytes,
      bypassApplied: unlocked.bypassApplied,
      reasons: unlocked.reasons,
      analysis,
      plans: plans.map((plan) => ({ ...plan, autoFixed: true })),
      canonical: rastered,
      imageOnly: true,
    }
  }

  const analysis = await analyzePdf(unlocked.bytes)
  const plans = planDocument(analysis.pages, options.landscapePolicy)
  const canonical = await normalizeDocument(unlocked.bytes, plans)
  return {
    unlocked: unlocked.bytes,
    bypassApplied: unlocked.bypassApplied,
    reasons: unlocked.reasons,
    analysis,
    plans,
    canonical,
    imageOnly: false,
  }
}

async function canReadPages(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await loadPdfForEditing(bytes)
    return doc.getPageCount() > 0
  } catch {
    return false
  }
}
