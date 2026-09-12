export { A4, STAMP_MARGIN_PT, STAMP_SIZE_PT } from "./types"
export type {
  AnalyzeResult,
  Box,
  CanonicalDocument,
  ComposeDocument,
  ComposeInput,
  ComposePlan,
  ComposeSettings,
  ComposeSlot,
  IngestOptions,
  IngestResult,
  LandscapePolicy,
  PageAnalysis,
  PageIssue,
  PagePlan,
  Rotation,
  TocRow,
  UnlockResult,
} from "./types"

export {
  addRotation,
  approx,
  cloneBytes,
  displayedSize,
  flattenViewerRotation,
  hexToRgb,
  isA4Size,
  isPortrait,
  normalizeRotation,
  placementOnA4,
  toArrayBuffer,
} from "./geometry"

export { analyzePdf } from "./analyze"
export { planDocument, planPage } from "./plan"
export { normalizeDocument, normalizeSinglePage } from "./normalize"
export { stampPageNumber } from "./stamp"
export { buildComposePlan, composePdf, tocAsWordText } from "./compose"
export { ingestPdf, isPdfFile } from "./ingest"
export { normalizePdfForEditing, loadPdfForEditing } from "./unlock"
export { parseFilename, compareSortKeys, sortByFilename } from "./filename-sort"
export { getPdfjs, destroyPdf } from "./pdfjs"
