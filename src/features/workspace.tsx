import { useEffect } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { tocAsWordText, buildComposePlan } from "@/pdf-kernel"
import { PdfPageCanvas } from "./pdf-page"
import {
  getDocBytes,
  jobStats,
  tabNumber,
  useJob,
} from "./store"
import type { DocRecord, JobMode } from "./job-types"

export function Workspace({ mode }: { mode: JobMode }) {
  const setMode = useJob((s) => s.setMode)
  const takePendingFiles = useJob((s) => s.takePendingFiles)
  const addFiles = useJob((s) => s.addFiles)
  const docs = useJob((s) => s.docs)
  const selectedDocId = useJob((s) => s.selectedDocId)
  const selectedPage = useJob((s) => s.selectedPage)
  const autofixEnabled = useJob((s) => s.autofixEnabled)
  const pageView = useJob((s) => s.pageView)
  const settings = useJob((s) => s.settings)
  const busy = useJob((s) => s.busy)
  const selectDoc = useJob((s) => s.selectDoc)
  const selectPage = useJob((s) => s.selectPage)
  const setPageView = useJob((s) => s.setPageView)
  const rotateSelected = useJob((s) => s.rotateSelected)
  const resetSelected = useJob((s) => s.resetSelected)
  const setAutofixEnabled = useJob((s) => s.setAutofixEnabled)
  const setPageNumbers = useJob((s) => s.setPageNumbers)
  const setStartNumber = useJob((s) => s.setStartNumber)
  const setTabDividers = useJob((s) => s.setTabDividers)

  useEffect(() => {
    setMode(mode)
    const pending = takePendingFiles()
    if (pending.length > 0) void addFiles(pending)
  }, [mode, addFiles, setMode, takePendingFiles])

  const selected = docs.find((doc) => doc.id === selectedDocId) ?? docs[0]
  const page = selected?.pages[selectedPage]
  const stats = jobStats(docs)
  const override = Boolean(page?.userOverride)
  const view = !autofixEnabled ? "original" : pageView
  const previewKind = view === "original" ? "orig" : view === "auto" ? "auto" : "current"
  const previewBytes = selected ? getDocBytes(selected.id, previewKind) : undefined

  const bodyDocs = docs.filter((doc) => doc.role !== "cover")
  const toc = buildComposePlan({
    cover: docs.find((doc) => doc.role === "cover")
      ? {
          id: "cover",
          fileName: "cover",
          bytes: new Uint8Array(),
          pageCount: docs.find((doc) => doc.role === "cover")?.pageCount ?? 0,
        }
      : null,
    documents: bodyDocs.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      bytes: new Uint8Array(),
      pageCount: doc.pageCount,
    })),
    settings,
  }).toc

  function onDrop(files: FileList | File[], role?: "cover" | "doc") {
    void addFiles(Array.from(files), role)
  }

  async function copyIndex() {
    try {
      await navigator.clipboard.writeText(tocAsWordText(toc))
      toast.success("Index copied for Word")
    } catch {
      toast.error("Could not copy the index")
    }
  }

  const flag = pageFlag(view, override, page)
  const pageNeedsCheck = Boolean(page && !page.autoFixed && page.issues.length > 0)
  const pageWasAutoFixed = Boolean(page?.autoFixed)

  return (
    <div
      className="workspace"
      data-mode={mode}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onDrop(event.dataTransfer.files)
      }}
    >
      <aside className="spine pane">
        <div className="pane-label">{mode === "bundle" ? "Spine" : "Files"}</div>
        {docs.length > 0 ? (
          autofixEnabled ? (
          <p className="auto-summary">
            Auto-fix ran on drop.{" "}
            <strong>
              {stats.autoFixed} of {stats.total} pages
            </strong>{" "}
            normalised to A4.
          </p>
          ) : (
          <p className="auto-summary">Showing originals. Auto-fix is not applied.</p>
          )
        ) : null}
        {mode === "bundle" ? (
          <label className="drop">
            Drop cover PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) onDrop(event.target.files, "cover")
                event.target.value = ""
              }}
            />
          </label>
        ) : null}
        {docs.map((doc) => (
          <FileRow
            key={doc.id}
            doc={doc}
            mode={mode}
            active={doc.id === selected?.id}
            autofixEnabled={autofixEnabled}
            onSelect={() => selectDoc(doc.id)}
          />
        ))}
        <label className="drop">
          {mode === "bundle" ? "Drop the authorities" : "Drop PDFs to combine"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) onDrop(event.target.files)
              event.target.value = ""
            }}
          />
        </label>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Page version">
            <button
              type="button"
              aria-pressed={view === "original"}
              onClick={() => setPageView("original")}
            >
              Original
            </button>
            <button
              type="button"
              aria-pressed={view === "auto"}
              disabled={!autofixEnabled}
              onClick={() => setPageView("auto")}
            >
              Auto-fix
            </button>
            <button
              type="button"
              aria-pressed={view === "manual"}
              disabled={!override}
              onClick={() => setPageView("manual")}
            >
              Yours
            </button>
          </div>
          <button type="button" disabled={busy || !autofixEnabled} onClick={() => void rotateSelected(270)}>
            Rotate left
          </button>
          <button type="button" disabled={busy || !autofixEnabled} onClick={() => void rotateSelected(90)}>
            Rotate right
          </button>
          <button type="button" disabled={busy || !autofixEnabled} onClick={() => void resetSelected()}>
            Fit to A4
          </button>
          <span className="spacer" />
          <span>
            {selected
              ? `${selected.fileName} · p. ${selectedPage + 1} of ${selected.pageCount || 1}`
              : "No file selected"}
          </span>
        </div>
        <div className="page-wrap">
          <article className={`page ${view === "original" ? "view-original" : ""}`}>
            {flag ? <div className={`page-flag ${flag.tone}`}>{flag.label}</div> : null}
            {selected && previewBytes ? (
              <PdfPageCanvas
                key={`${selected.id}-${previewKind}-${selectedPage}`}
                bytes={previewBytes}
                pageIndex={selectedPage}
                className="sheet-canvas"
              />
            ) : (
              <p className="sheet-copy">Drop PDFs to begin.</p>
            )}
          </article>
        </div>
        {selected ? (
          <div className="filmstrip">
            {selected.pages.map((item) => (
              <button
                key={item.index}
                type="button"
                className="thumb-col"
                onClick={() => selectPage(item.index)}
              >
                <div
                  className={`thumb ${item.index === selectedPage ? "on" : ""} ${
                    !item.autoFixed && item.issues.length > 0 ? "warn" : ""
                  }`}
                >
                  {item.index + 1}
                </div>
                {autofixEnabled ? (
                  <span
                    className={`pill sm ${item.userOverride ? "yours" : !item.autoFixed && item.issues.length > 0 ? "check" : ""}`}
                  >
                    {item.userOverride
                      ? "Yours"
                      : !item.autoFixed && item.issues.length > 0
                        ? "Check"
                        : item.autoFixed
                          ? "Auto"
                          : "Ready"}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </main>

      <aside className="side pane">
        <div className="pane-label">This page</div>
        <div className="side-block">
          {!selected ? (
            <p>Drop PDFs to start this job.</p>
          ) : !autofixEnabled ? (
            <p>Originals. Auto-fix is not applied to this job.</p>
          ) : override ? (
            <>
              <p className="lead">You overrode auto-fix</p>
              <p>This page will be filed as Yours. The rest of the file stays auto-fixed.</p>
              <button className="btn" type="button" onClick={() => void resetSelected()}>
                Reset to auto-fix
              </button>
            </>
          ) : (
            <>
              <p className="lead">
                {pageNeedsCheck ? "This page was not auto-fixed." : "This page is ready."}
              </p>
              <p>
                {pageNeedsCheck
                  ? "Rotate or Fit to A4 to override this sheet only."
                  : pageWasAutoFixed
                    ? "Auto-fix fitted it to A4 portrait. You can still rotate this sheet."
                    : "Already A4 portrait. You can still rotate this sheet."}
              </p>
            </>
          )}
        </div>
        <p className="auto-summary" style={{ paddingTop: 0 }}>
          <button
            type="button"
            className="keep-orig"
            onClick={() => setAutofixEnabled(!autofixEnabled)}
          >
            {autofixEnabled ? "Use originals instead" : "Apply auto-fix"}
          </button>
        </p>
        <hr className="hr" />
        {mode === "combine" ? (
          <>
            <div className="pane-label">Output</div>
            <p className="opt">{stats.total} pages in one file</p>
            <label className="opt">
              <Checkbox
                checked={settings.pageNumbers}
                onCheckedChange={(value) => setPageNumbers(value === true)}
              />
              Page numbers
            </label>
            <label className="opt">
              Start at
              <Input
                type="number"
                min={1}
                value={settings.startNumber}
                onChange={(event) => setStartNumber(Number(event.target.value))}
                className="h-7 w-14"
              />
            </label>
          </>
        ) : (
          <>
            <div className="pane-label">Index</div>
            <table>
              <thead>
                <tr>
                  <th>Tab</th>
                  <th>Authority</th>
                  <th>Page</th>
                </tr>
              </thead>
              <tbody>
                {toc.map((row) => (
                  <tr key={row.tabNumber}>
                    <td>{row.tabNumber}</td>
                    <td>{row.fileName}</td>
                    <td>{row.startPage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn copy" type="button" onClick={() => void copyIndex()}>
              Copy index for Word
            </button>
            <label className="opt">
              <Checkbox
                checked={settings.tabDividers}
                onCheckedChange={(value) => setTabDividers(value === true)}
              />
              TAB divider sheets
            </label>
            <label className="opt">
              <Checkbox
                checked={settings.pageNumbers}
                onCheckedChange={(value) => setPageNumbers(value === true)}
              />
              Number the pages
            </label>
          </>
        )}
      </aside>
    </div>
  )
}

function FileRow({
  doc,
  mode,
  active,
  autofixEnabled,
  onSelect,
}: {
  doc: DocRecord
  mode: JobMode
  active: boolean
  autofixEnabled: boolean
  onSelect: () => void
}) {
  const tab = tabNumber(useJob.getState().docs, doc.id)
  const checkCount = doc.pages.filter((page) => !page.autoFixed && page.issues.length > 0).length
  const yoursCount = doc.pages.filter((page) => page.userOverride).length
  const autoCount = doc.pages.filter((page) => page.autoFixed && !page.userOverride).length
  const pill =
    yoursCount > 0
      ? { className: "pill yours", text: `You fixed ${yoursCount}` }
      : checkCount > 0
        ? { className: "pill check", text: `${checkCount} to check` }
        : autoCount > 0
          ? { className: "pill", text: "Auto-fixed" }
          : { className: "pill", text: "Ready" }

  return (
    <button
      type="button"
      className={`file ${active ? "active" : ""}`}
      onClick={onSelect}
    >
      <span className="grip">⋮⋮</span>
      <div>
        <div className="name" title={doc.fileName}>
          {mode === "bundle" && doc.role === "cover"
            ? "Cover"
            : mode === "bundle" && tab
              ? `TAB ${tab} · ${doc.fileName}`
              : doc.fileName}
        </div>
        <div className="meta">
          {doc.status === "ready"
            ? `${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}${
                checkCount > 0 ? ` · ${autoCount} auto-fixed` : ""
              }`
            : doc.status}
        </div>
      </div>
      {autofixEnabled && doc.status === "ready" ? (
        <span className={pill.className}>{pill.text}</span>
      ) : null}
    </button>
  )
}

function pageFlag(
  view: string,
  override: boolean,
  page: DocRecord["pages"][number] | undefined,
): { tone: string; label: string } | null {
  if (!page) return null
  if (view === "original") {
    return { tone: "check", label: "Original · as dropped" }
  }
  if (override && view === "manual") {
    return { tone: "yours", label: "You overrode auto-fix" }
  }
  if (!page.autoFixed && page.issues.length > 0) {
    return { tone: "check", label: "Not auto-fixed · still needs a look" }
  }
  if (page.autoFixed) {
    return { tone: "auto", label: "Auto-fixed · A4 portrait" }
  }
  return { tone: "auto", label: "Ready · A4 portrait" }
}
