import { describe, expect, it } from "vitest"

import type { PageAnalysis, SourceAnalysis } from "@/engine/analyze"

import {
  indexAsHtml,
  planBundle,
  planFixer,
  resolvePage,
  safeFileName,
  sourceIdsOf,
  tabLabel,
  turnPhrase,
} from "./plan"
import {
  DEFAULT_BUNDLE,
  DEFAULT_FIXER,
  type DocRecord,
  type PageItem,
  type SourceRecord,
} from "./types"

function analysisPage(
  index: number,
  overrides: Partial<PageAnalysis> = {}
): PageAnalysis {
  return {
    index,
    width: 595.28,
    height: 841.89,
    rotate: 0,
    detection: { method: "text", angle: 0, review: false, note: "" },
    autoRotate: 0,
    raster: null,
    ...overrides,
  }
}

function source(id: string, pages: PageAnalysis[]): SourceRecord {
  const analysis: SourceAnalysis = {
    pageCount: pages.length,
    encrypted: false,
    pages,
  }
  return {
    id,
    fileName: `${id}.pdf`,
    size: 1,
    status: "ready",
    progress: 1,
    analysis,
  }
}

function items(sourceId: string, count: number): PageItem[] {
  return Array.from({ length: count }, (_, pageIndex) => ({
    id: `${sourceId}-${pageIndex}`,
    kind: "page" as const,
    sourceId,
    pageIndex,
    turn: 0 as const,
    color: null,
    forceRaster: false,
  }))
}

function doc(id: string, role: "cover" | "document", count: number): DocRecord {
  return {
    id,
    title: `Title ${id}`,
    fileName: `${id}.pdf`,
    role,
    sourceId: id,
    items: items(id, count),
  }
}

const sources = {
  c: source("c", [analysisPage(0), analysisPage(1)]),
  a: source(
    "a",
    Array.from({ length: 3 }, (_, i) => analysisPage(i))
  ),
  b: source("b", [analysisPage(0)]),
}

describe("bundle plan", () => {
  it("numbers cover, TAB sheets and pages continuously; index points at TAB sheets", () => {
    const plan = planBundle(
      {
        docs: [
          doc("c", "cover", 2),
          doc("a", "document", 3),
          doc("b", "document", 1),
        ],
        settings: DEFAULT_BUNDLE,
      },
      sources
    )
    expect(plan.problems).toEqual([])
    expect(plan.file.sheets.map((s) => s.kind)).toEqual([
      "page",
      "page",
      "tab",
      "page",
      "page",
      "page",
      "tab",
      "page",
    ])
    expect(plan.file.sheets.map((s) => s.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(plan.index.map((r) => [r.tab, r.page])).toEqual([
      [1, 3],
      [2, 7],
    ])
  })

  it("can leave the cover unnumbered, start elsewhere and drop TAB sheets", () => {
    const plan = planBundle(
      {
        docs: [
          doc("c", "cover", 2),
          doc("a", "document", 3),
          doc("b", "document", 1),
        ],
        settings: {
          ...DEFAULT_BUNDLE,
          numberCover: false,
          startNumber: 10,
          tabSheets: false,
        },
      },
      sources
    )
    expect(plan.file.sheets.map((s) => s.number)).toEqual([
      null,
      null,
      10,
      11,
      12,
      13,
    ])
    expect(plan.index.map((r) => r.page)).toEqual([10, 13])
  })

  it("refuses to export while a file is unread", () => {
    const pending = {
      ...sources,
      b: { ...sources.b, status: "analyzing" as const },
    }
    const plan = planBundle(
      {
        docs: [doc("a", "document", 3), doc("b", "document", 1)],
        settings: DEFAULT_BUNDLE,
      },
      pending
    )
    expect(plan.problems.map((p) => p.message)).toEqual([
      '"Title b" is still being checked',
    ])
  })

  it("formats TAB labels", () => {
    expect(tabLabel("TAB-{n}", 4)).toBe("TAB-4")
    expect(tabLabel("Tab", 4)).toBe("Tab 4")
    expect(tabLabel("  ", 2)).toBe("TAB-2")
  })

  it("escapes titles in the Word index", () => {
    expect(
      indexAsHtml([{ docId: "x", tab: 1, title: "A & B <v> C", page: 3 }])
    ).toContain("A &amp; B &lt;v&gt; C")
  })
})

describe("fixer plan", () => {
  it("restarts numbering per file when saving separately and de-duplicates names", () => {
    const a = doc("a", "document", 3)
    const b = { ...doc("b", "document", 1), title: "Title a" }
    const plan = planFixer(
      {
        docs: [a, b],
        settings: { ...DEFAULT_FIXER, output: "separate", numberPages: true },
      },
      sources
    )
    expect(plan.files.map((f) => f.name)).toEqual([
      "Title a.pdf",
      "Title a (2).pdf",
    ])
    expect(plan.files.map((f) => f.sheets.map((s) => s.number))).toEqual([
      [1, 2, 3],
      [1],
    ])
  })
})

describe("page resolution", () => {
  it("adds the user's turn to auto-fix and flags pages", () => {
    const srcs = {
      s: source("s", [
        analysisPage(0, {
          width: 842,
          height: 595,
          autoRotate: 270,
          detection: { method: "image", angle: null, review: true, note: "" },
        }),
      ]),
    }
    const [item] = items("s", 1)
    const auto = resolvePage(item, srcs)
    expect(auto.rotate).toBe(270)
    expect(auto.flags).toContain("review")
    const turned = resolvePage({ ...item, turn: 90 }, srcs)
    expect(turned.rotate).toBe(0)
    expect(turned.flags).not.toContain("review")
    expect(turned.flags).toContain("edited")
  })

  it("flags pages the auto-fix turned, but not pages it left alone", () => {
    const srcs = {
      s: source("s", [
        analysisPage(0, { autoRotate: 90 }),
        analysisPage(1, { autoRotate: 0 }),
      ]),
    }
    const [p0, p1] = items("s", 2)
    expect(resolvePage(p0, srcs).flags).toContain("autofixed")
    expect(resolvePage(p1, srcs).flags).not.toContain("autofixed")
  })

  it("treats a page whose analysis has not landed yet as pending", () => {
    // Pages finish out of order, so page 0 can be a hole while page 1 is done.
    const pages: PageAnalysis[] = []
    pages[1] = analysisPage(1, { autoRotate: 90 })
    const srcs = {
      s: {
        ...source("s", []),
        analysis: { pageCount: 2, encrypted: false, pages },
      },
    }
    const [p0, p1] = items("s", 2)
    expect(resolvePage(p0, srcs).ready).toBe(false)
    expect(resolvePage(p1, srcs).ready).toBe(true)
  })

  it("rasterises protected pages and pages the user asks for", () => {
    const srcs = {
      s: source("s", [
        analysisPage(0, { raster: "encrypted" }),
        analysisPage(1),
      ]),
    }
    const [p0, p1] = items("s", 2)
    expect(resolvePage(p0, srcs).raster).toBe(true)
    expect(resolvePage(p1, srcs).raster).toBe(false)
    expect(resolvePage({ ...p1, forceRaster: true }, srcs).rasterReason).toBe(
      "requested"
    )
  })

  it("cleans file names", () => {
    expect(safeFileName('a/b:c*"d.pdf', "x")).toBe("a b c d.pdf")
    expect(safeFileName("   ", "Fallback")).toBe("Fallback.pdf")
  })
})

describe("auto-fix labels", () => {
  it("names the turn in words", () => {
    expect(turnPhrase(90)).toBe("turned right")
    expect(turnPhrase(270)).toBe("turned left")
    expect(turnPhrase(180)).toBe("turned upside down")
  })

  it("lists each file a workspace draws pages from once", () => {
    const docs = [
      {
        id: "d1",
        title: "A",
        fileName: "a.pdf",
        role: "document",
        sourceId: "s1",
        items: [
          {
            id: "i1",
            kind: "page",
            sourceId: "s1",
            pageIndex: 0,
            turn: 0,
            color: null,
            forceRaster: false,
          },
          {
            id: "i2",
            kind: "page",
            sourceId: "s2",
            pageIndex: 0,
            turn: 0,
            color: null,
            forceRaster: false,
          },
        ],
      },
    ] as DocRecord[]
    expect(sourceIdsOf(docs).sort()).toEqual(["s1", "s2"])
  })
})
