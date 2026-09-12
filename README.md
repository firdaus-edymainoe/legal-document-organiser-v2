# Legal Document Organiser

Client-only Vite app. PDFs are unlocked, analysed, and redrawn onto portrait A4 in a web worker. Combine merges files; Bundle of Authorities adds cover, TAB sheets, numbers, and a Word index.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # PDF kernel fixtures
npm run build
```

Drop PDFs on Home, then choose Combine or Bundle. Auto-fix runs on drop; Original / Auto-fix / Yours shows what changed. **Use originals instead** skips normalisation for the whole job.
