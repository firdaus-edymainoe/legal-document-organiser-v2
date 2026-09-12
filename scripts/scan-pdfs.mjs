import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { PDFDocument } from "pdf-lib"

const DIR = process.argv[2]
if (!DIR) {
  console.error("usage: node scripts/scan-pdfs.mjs <dir>")
  process.exit(1)
}

const LOAD = { ignoreEncryption: true, updateMetadata: false }

async function main() {
  const names = (await readdir(DIR))
    .filter((n) => n.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  console.log("file\tmb\tpages\tencrypted\trotate\tissue-hint")
  for (const name of names) {
    const full = path.join(DIR, name)
    const buf = await readFile(full)
    const mb = (buf.byteLength / 1024 / 1024).toFixed(2)
    try {
      let encrypted = false
      try {
        await PDFDocument.load(buf, { updateMetadata: false })
      } catch {
        encrypted = true
      }
      const doc = await PDFDocument.load(buf, LOAD)
      const pages = doc.getPages()
      const rotates = new Set(
        pages.map((p) => {
          const r = p.getRotation()
          return typeof r === "number" ? r : r.angle
        }),
      )
      const sizes = pages.slice(0, 8).map((p) => {
        const c = p.getCropBox()
        return `${Math.round(c.width)}x${Math.round(c.height)}`
      })
      console.log(
        `${name}\t${mb}\t${pages.length}\t${encrypted}\t[${[...rotates].join(",")}]\t${sizes.join(" ")}`,
      )
    } catch (err) {
      console.log(`${name}\t${mb}\tERR\t\t\t${err instanceof Error ? err.message : err}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
