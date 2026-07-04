// Turn the in-memory export PNG (a Blob) into a compact WebP for the gallery: downscale to a max edge
// and re-encode. The recipe regenerates the real creation, so the gallery only needs a light display
// image (~0.1–0.5 MB) — never the multi-MB original. Browser-only (canvas/bitmap); uses OffscreenCanvas
// where available, else a <canvas> with toBlob.

export type CompactImage = { blob: Blob; width: number; height: number }

export async function toCompactWebp(source: Blob, maxEdge = 1200, quality = 0.8): Promise<CompactImage> {
  const bitmap = await createImageBitmap(source)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    let blob: Blob
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2D canvas unavailable')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, width, height)
      blob = await canvas.convertToBlob({ type: 'image/webp', quality })
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2D canvas unavailable')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, width, height)
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality),
      )
    }
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}
