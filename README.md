# Legal Organiser

Prepares PDFs for court filing, entirely in the browser — files never leave the machine.

- **Bundle of Authorities** — cover & index, a TAB sheet before each authority, running page
  numbers, and an index that pastes into Word as a table.
- **PDF Fixer** — straighten, resize, recolour, insert or remove pages, then save as one file
  or one file each (ZIP).

Every output page is portrait A4 with no `/Rotate` flag.

## How pages are turned

The bundle is treated as a book bound on the left:

- portrait content sits upright;
- landscape content is turned so its top faces the spine (text reads bottom-to-top on the sheet).

Direction comes from the text layer when a page has real text. Otherwise the page is rendered
and read from the image (letter spacing gives the axis; ascenders vs descenders give which way
up). E-filing stamps and page numbers are ignored because they are upright on the *filed* page,
not the document. Pages the app cannot read confidently are left as they are and marked
**Check**.

## When pages become images

Pages are copied as vectors (sharp, searchable) unless:

- the file is encrypted (pdf-lib cannot decrypt) — pdf.js renders it instead, asking for the
  password if needed;
- pdf-lib cannot parse the file or a page;
- a render of the vector copy does not match pdf.js's render of the original;
- you choose **Rasterise** for a page.

Images are 200 dpi JPEG.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # kernel + planning tests
npm run build
SAMPLE_DIR=~/path/to/filings npm test   # also check orientation against real PDFs
```
