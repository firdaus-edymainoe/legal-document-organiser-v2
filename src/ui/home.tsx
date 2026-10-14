import { Link } from "react-router-dom"
import { ArrowRight, Lock } from "lucide-react"

import { useStore } from "@/state/store"
import type { Tool } from "@/state/types"

function TextLines({
  x,
  y,
  w,
  rows,
  gap = 7,
}: {
  x: number
  y: number
  w: number
  rows: number
  gap?: number
}) {
  return (
    <g
      stroke="var(--ink)"
      strokeOpacity="0.55"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      {Array.from({ length: rows }, (_, i) => (
        <line
          key={i}
          x1={x}
          x2={x + (i === rows - 1 ? w * 0.6 : w)}
          y1={y + i * gap}
          y2={y + i * gap}
        />
      ))}
    </g>
  )
}

/** Two bound sheets: upright portrait, and landscape content turned spine-up. */
function BindingDiagram() {
  return (
    <svg
      viewBox="0 0 300 150"
      className="h-auto w-full max-w-[340px]"
      role="img"
      aria-label="A portrait page sits upright. A landscape page is turned so its top faces the spine on the left."
    >
      {/* spine */}
      <rect
        x="18"
        y="12"
        width="6"
        height="126"
        rx="2"
        fill="var(--registry)"
      />
      {/* portrait sheet */}
      <rect
        x="24"
        y="12"
        width="90"
        height="126"
        fill="#fff"
        stroke="var(--rule)"
      />
      <rect
        x="36"
        y="24"
        width="36"
        height="5"
        rx="1"
        fill="var(--ink)"
        opacity="0.8"
      />
      <TextLines x={36} y={40} w={64} rows={10} gap={8.5} />

      {/* landscape sheet, content turned anticlockwise (top towards spine) */}
      <rect
        x="160"
        y="12"
        width="6"
        height="126"
        rx="2"
        fill="var(--registry)"
      />
      <rect
        x="166"
        y="12"
        width="90"
        height="126"
        fill="#fff"
        stroke="var(--rule)"
      />
      <g transform="translate(166 138) rotate(-90)">
        <rect
          x="10"
          y="10"
          width="106"
          height="70"
          fill="var(--registry-soft)"
          stroke="var(--registry)"
          strokeOpacity="0.35"
        />
        <rect
          x="18"
          y="16"
          width="32"
          height="5"
          rx="1"
          fill="var(--ink)"
          opacity="0.8"
        />
        <TextLines x={18} y={30} w={88} rows={6} gap={8} />
      </g>
      {/* reading arrow */}
      <path
        d="M275 105 a26 26 0 0 0 -8 -40"
        fill="none"
        stroke="var(--caution)"
        strokeWidth="2"
        markerEnd="url(#arrow)"
      />
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="var(--caution)" />
        </marker>
      </defs>
    </svg>
  )
}

function ToolCard({
  tool,
  tab,
  title,
  body,
  points,
  path,
}: {
  tool: Tool
  tab: string
  title: string
  body: string
  points: string[]
  path: string
}) {
  const docs = useStore((s) => s.workspaces[tool].docs)
  const pages = docs.reduce((n, d) => n + d.items.length, 0)
  return (
    <Link
      to={path}
      className="group relative block pt-6 outline-none focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-registry"
    >
      <span className="absolute top-0 left-6 rounded-t-md bg-manila px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-manila-deep uppercase">
        {tab}
      </span>
      <div className="sheet rounded-md rounded-tl-none p-6 pl-7 transition-transform duration-200 group-hover:-translate-y-0.5">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-registry" />
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between border-t border-rule pt-4">
          <span className="tabular text-sm text-ink-soft">
            {docs.length === 0
              ? "Nothing in progress"
              : `${docs.length} file${docs.length === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"} in progress`}
          </span>
          <span className="flex items-center gap-1 text-sm font-medium text-registry">
            {docs.length === 0 ? "Start" : "Continue"}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}

export function Home() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 pt-14 pb-20">
        <h1 className="max-w-2xl font-display text-[44px] leading-[1.05] font-semibold tracking-tight">
          Papers ready for filing.
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-soft">
          Every page is fitted to A4 and turned to read like a bound book.
          Scans, Word exports and protected files are handled the same way.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <ToolCard
            tool="bundle"
            tab="Bundle"
            title="Bundle of Authorities"
            body="Cover and index first, then each authority behind its own TAB sheet, numbered top right."
            points={[
              "TAB divider sheets and running page numbers",
              "Index with page references, ready to paste into Word",
              "Reorder, rename and fix any page before export",
            ]}
            path="/bundle"
          />
          <ToolCard
            tool="fixer"
            tab="Fixer"
            title="PDF Fixer"
            body="Straighten and resize any PDFs, then save them as one file or one file each."
            points={[
              "Rotate, recolour, insert or remove pages",
              "Optional page numbers",
              "Merge in your order, or keep files separate",
            ]}
            path="/fixer"
          />
        </div>

        <section className="mt-16 grid items-center gap-8 rounded-lg border border-rule bg-sheet/60 p-8 md:grid-cols-[1fr_340px]">
          <div>
            <h2 className="font-display text-xl font-semibold">
              How pages are turned
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Picture the bundle bound on the left. Portrait pages sit upright.
              Landscape pages — tables, plans, spreadsheets — are turned so
              their top faces the spine: give the bundle a quarter turn
              clockwise and they read straight.
            </p>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Direction is read from the text, or from the page image when a
              scan has no text. Pages it cannot read with confidence are left as
              they are and marked{" "}
              <span className="rounded bg-caution-soft px-1.5 py-0.5 text-[13px] font-medium text-caution">
                Check
              </span>
              .
            </p>
          </div>
          <BindingDiagram />
        </section>

        <p className="mt-8 flex items-center gap-2 text-sm text-ink-soft">
          <Lock className="size-4" />
          Files stay on this computer. Work is saved in this browser until you
          delete it.
        </p>
      </div>
    </div>
  )
}
