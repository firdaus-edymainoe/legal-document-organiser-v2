import type { Rotation } from "../types"
import type { ImageOrientation } from "./image"
import type { TextOrientation } from "./text"

export type DetectionMethod = "text" | "image" | "none"

export type Detection = {
  method: DetectionMethod
  /** Clockwise angle the content currently appears at, or null when unknown. */
  angle: Rotation | null
  /** A person should look at this page. */
  review: boolean
  /** Short explanation for the inspector. */
  note: string
}

/** A page of real text is decisive on its own; anything less gets an image check. */
export function textIsDecisive(text: TextOrientation): boolean {
  return text.angle !== null && text.chars >= 200 && text.share >= 0.85
}

function textIsUsable(text: TextOrientation): boolean {
  return text.angle !== null && text.chars >= 40 && text.share >= 0.8
}

export function imageIsConfident(image: ImageOrientation | null): boolean {
  return (
    image !== null &&
    image.angle !== null &&
    image.flipConfidence >= 0.5 &&
    image.axisConfidence >= 0.25
  )
}

export function decideOrientation(
  text: TextOrientation,
  image: ImageOrientation | null
): Detection {
  if (textIsDecisive(text)) {
    return {
      method: "text",
      angle: text.angle,
      review: false,
      note: "Read from the text layer",
    }
  }

  if (imageIsConfident(image)) {
    const angle = image!.angle
    if (textIsUsable(text) && text.angle !== angle) {
      return {
        method: "image",
        angle,
        review: true,
        note: "The scan and its text layer disagree — check this page",
      }
    }
    return {
      method: "image",
      angle,
      review: false,
      note: "Read from the page image",
    }
  }

  if (textIsUsable(text)) {
    return {
      method: "text",
      angle: text.angle,
      review: false,
      note: "Read from the text layer",
    }
  }

  if (
    image &&
    image.angle !== null &&
    image.angle !== 0 &&
    image.flipConfidence >= 0.2
  ) {
    return {
      method: "none",
      angle: null,
      review: true,
      note: "Orientation unclear — it may be turned",
    }
  }

  return {
    method: "none",
    angle: null,
    review: false,
    note:
      image && image.glyphs > 0
        ? "No clear text direction; kept as is"
        : "No text found; kept as is",
  }
}
