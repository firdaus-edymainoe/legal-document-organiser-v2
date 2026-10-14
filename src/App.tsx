import { useEffect } from "react"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { hydrate, useStore } from "@/state/store"
import { AppShell } from "@/ui/app-shell"
import { Home } from "@/ui/home"
import { Workspace } from "@/ui/workspace"
import { PasswordDialog } from "@/ui/password-dialog"
import { ExportDialog } from "@/ui/export-dialog"

export function App() {
  const ready = useStore((s) => s.ready)

  useEffect(() => {
    void hydrate()
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-soft">
        Opening your workspace…
      </div>
    )
  }

  return (
    <TooltipProvider delay={300}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="bundle" element={<Workspace tool="bundle" />} />
            <Route path="fixer" element={<Workspace tool="fixer" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <PasswordDialog />
      <ExportDialog />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

export default App
