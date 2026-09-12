import { useNavigate } from "react-router-dom"

import { useJob } from "./store"

export function HomeScreen() {
  const navigate = useNavigate()
  const docs = useJob((s) => s.docs)
  const mode = useJob((s) => s.mode)
  const pendingNames = useJob((s) => s.pendingNames)
  const setPendingFiles = useJob((s) => s.setPendingFiles)
  const setMode = useJob((s) => s.setMode)

  function open(mode: "combine" | "bundle") {
    setMode(mode)
    navigate(mode === "combine" ? "/combine" : "/bundle")
  }

  return (
    <section className="home" aria-label="Command centre">
      <div className="home-inner">
        <p className="eyebrow">Legal Document Organiser</p>
        <h1>Prepare the papers.</h1>
        <p className="lede">
          Combine files for filing, or build a bundle of authorities — cover, tabs,
          and a Word index.
        </p>
        <div className="jobs">
          <button className="job" type="button" onClick={() => open("combine")}>
            <kbd>PDF</kbd>
            <strong>Combine</strong>
            <span>
              Join several documents into one A4 file. Auto-fix first; correct any
              page by hand.
            </span>
          </button>
          <button className="job" type="button" onClick={() => open("bundle")}>
            <kbd>Court</kbd>
            <strong>Bundle of Authorities</strong>
            <span>
              Cover, tabs, numbering, Word index. Pages are auto-fixed; you can
              override any sheet.
            </span>
          </button>
        </div>
        <div
          className="home-drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            setPendingFiles(Array.from(event.dataTransfer.files))
          }}
        >
          {pendingNames.length > 0
            ? `${pendingNames.length} PDF${pendingNames.length === 1 ? "" : "s"} ready — choose Combine or Bundle`
            : "Drop PDFs anywhere on this page, then choose Combine or Bundle"}
        </div>
        <div className="recents">
          <h2>Recent</h2>
          {docs.length === 0 ? (
            <p className="hint" style={{ padding: "14px 0" }}>
              Sessions stay in this browser until you reset.
            </p>
          ) : (
            <button
              className="recent"
              type="button"
              onClick={() => open(mode)}
            >
              <span className="kind">
                {mode === "bundle" ? "Bundle" : "Combine"}
              </span>
              <span className="title">
                {docs.map((doc) => doc.fileName).join(", ")}
              </span>
              <span className="when">This session</span>
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
