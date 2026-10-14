import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if (import.meta.env.DEV) {
  // Lets automated checks drive the store without the file picker.
  void import("@/state/store").then((store) =>
    Object.assign(window, { __lo: store })
  )
}
