# AGENTS.md

Client-only Vite + React 19 app. No backend. See README for behaviour.

## Layout

- `src/pdf-kernel/` — pure logic, runs in Node tests.
  - `rules.ts` — the binding rule (`bindingRotation`). Single source of truth for turning.
  - `orientation/` — `text.ts` (pdf.js text items → angle, stamp filtering), `image.ts`
    (bitmap → angle with confidence), `decide.ts` (combine, decide what needs review).
  - `pdflib/` — pdf-lib work for the worker: `probe.ts` (can it be copied as vectors?),
    `compose.ts` (build A4 sheets), `annotations.ts` (flatten printable annotations),
    `embed.ts` (batch `embedPages` per source — never `embedPage` in a loop, it duplicates
    shared resources).
  - `worker/` — one pdf-lib worker, one job at a time.
- `src/engine/` — browser-only pdf.js: open (with password), render, analyse, rasterise,
  thumbnails. pdf.js needs `wasmUrl`/fonts/cmaps (served from `/pdfjs/` by the Vite plugin
  in `vite.config.ts`) or CCITT/JBIG2 scans render blank. Destroy documents via
  `doc.loadingTask.destroy()` (v6 removed `PDFDocumentProxy.destroy`).
- `src/state/` — zustand store (`store.ts`), pure output planning (`plan.ts`), export,
  IndexedDB persistence.
- `src/ui/` — screens and components.

## Rules

- Output sheets are always portrait A4, `/Rotate 0`. Rotation is applied when drawing.
- Analysis renders source and copy at the same scale before comparing.
- Orientation detector resolution is 1200 px long side; lower resolutions mis-read real scans.

## Commands

```bash
npm run dev
npm test
npm run lint
npm run build
```
