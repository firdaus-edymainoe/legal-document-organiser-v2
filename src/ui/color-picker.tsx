import { useState } from "react"
import { cn } from "cn"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"

const PRESETS: { hex: string; name: string }[] = [
  { hex: "#ffffff", name: "White (no colour)" },
  { hex: "#fff3bf", name: "Yellow" },
  { hex: "#ffe3c2", name: "Orange" },
  { hex: "#fde0e6", name: "Pink" },
  { hex: "#e9e2fb", name: "Lilac" },
  { hex: "#dbeafe", name: "Blue" },
  { hex: "#d9f2e3", name: "Green" },
  { hex: "#ececec", name: "Grey" },
]

const RECENT_KEY = "legal-organiser:recent-colours"

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(raw)
      ? raw.filter((v) => /^#[0-9a-f]{6}$/i.test(v)).slice(0, 6)
      : []
  } catch {
    return []
  }
}

function remember(hex: string) {
  try {
    const next = [hex, ...readRecent().filter((v) => v !== hex)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable.
  }
}

export function ColorPicker({
  current,
  onPick,
}: {
  current: string | null
  onPick: (hex: string | null) => void
}) {
  const [custom, setCustom] = useState(current ?? "#fff3bf")
  const recent = readRecent().filter((r) => !PRESETS.some((p) => p.hex === r))
  const pick = (hex: string) => {
    if (hex !== "#ffffff") remember(hex)
    onPick(hex === "#ffffff" ? null : hex)
  }
  const swatch = (hex: string, name: string) => {
    const selected = (current ?? "#ffffff") === hex
    return (
      <button
        key={hex}
        type="button"
        title={name}
        aria-label={name}
        aria-pressed={selected}
        onClick={() => pick(hex)}
        className={cn(
          "relative size-8 rounded-md border border-black/10 transition-transform hover:scale-105",
          selected && "ring-2 ring-registry ring-offset-1"
        )}
        style={{ backgroundColor: hex }}
      >
        {selected ? (
          <Check className="absolute inset-0 m-auto size-4 text-ink" />
        ) : null}
        {hex === "#ffffff" ? (
          <span
            className="absolute inset-1 rotate-45 border-t border-destructive/60"
            style={{ top: "50%" }}
          />
        ) : null}
      </button>
    )
  }
  return (
    <div className="w-[17rem]">
      <p className="mb-2 text-xs font-medium text-ink-soft">Page colour</p>
      <div className="grid grid-cols-8 gap-1.5">
        {PRESETS.map((p) => swatch(p.hex, p.name))}
      </div>
      {recent.length > 0 ? (
        <>
          <p className="mt-3 mb-2 text-xs font-medium text-ink-soft">Recent</p>
          <div className="grid grid-cols-8 gap-1.5">
            {recent.map((hex) => swatch(hex, hex))}
          </div>
        </>
      ) : null}
      <div className="mt-3 flex items-center gap-2 border-t border-rule pt-3">
        <input
          type="color"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          aria-label="Custom colour"
          className="size-8 cursor-pointer rounded-md border border-rule bg-transparent p-0.5"
        />
        <span className="flex-1 font-mono text-xs text-ink-soft uppercase">
          {custom}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => pick(custom.toLowerCase())}
        >
          Apply
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-soft">
        Tints the paper. Text and scans stay readable.
      </p>
    </div>
  )
}
