import { describe, it, expect } from 'vitest'
import { crc32, embedText, readText, encodeRecipeToPng, decodeRecipeFromPng } from './pngText'
import { RECIPE_KEYWORD } from './recipe'

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}
function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0))
}
// A minimal, structurally-valid PNG: signature + IHDR(13 zero bytes) + IEND. CRCs are not real (our
// reader doesn't verify them); the embed inserts a tEXt with a correct CRC before IEND.
function minimalPng(): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...u32(13), ...ascii('IHDR'), ...new Array(13).fill(0), 0, 0, 0, 0,
    ...u32(0), ...ascii('IEND'), 0, 0, 0, 0,
  ])
}

describe('pngText', () => {
  it('crc32 matches the canonical empty-IEND vector (0xAE426082)', () => {
    expect(crc32(new Uint8Array(ascii('IEND')))).toBe(0xae426082)
  })

  it('embeds and reads back a tEXt chunk', () => {
    const png = embedText(minimalPng(), 'mykey', 'hello world')
    expect(readText(png, 'mykey')).toBe('hello world')
    expect(png.length).toBeGreaterThan(minimalPng().length)
  })

  it('the embedded tEXt chunk carries a correct CRC', () => {
    const png = embedText(minimalPng(), 'k', 'v')
    // find the tEXt chunk, recompute its CRC over type+data, compare with the stored 4 bytes.
    let off = 8
    while (off + 12 <= png.length) {
      const len = (png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3]
      const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7])
      if (type === 'tEXt') {
        const body = png.subarray(off + 4, off + 8 + len)
        const stored = ((png[off + 8 + len] << 24) | (png[off + 9 + len] << 16) | (png[off + 10 + len] << 8) | png[off + 11 + len]) >>> 0
        expect(stored).toBe(crc32(body))
        return
      }
      off += 12 + len
    }
    throw new Error('no tEXt chunk found')
  })

  it('round-trips a recipe JSON string with Unicode through base64', () => {
    const json = JSON.stringify({ app: 'exploroboros', note: 'café — 日本語 — 🎨' })
    const png = encodeRecipeToPng(minimalPng(), json)
    expect(readText(png, RECIPE_KEYWORD)).not.toBeNull()
    expect(decodeRecipeFromPng(png)).toBe(json)
  })

  it('returns null for a non-PNG or a missing keyword', () => {
    expect(readText(new Uint8Array([1, 2, 3]), 'k')).toBeNull()
    expect(decodeRecipeFromPng(minimalPng())).toBeNull()
    expect(readText(minimalPng(), 'absent')).toBeNull()
  })

  it('throws when embedding into a non-PNG', () => {
    expect(() => embedText(new Uint8Array([1, 2, 3]), 'k', 'v')).toThrow()
  })
})
