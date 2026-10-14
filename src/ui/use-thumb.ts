import { useEffect, useRef, useState } from "react"

import {
  peekThumb,
  requestThumb,
  thumbKey,
  type ThumbSpec,
} from "@/engine/thumbs"

export function useInView<T extends Element>(rootMargin = "400px") {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [rootMargin])
  return { ref, inView }
}

export function useThumb(spec: ThumbSpec | null, priority = 0, enabled = true) {
  const key = spec ? thumbKey(spec) : null
  const [state, setState] = useState<{
    key: string | null
    url: string | null
    error: boolean
  }>(() => ({ key, url: spec ? peekThumb(spec) : null, error: false }))
  const current =
    state.key === key
      ? state
      : { key, url: spec ? peekThumb(spec) : null, error: false }

  useEffect(() => {
    if (!spec || !enabled || !key) return
    // Already rendered: `current` picks it up synchronously below.
    if (peekThumb(spec)) return
    let alive = true
    const job = requestThumb(spec, priority)
    job.promise.then(
      (url) => alive && setState({ key, url, error: false }),
      (err: unknown) => {
        if (alive && !(err instanceof Error && err.message === "cancelled")) {
          setState({ key, url: null, error: true })
        }
      }
    )
    return () => {
      alive = false
      job.cancel()
    }
    // spec is described fully by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, priority])

  return current
}
