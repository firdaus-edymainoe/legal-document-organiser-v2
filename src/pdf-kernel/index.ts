export * from "./types"
export {
  addRotation,
  cwToCcw,
  displayedSize,
  hexToRgb,
  normalizeRotation,
  placementOnA4,
  toArrayBuffer,
} from "./geometry"
export {
  bindingRotation,
  isLandscape,
  resultingAngle,
  uprightTurn,
} from "./rules"
export {
  textOrientation,
  type TextOrientation,
  type TextItemLike,
} from "./orientation/text"
export {
  detectImageOrientation,
  rotateGray,
  type GrayImage,
  type ImageOrientation,
} from "./orientation/image"
export {
  decideOrientation,
  imageIsConfident,
  textIsDecisive,
  type Detection,
  type DetectionMethod,
} from "./orientation/decide"
export {
  compareRenders,
  vectorCopyFailed,
  type RenderComparison,
} from "./verify"
export { STAMP_MARGIN_PT, stampPageNumber } from "./stamp"
export { parseFilename, compareSortKeys, sortByFilename } from "./filename-sort"
export { zip, crc32, type ZipEntry } from "./zip"
export { imagePlacements, scanBox, type ImageOps, type Placement } from "./scan"
