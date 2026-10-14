import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { cn } from "cn"
import { Download, MoreHorizontal, Redo2, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { runExport } from "@/state/export"
import {
  clearEverything,
  clearWorkspace,
  redo,
  undo,
  useStore,
} from "@/state/store"
import type { Tool } from "@/state/types"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="5"
        y="3"
        width="14"
        height="18"
        rx="1.5"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5 3h3v18H5z" fill="currentColor" />
      <path
        d="M11 8h5M11 11h5M11 14h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M19 6h1.6a.9.9 0 0 1 .9.9v2.2a.9.9 0 0 1-.9.9H19z"
        fill="var(--manila)"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}

const TOOLS: { tool: Tool; label: string; path: string }[] = [
  { tool: "bundle", label: "Bundle of Authorities", path: "/bundle" },
  { tool: "fixer", label: "PDF Fixer", path: "/fixer" },
]

function IconAction({
  label,
  shortcut,
  onClick,
  disabled,
  children,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-1 opacity-60">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const tool: Tool | null = location.pathname.startsWith("/bundle")
    ? "bundle"
    : location.pathname.startsWith("/fixer")
      ? "fixer"
      : null
  const history = useStore((s) => (tool ? s.history[tool] : null))
  const docCount = useStore((s) => (tool ? s.workspaces[tool].docs.length : 0))
  const exporting = useStore((s) => s.exportState.phase === "running")
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+"

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-4 border-b border-rule bg-sheet px-4">
        <NavLink
          to="/"
          className="flex items-center gap-2 rounded-md text-registry"
        >
          <BrandMark className="size-6" />
          <span className="hidden font-display text-[17px] font-semibold tracking-tight text-ink sm:inline">
            Legal Organiser
          </span>
        </NavLink>
        <nav
          aria-label="Tools"
          className="ml-2 flex h-full items-stretch gap-1"
        >
          {TOOLS.map((t) => (
            <NavLink
              key={t.tool}
              to={t.path}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center px-2 text-sm font-medium whitespace-nowrap text-ink-soft transition-colors hover:text-ink sm:px-3",
                  isActive &&
                    "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-registry"
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        {tool ? (
          <div className="flex items-center gap-1">
            <IconAction
              label="Undo"
              shortcut={`${mod}Z`}
              onClick={() => undo(tool)}
              disabled={!history?.past.length}
            >
              <Undo2 />
            </IconAction>
            <IconAction
              label="Redo"
              shortcut={`${mod}⇧Z`}
              onClick={() => redo(tool)}
              disabled={!history?.future.length}
            >
              <Redo2 />
            </IconAction>
            <Menu>
              <MenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="More" />
                }
              >
                <MoreHorizontal />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem
                  destructive
                  disabled={docCount === 0}
                  onClick={() => {
                    if (confirm("Remove every file from this workspace?"))
                      void clearWorkspace(tool)
                  }}
                >
                  <Trash2 /> Clear this workspace
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  destructive
                  onClick={() => {
                    if (
                      confirm(
                        "Delete all files and work saved in this browser, for both tools? This cannot be undone."
                      )
                    ) {
                      void clearEverything().then(() => navigate("/"))
                    }
                  }}
                >
                  <Trash2 /> Delete everything saved in this browser
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button
              className="ml-2 h-8 px-3"
              disabled={docCount === 0 || exporting}
              onClick={() => void runExport(tool)}
            >
              <Download />
              {tool === "bundle" ? "Export bundle" : "Export"}
            </Button>
          </div>
        ) : null}
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
