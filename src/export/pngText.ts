// Read + write PNG `tEXt` metadata chunks, dependency-free. Used to embed the fractal recipe JSON in
// an exported PNG so the image can later be reopened. Pure & isomorphic (works in the worker, main
// thread, and Vitest) — only Uint8Array + TextEncoder/TextDecoder.
//
// tEXt is Latin-1 only, so we store the recipe as base64'd UTF-8 (ASCII-clean, round-trips any Unicode
// in user-given names). A chunk is [length(4 BE)][type(4)][data][CRC32(4 BE)], CRC over type+data; we
// splice the new chunk in just before IEND. See the PNG spec, §11.3.4.3.

import { RECIPE_KEYWORD } from './recipe'

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64.length; i += 1) t[B64.charCodeAt(i)] = i
  return t
})()

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const has1 = i + 1 < bytes.length
    const has2 = i + 2 < bytes.length
    const b1 = has1 ? bytes[i + 1] : 0
    const b2 = has2 ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += has1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += has2 ? B64[b2 & 63] : '='
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array {
  let len = b64.length
  while (len > 0 && b64[len - 1] === '=') len -= 1
  const out = new Uint8Array((len * 6) >> 3)
  let acc = 0
  let bits = 0
  let oi = 0
  for (let i = 0; i < len; i += 1) {
    const v = B64_LOOKUP[b64.charCodeAt(i) & 0x7f] ?? -1
    if (v < 0) continue
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[oi] = (acc >> bits) & 0xff
      oi += 1
    }
  }
  return out.subarray(0, oi)
}

function isPng(png: Uint8Array): boolean {
  if (png.length < 8) return false
  for (let i = 0; i < 8; i += 1) if (png[i] !== SIGNATURE[i]) return false
  return true
}

function readU32(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0
}

function chunkType(b: Uint8Array, off: number): string {
  return String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7])
}

// Build a full chunk (length + type + data + CRC) for a 4-char ASCII type.
function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i += 1) body[i] = type.charCodeAt(i)
  body.set(data, 4)
  const chunk = new Uint8Array(4 + body.length + 4)
  const len = data.length
  chunk[0] = (len >>> 24) & 0xff
  chunk[1] = (len >>> 16) & 0xff
  chunk[2] = (len >>> 8) & 0xff
  chunk[3] = len & 0xff
  chunk.set(body, 4)
  const crc = crc32(body)
  const at = 4 + body.length
  chunk[at] = (crc >>> 24) & 0xff
  chunk[at + 1] = (crc >>> 16) & 0xff
  chunk[at + 2] = (crc >>> 8) & 0xff
  chunk[at + 3] = crc & 0xff
  return chunk
}

// Latin-1 tEXt data: keyword + 0x00 + text. Both ASCII here (keyword is fixed; text is base64).
function textChunkData(keyword: string, text: string): Uint8Array {
  const data = new Uint8Array(keyword.length + 1 + text.length)
  for (let i = 0; i < keyword.length; i += 1) data[i] = keyword.charCodeAt(i) & 0xff
  data[keyword.length] = 0
  for (let i = 0; i < text.length; i += 1) data[keyword.length + 1 + i] = text.charCodeAt(i) & 0xff
  return data
}

// Insert a tEXt chunk carrying `text` under `keyword`, just before IEND. Throws on a non-PNG input
// (we only ever pass our own freshly-encoded PNG). Returns a fresh ArrayBuffer-backed array (so it's
// a valid BlobPart for the caller).
export function embedText(png: Uint8Array, keyword: string, text: string): Uint8Array<ArrayBuffer> {
  if (!isPng(png)) throw new Error('embedText: not a PNG')
  const chunk = makeChunk('tEXt', textChunkData(keyword, text))

  let off = 8
  let iendOff = -1
  while (off + 12 <= png.length) {
    const len = readU32(png, off)
    if (chunkType(png, off) === 'IEND') {
      iendOff = off
      break
    }
    off += 12 + len
  }
  if (iendOff < 0) throw new Error('embedText: no IEND chunk')

  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, iendOff), 0)
  out.set(chunk, iendOff)
  out.set(png.subarray(iendOff), iendOff + chunk.length)
  return out
}

// Read the text of the first tEXt chunk matching `keyword`, or null if absent / not a PNG.
export function readText(png: Uint8Array, keyword: string): string | null {
  if (!isPng(png)) return null
  let off = 8
  while (off + 12 <= png.length) {
    const len = readU32(png, off)
    if (chunkType(png, off) === 'tEXt') {
      const dataStart = off + 8
      const data = png.subarray(dataStart, dataStart + len)
      let nul = 0
      while (nul < data.length && data[nul] !== 0) nul += 1
      let kw = ''
      for (let i = 0; i < nul; i += 1) kw += String.fromCharCode(data[i])
      if (kw === keyword) {
        let text = ''
        for (let i = nul + 1; i < data.length; i += 1) text += String.fromCharCode(data[i])
        return text
      }
    }
    off += 12 + len
  }
  return null
}

// Embed a recipe JSON string into a PNG under the recipe keyword (base64'd UTF-8).
export function encodeRecipeToPng(png: Uint8Array, recipeJson: string): Uint8Array<ArrayBuffer> {
  const utf8 = new TextEncoder().encode(recipeJson)
  return embedText(png, RECIPE_KEYWORD, bytesToBase64(utf8))
}

// Read the recipe JSON string back out of a PNG, or null if it carries none.
export function decodeRecipeFromPng(png: Uint8Array): string | null {
  const b64 = readText(png, RECIPE_KEYWORD)
  if (b64 == null) return null
  return new TextDecoder().decode(base64ToBytes(b64))
}
