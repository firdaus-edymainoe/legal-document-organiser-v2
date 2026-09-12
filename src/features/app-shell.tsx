import { NavLink, Outlet, useLocation } from "react-router-dom"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useJob } from "./store"

export function AppShell() {
  const location = useLocation()
  const busy = useJob((s) => s.busy)
  const docs = useJob((s) => s.docs)
  const preview = useJob((s) => s.preview)
  const download = useJob((s) => s.download)
  const screen = location.pathname === "/" ? "home" : "work"
  const mode = location.pathname.includes("bundle") ? "bundle" : "combine"

  return (
    <TooltipProvider>
      <div className="app">
        <header className="titlebar">
          <div className="brand" aria-hidden="true">
            L
          </div>
          {screen === "home" ? (
            <>
              <span className="tool-name">Command centre</span>
              <span className="hint">Start a matter, or continue recent work.</span>
            </>
          ) : mode === "combine" ? (
            <>
              <span className="tool-name">Combine PDFs</span>
              <span className="hint">One file. Optional page numbers.</span>
            </>
          ) : (
            <>
              <span className="tool-name">Bundle of Authorities</span>
              <span className="hint">Cover, tabs, and an index for Word.</span>
            </>
          )}
          <span className="spacer" />
          {screen === "work" ? (
            <>
              <button
                className="btn"
                type="button"
                disabled={busy || docs.length === 0}
                onClick={() => void preview()}
              >
                Preview
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={busy || docs.length === 0}
                onClick={() => void download()}
              >
                Save PDF
              </button>
            </>
          ) : null}
        </header>
        <div className="body">
          <nav className="rail" aria-label="Tools">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : undefined)}>
              <svg viewBox="0 0 24 24">
                <path d="M4 11 12 4l8 7" />
                <path d="M7 10v9h10v-9" />
              </svg>
              Home
            </NavLink>
            <NavLink to="/combine" className={({ isActive }) => (isActive ? "active" : undefined)}>
              <svg viewBox="0 0 24 24">
                <rect x="4" y="5" width="10" height="13" />
                <rect x="10" y="7" width="10" height="13" />
              </svg>
              Combine
            </NavLink>
            <NavLink to="/bundle" className={({ isActive }) => (isActive ? "active" : undefined)}>
              <svg viewBox="0 0 24 24">
                <path d="M6 4h12v16H6z" />
                <path d="M9 4v16" />
              </svg>
              Bundle
            </NavLink>
            <div className="gap" />
          </nav>
          <Outlet />
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
