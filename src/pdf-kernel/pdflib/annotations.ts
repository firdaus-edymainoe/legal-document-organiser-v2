import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFOperator,
  type PDFPage,
} from "pdf-lib"

const HIDDEN = 1 << 1
const PRINT = 1 << 2
const NO_VIEW = 1 << 5

function numbers(array: PDFArray | undefined): number[] | null {
  if (!array) return null
  const out: number[] = []
  for (let i = 0; i < array.size(); i++) {
    const value = array.lookup(i)
    if (!(value instanceof PDFNumber)) return null
    out.push(value.asNumber())
  }
  return out
}

function transformBox(
  box: number[],
  m: number[]
): [number, number, number, number] {
  const [x0, y0, x1, y1] = box
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * Draw every printable annotation's normal appearance into the page content
 * and drop the annotations. `embedPage` only copies page content, so without
 * this, stamps, filled-in form fields, visible signatures and printed
 * highlights would disappear from the output.
 *
 * Returns the number of annotations flattened.
 */
export function flattenAnnotations(page: PDFPage): number {
  const node = page.node
  const context = page.doc.context
  let annots: PDFArray | undefined
  try {
    annots = node.lookupMaybe(PDFName.of("Annots"), PDFArray)
  } catch {
    return 0
  }
  if (!annots) return 0

  const ops: PDFOperator[] = []
  for (let i = 0; i < annots.size(); i++) {
    try {
      const annot = annots.lookupMaybe(i, PDFDict)
      if (!annot) continue
      const subtype = annot
        .lookupMaybe(PDFName.of("Subtype"), PDFName)
        ?.asString()
      if (subtype === "/Popup" || subtype === "/Link") continue
      const flags =
        annot.lookupMaybe(PDFName.of("F"), PDFNumber)?.asNumber() ?? 0
      if (flags & HIDDEN || flags & NO_VIEW) continue
      if (!(flags & PRINT)) continue

      const rect = numbers(annot.lookupMaybe(PDFName.of("Rect"), PDFArray))
      if (!rect || rect.length < 4) continue
      const rx0 = Math.min(rect[0], rect[2])
      const ry0 = Math.min(rect[1], rect[3])
      const rw = Math.abs(rect[2] - rect[0])
      const rh = Math.abs(rect[3] - rect[1])
      if (rw < 0.5 || rh < 0.5) continue

      const ap = annot.lookupMaybe(PDFName.of("AP"), PDFDict)
      if (!ap) continue
      let ref = ap.get(PDFName.of("N"))
      const normal = ap.lookup(PDFName.of("N"))
      if (normal instanceof PDFDict && !(normal instanceof PDFStream)) {
        const state = annot.lookupMaybe(PDFName.of("AS"), PDFName)
        if (!state) continue
        ref = normal.get(state)
      }
      if (!ref) continue
      let streamRef: PDFRef
      if (ref instanceof PDFRef) {
        streamRef = ref
      } else if (ref instanceof PDFStream) {
        streamRef = context.register(ref)
      } else {
        continue
      }
      const stream = context.lookup(streamRef)
      if (!(stream instanceof PDFStream)) continue
      if (!stream.dict.has(PDFName.of("Subtype"))) {
        stream.dict.set(PDFName.of("Type"), PDFName.of("XObject"))
        stream.dict.set(PDFName.of("Subtype"), PDFName.of("Form"))
      }

      const bbox = numbers(
        stream.dict.lookupMaybe(PDFName.of("BBox"), PDFArray)
      )
      if (!bbox || bbox.length < 4) continue
      const matrix = numbers(
        stream.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray)
      ) ?? [1, 0, 0, 1, 0, 0]
      const [tx0, ty0, tx1, ty1] = transformBox(bbox, matrix)
      const tw = tx1 - tx0
      const th = ty1 - ty0
      if (tw <= 0 || th <= 0) continue

      const sx = rw / tw
      const sy = rh / th
      const name = node.newXObject("FlatAnnot", streamRef)
      ops.push(
        pushGraphicsState(),
        concatTransformationMatrix(
          sx,
          0,
          0,
          sy,
          rx0 - tx0 * sx,
          ry0 - ty0 * sy
        ),
        drawObject(name),
        popGraphicsState()
      )
    } catch {
      // One broken annotation should not cost the whole page.
    }
  }

  if (ops.length === 0) return 0

  // Isolate the original content so an unbalanced graphics state cannot
  // shift the appearances we draw on top.
  node.normalize()
  const start = context.register(context.contentStream([pushGraphicsState()]))
  const end = context.register(context.contentStream([popGraphicsState()]))
  node.wrapContentStreams(start, end)
  page.pushOperators(...ops)
  node.delete(PDFName.of("Annots"))
  return ops.length / 4
}
