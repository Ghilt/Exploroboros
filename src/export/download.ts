// Trigger a browser download of a Blob, and a couple of object-URL helpers. DOM-only (main thread).
// Object URLs (not data URLs) keep large PNGs out of the JS string heap; callers must revoke the URLs
// they hold (the export strip does this on remove/unmount).

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the download has had a chance to start; revoking immediately can cancel it.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// A filesystem-safe export filename, e.g. "exploroboros-square-800-3200px.png".
export function exportFilename(tilingId: string, gridN: number, longEdgePx: number): string {
  const safe = tilingId.replace(/[^a-z0-9-]+/gi, '-')
  return `exploroboros-${safe}-${gridN}-${longEdgePx}px.png`
}
