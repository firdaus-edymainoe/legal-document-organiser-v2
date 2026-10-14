/**
 * The binding rule.
 *
 * Think of the output as a book bound on the left. Every sheet is portrait A4.
 * - Portrait content sits upright (text reads left-to-right, top-to-bottom).
 * - Landscape content is turned so its top edge faces the spine (left).
 *   The reader turns the book a quarter-turn clockwise and the spine is then
 *   at the top. On the sheet, that text appears rotated 90° anticlockwise
 *   (a visible clockwise angle of 270).
 */

import { addRotation, displayedSize, normalizeRotation } from "./geometry"
import type { Rotation } from "./types"

/** Landscape if wider than tall by more than 2%. */
export function isLandscape(width: number, height: number): boolean {
  return width > height * 1.02
}

/** Clockwise turn that makes text seen at `visibleAngle` (clockwise) upright. */
export function uprightTurn(visibleAngle: Rotation): Rotation {
  return normalizeRotation(360 - visibleAngle)
}

/**
 * Extra clockwise rotation to apply to a page as displayed.
 *
 * @param displayedWidth  width as a viewer shows it (after /Rotate)
 * @param displayedHeight height as a viewer shows it
 * @param visibleAngle    clockwise angle the content currently appears rotated
 *                        by, or null when unknown (treated as upright)
 */
export function bindingRotation(
  displayedWidth: number,
  displayedHeight: number,
  visibleAngle: Rotation | null
): Rotation {
  const upright = uprightTurn(visibleAngle ?? 0)
  const content = displayedSize(displayedWidth, displayedHeight, upright)
  if (isLandscape(content.width, content.height)) {
    return addRotation(upright, 270)
  }
  return upright
}

/** Clockwise angle the content will appear at after `extra` is applied. */
export function resultingAngle(
  visibleAngle: Rotation,
  extra: Rotation
): Rotation {
  return addRotation(visibleAngle, extra)
}
