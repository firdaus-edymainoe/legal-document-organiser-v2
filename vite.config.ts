import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * pdf.js v6 decodes CCITT/JBIG2/JPEG 2000 scans with WebAssembly and needs
 * its font, CMap and ICC data at runtime. Serve them in dev and copy them
 * into the build under /pdfjs/ — without them, many scans render blank.
 */
function pdfjsAssets(): Plugin {
  const root = path.resolve(__dirname, "node_modules/pdfjs-dist")
  const folders = ["wasm", "cmaps", "standard_fonts", "iccs"]
  const PREFIX = "/pdfjs/"
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? ""
        if (!url.startsWith(PREFIX)) return next()
        const rel = decodeURIComponent(url.slice(PREFIX.length))
        const [folder] = rel.split("/")
        const file = path.resolve(root, rel)
        if (
          !folders.includes(folder) ||
          !file.startsWith(root) ||
          !fs.existsSync(file)
        ) {
          return next()
        }
        if (file.endsWith(".wasm"))
          res.setHeader("Content-Type", "application/wasm")
        fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const folder of folders) {
        const dir = path.join(root, folder)
        for (const name of fs.readdirSync(dir)) {
          const file = path.join(dir, name)
          if (!fs.statSync(file).isFile()) continue
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${name}`,
            source: fs.readFileSync(file),
          })
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    host: "0.0.0.0",
  },
})
