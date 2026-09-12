# AGENTS.md

Client-only Vite + React 19 app. There is no backend.

## Features

- **Combine** (`#/combine`) — merge PDFs onto A4, optional page numbers.
- **Bundle of Authorities** (`#/bundle`) — cover, TAB dividers, numbering, Word index.

## Architecture

- `src/pdf-kernel/` — unlock, analyze, plan, normalize (embed onto fresh A4), stamp, compose. No React. Vitest in Node.
- `src/pdf-kernel/worker/` — one-job-at-a-time module worker. Main thread keeps bytes in IndexedDB.
- `src/persist/` — IndexedDB. Failed opens are retried, not cached. Reset awaits `clear()`.
- `src/features/` — Home / Combine / Bundle UI.

After ingest, every page is a new A4 portrait sheet (`MediaBox = CropBox = A4`, `/Rotate = 0`). Features must not set CropBox or `/Rotate` themselves.

Landscape policy: Combine letterboxes; Bundle rotates CCW so the sheet is portrait (court convention).

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run build
node scripts/generate-test-pdfs.mjs
```
