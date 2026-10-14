/**
 * Registers the service worker that lets the app open offline. Only in the
 * production build: in development it would keep serving stale modules.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err: unknown) => console.warn("Offline support unavailable", err))
  })
}
