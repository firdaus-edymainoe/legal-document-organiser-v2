// Offline support for the app shell and the pdf.js assets.
// PDFs themselves live in the browser's IndexedDB, so they already work offline.
// Bump VERSION when the precache list changes.
const VERSION = "v2"
const SHELL_CACHE = `legal-organiser-shell-${VERSION}`
const ASSET_CACHE = `legal-organiser-assets-${VERSION}`
const KEEP = [SHELL_CACHE, ASSET_CACHE]

const SHELL = [
  "",
  "index.html",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon.ico",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "icons/apple-touch-icon.png",
]

const at = (path) => new URL(path, self.registration.scope).href

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map(at)))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

async function store(cacheName, request, response) {
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  }
  return response
}

// Pages: fresh when online, the cached shell when offline.
async function navigate(request) {
  try {
    return await store(SHELL_CACHE, at("index.html"), await fetch(request))
  } catch {
    const cached = await caches.match(at("index.html"))
    return cached ?? Response.error()
  }
}

// Hashed build files and pdf.js data never change under the same name.
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  return store(ASSET_CACHE, request, await fetch(request))
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(navigate(request))
    return
  }
  const base = new URL(self.registration.scope).pathname
  const path = url.pathname.slice(base.length)
  if (path.startsWith("assets/") || path.startsWith("pdfjs/") || path.startsWith("icons/")) {
    event.respondWith(cacheFirst(request))
  }
})
