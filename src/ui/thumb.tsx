import { cn } from "cn"
import { Loader2 } from "lucide-react"

import type { ThumbSpec } from "@/engine/thumbs"

import { useInView, useThumb } from "./use-thumb"

export function SheetImage({
  spec,
  priority = 0,
  className,
  alt,
}: {
  spec: ThumbSpec | null
  priority?: number
  className?: string
  alt: string
}) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const { url, error } = useThumb(spec, priority, inView)
  return (
    <div ref={ref} className={cn("relative h-full w-full", className)}>
      {url ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          className="block h-full w-full object-contain"
        />
      ) : error ? (
        <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-ink-soft">
          Preview unavailable
        </div>
      ) : spec ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-ink-soft/60" />
        </div>
      ) : null}
    </div>
  )
}
