import { useEffect, type ReactNode } from "react"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/features/app-shell"
import { HomeScreen } from "@/features/home-screen"
import { Workspace } from "@/features/workspace"
import { useJob } from "@/features/store"

function Hydrate({ children }: { children: ReactNode }) {
  const hydrate = useJob((state) => state.hydrate)
  const ready = useJob((state) => state.ready)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!ready) return null
  return children
}

export function App() {
  return (
    <Hydrate>
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomeScreen />} />
          <Route path="combine" element={<Workspace mode="combine" />} />
          <Route path="bundle" element={<Workspace mode="bundle" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
    </Hydrate>
  )
}

export default App
