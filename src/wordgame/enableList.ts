// Lazy-load the full ENABLE word list (the public-domain "Enhanced North American Benchmark LExicon",
// ~172k words, one per line) as its OWN chunk — fetched only when the word game mounts, so the ~1.7 MB
// of word data never weighs on the rest of the app. The dynamic import is what makes it a separate,
// content-hashed chunk; `?raw` hands back the file text.
export async function loadEnableWords(): Promise<string[]> {
  const mod = await import('./enable1.txt?raw')
  return mod.default.split('\n').map((w) => w.trim()).filter(Boolean)
}
