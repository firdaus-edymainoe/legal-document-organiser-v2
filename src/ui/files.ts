/** Open the system file picker for PDFs. */
export function pickPdfs(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/pdf,.pdf"
    input.multiple = multiple
    input.addEventListener(
      "change",
      () => resolve(Array.from(input.files ?? [])),
      { once: true }
    )
    input.addEventListener("cancel", () => resolve([]), { once: true })
    input.click()
  })
}

export function filesFromDrop(event: React.DragEvent): File[] {
  return Array.from(event.dataTransfer.files ?? [])
}

export function isFileDrag(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types ?? []).includes("Files")
}
