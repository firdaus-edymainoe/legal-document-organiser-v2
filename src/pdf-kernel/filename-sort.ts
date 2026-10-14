export type SortKey = {
  group: string
  num: number
  parsed: boolean
  raw: string
}

export function parseFilename(fileName: string): SortKey {
  const base = stripExtension(fileName).trim()

  const letterMatch = base.match(/^([A-Za-z]{1,3})\s*[-._ ]?\s*(\d+)/)
  if (letterMatch) {
    return {
      group: letterMatch[1].toUpperCase(),
      num: parseInt(letterMatch[2], 10),
      parsed: true,
      raw: fileName,
    }
  }

  const numMatch = base.match(/^(\d+)\s*[-._) ]/)
  if (numMatch) {
    return {
      group: "",
      num: parseInt(numMatch[1], 10),
      parsed: true,
      raw: fileName,
    }
  }

  const bareNum = base.match(/^(\d+)/)
  if (bareNum) {
    return {
      group: "",
      num: parseInt(bareNum[1], 10),
      parsed: true,
      raw: fileName,
    }
  }

  return {
    group: "",
    num: Number.MAX_SAFE_INTEGER,
    parsed: false,
    raw: fileName,
  }
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(0, i) : name
}

export function compareSortKeys(a: SortKey, b: SortKey): number {
  if (a.parsed !== b.parsed) return a.parsed ? -1 : 1
  if (a.group !== b.group) return a.group.localeCompare(b.group)
  if (a.num !== b.num) return a.num - b.num
  return a.raw.localeCompare(b.raw, undefined, { numeric: true })
}

export function sortByFilename<T extends { fileName: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) =>
    compareSortKeys(parseFilename(a.fileName), parseFilename(b.fileName))
  )
}
