// 100 hand-picked "random coloring" presets. Each is a harmonic palette plus how to fade it, and the
// pure builder below turns one into coloring rules on the fixed form the owner asked for:
//
//   if visited  →  fade a 3–4 colour ramp over first-step | latest-step, modulo 10..300, at 100% opacity
//   (optionally) a second rule on top, at reduced opacity, fading over visited-neighbors
//
// Palettes are curated from well-known harmonic sources (matplotlib/cmocean perceptual maps,
// ColorBrewer, and popular web gradient collections). Kept as plain data so it's pure + testable:
// coloringPresets.test.ts checks every entry is well-formed and builds to a valid rule.

import type { ColoringRule, RampStop } from '../colorizer'

// The ramp is driven by one of the two step attributes (when a tile was first/last visited by the run).
export type PresetAttr = 'first-step' | 'latest-step'

// How the palette fades across one modulo cycle:
//  - 'smooth': soft gradient that loops seamlessly (the first colour is repeated at the end).
//  - 'sharp':  soft gradient with a hard jump back to the first colour at each cycle edge (crisp rings).
//  - 'bands':  posterised hard-edged colour blocks — no blending. Limited to ≤3 colours (5-stop cap).
export type PresetFade = 'smooth' | 'sharp' | 'bands'

export type ColoringPreset = {
  name: string
  colors: readonly string[] // 3 or 4 hex colours
  attr: PresetAttr
  mod: number // 10..300
  fade: PresetFade
  // An optional second rule painted on top at reduced opacity, fading over how many neighbours are
  // visited — adds depth/texture where the pattern clusters.
  overlay?: { colors: readonly string[]; opacity: number }
}

const MAX_STOPS = 5 // mirrors colorizer MAX_RAMP_STOPS

// Neighbour counts are small (0..~8 depending on tiling); spread the overlay's stops across this many
// neighbours with explicit breakpoints (no modulo → no wrap glitch on a fully-surrounded tile).
const OVERLAY_STEP = 3

function evenStops(colors: readonly string[]): RampStop[] {
  return colors.map((hex) => ({ hex, at: null }))
}

// Posterised hard bands: each colour owns a solid slice [i·mod/k, (i+1)·mod/k). Two coincident stops
// at every interior boundary make the transition instant. k colours → 1 + 2·(k-1) stops (≤5 for k≤3).
function bandStops(colors: readonly string[], mod: number): RampStop[] {
  const k = colors.length
  const stops: RampStop[] = [{ hex: colors[0], at: 0 }]
  for (let i = 1; i < k; i += 1) {
    const at = Math.round((i * mod) / k)
    stops.push({ hex: colors[i - 1], at })
    stops.push({ hex: colors[i], at })
  }
  return stops
}

// Build the primary ramp's stops for a preset's fade style, always within the 5-stop cap.
export function presetPrimaryStops(preset: ColoringPreset): RampStop[] {
  const { colors, mod, fade } = preset
  if (fade === 'bands' && colors.length <= 3) return bandStops(colors, mod)
  if (fade === 'smooth') {
    // Loop seamlessly by repeating the first colour — but never exceed the stop cap.
    const looped = colors.length < MAX_STOPS ? [...colors, colors[0]] : colors
    return evenStops(looped)
  }
  // 'sharp' (and the 4-colour 'bands' fallback): even fade with a hard wrap edge.
  return evenStops(colors)
}

// Turn a preset into 1–2 coloring rules on the fixed form. `makeId` supplies fresh rule ids.
export function buildPresetRules(preset: ColoringPreset, makeId: () => string): ColoringRule[] {
  const rules: ColoringRule[] = [
    {
      id: makeId(),
      predicate: { kind: 'ref', id: 'visited' },
      color: { kind: 'ramp', ramp: { attr: preset.attr, mod: preset.mod, stops: presetPrimaryStops(preset) } },
      opacity: 1,
    },
  ]
  if (preset.overlay) {
    const stops: RampStop[] = preset.overlay.colors.map((hex, i) => ({ hex, at: i * OVERLAY_STEP }))
    rules.push({
      id: makeId(),
      predicate: { kind: 'ref', id: 'visited' },
      color: { kind: 'ramp', ramp: { attr: 'visited-neighbors', mod: null, stops } },
      opacity: preset.overlay.opacity,
    })
  }
  return rules
}

// Pick one preset at random (rand injectable for tests).
export function pickRandomPreset(rand: () => number = Math.random): ColoringPreset {
  const i = Math.floor(rand() * COLORING_PRESETS.length)
  return COLORING_PRESETS[Math.min(COLORING_PRESETS.length - 1, Math.max(0, i))]
}

// Pick a random preset and build its rules in one step.
export function randomColoringRules(makeId: () => string, rand: () => number = Math.random): ColoringRule[] {
  return buildPresetRules(pickRandomPreset(rand), makeId)
}

// ---- the 100 presets ----
export const COLORING_PRESETS: ReadonlyArray<ColoringPreset> = [
  // Warm sunsets — first-step rings.
  { name: 'Sunset Blaze', colors: ['#f9c80e', '#f86624', '#ea3546', '#662e9b'], attr: 'first-step', mod: 60, fade: 'smooth' },
  { name: 'Ember Glow', colors: ['#03071e', '#dc2f02', '#f48c06', '#ffba08'], attr: 'first-step', mod: 40, fade: 'smooth', overlay: { colors: ['#000000', '#ffba08'], opacity: 0.28 } },  { name: 'Mango', colors: ['#ffe259', '#ffa751', '#f76b1c'], attr: 'first-step', mod: 24, fade: 'sharp' },
  { name: 'Coral Warmth', colors: ['#ff6a88', '#ff99ac', '#ffc3a0'], attr: 'latest-step', mod: 50, fade: 'smooth' },
  { name: 'Firestorm', colors: ['#f12711', '#f5793a', '#f5af19'], attr: 'first-step', mod: 18, fade: 'bands' },
  { name: 'Desert Dusk', colors: ['#eacda3', '#d6ae7b', '#a8574e'], attr: 'first-step', mod: 45, fade: 'smooth' },
  { name: 'Lava Flow', colors: ['#480607', '#8a0303', '#c1121f', '#ff4d00'], attr: 'first-step', mod: 36, fade: 'sharp', overlay: { colors: ['#000000', '#ffdd00'], opacity: 0.25 } },
  { name: 'Papaya', colors: ['#fee140', '#fa9d5a', '#fa709a'], attr: 'latest-step', mod: 28, fade: 'smooth' },
  { name: 'Terracotta', colors: ['#c1440e', '#e2725b', '#f0a868'], attr: 'first-step', mod: 20, fade: 'bands' },

  // Cool oceans — mostly latest-step washes.
  { name: 'Deep Sea', colors: ['#012a4a', '#2a6f97', '#61a5c2', '#a9d6e5'], attr: 'latest-step', mod: 70, fade: 'smooth' },
  { name: 'Tropical Lagoon', colors: ['#0f3443', '#1f9e8f', '#34e89e'], attr: 'latest-step', mod: 40, fade: 'smooth' },
  { name: 'Arctic', colors: ['#a1c4fd', '#00c6ff', '#0072ff'], attr: 'first-step', mod: 30, fade: 'sharp' },
  { name: 'Teal Fade', colors: ['#004d61', '#008c9e', '#00c2c7', '#b2fef7'], attr: 'latest-step', mod: 55, fade: 'smooth', overlay: { colors: ['#00121a', '#b2fef7'], opacity: 0.22 } },
  { name: 'Ocean Breeze', colors: ['#134e5e', '#2193b0', '#6dd5ed'], attr: 'latest-step', mod: 34, fade: 'smooth' },
  { name: 'Seafoam', colors: ['#185a9d', '#2bb1a5', '#43cea2'], attr: 'first-step', mod: 22, fade: 'bands' },
  { name: 'Glacier', colors: ['#e0eafc', '#8ba6d1', '#4b6cb7'], attr: 'latest-step', mod: 26, fade: 'sharp' },
  { name: 'Cyan Dream', colors: ['#005c97', '#0093e9', '#80d0c7'], attr: 'latest-step', mod: 42, fade: 'smooth' },
  { name: 'Nautical', colors: ['#001f3f', '#0074d9', '#7fdbff'], attr: 'first-step', mod: 30, fade: 'bands' },
  // Neon / cyberpunk — crisp, saturated.
  { name: 'Cyberpunk', colors: ['#ff006e', '#8338ec', '#3a86ff'], attr: 'first-step', mod: 24, fade: 'sharp', overlay: { colors: ['#05010f', '#00f5d4'], opacity: 0.25 } },
  { name: 'Neon Nights', colors: ['#f72585', '#7209b7', '#3a0ca3', '#4361ee'], attr: 'first-step', mod: 44, fade: 'smooth' },
  { name: 'Synthwave', colors: ['#ff2a6d', '#d1006c', '#05d9e8', '#005678'], attr: 'first-step', mod: 36, fade: 'sharp' },
  { name: 'Vaporwave', colors: ['#ff71ce', '#01cdfe', '#05ffa1'], attr: 'latest-step', mod: 21, fade: 'bands' },
  { name: 'Electric', colors: ['#00f5d4', '#00bbf9', '#f15bb5'], attr: 'latest-step', mod: 30, fade: 'smooth' },
  { name: 'Laser', colors: ['#fee440', '#f15bb5', '#9b5de5'], attr: 'first-step', mod: 27, fade: 'sharp' },  { name: 'Toxic', colors: ['#a8ff00', '#00ff9f', '#00b8ff'], attr: 'first-step', mod: 18, fade: 'bands' },
  { name: 'Hotline', colors: ['#ff1361', '#ff7a00', '#fff800'], attr: 'first-step', mod: 22, fade: 'sharp' },
  { name: 'Ultraviolet', colors: ['#301934', '#654ea3', '#eaafc8'], attr: 'latest-step', mod: 38, fade: 'smooth' },

  // Pastels — soft latest-step washes.
  { name: 'Cotton Candy', colors: ['#a1c4fd', '#c2e9fb', '#fbc2eb'], attr: 'latest-step', mod: 50, fade: 'smooth' },
  { name: 'Macaron', colors: ['#ffd3a5', '#fda1a1', '#fd6585'], attr: 'latest-step', mod: 44, fade: 'smooth' },
  { name: 'Baby Bloom', colors: ['#fbc2eb', '#cbb5ee', '#a6c1ee'], attr: 'latest-step', mod: 30, fade: 'sharp' },
  { name: 'Mint Cream', colors: ['#d4fc79', '#b5ee8d', '#96e6a1'], attr: 'latest-step', mod: 36, fade: 'smooth' },
  { name: 'Lavender Haze', colors: ['#e0c3fc', '#b7c4fc', '#8ec5fc'], attr: 'latest-step', mod: 48, fade: 'smooth' },
  { name: 'Peachy', colors: ['#fff0e0', '#ffecd2', '#fcb69f'], attr: 'latest-step', mod: 40, fade: 'smooth' },  { name: 'Sorbet', colors: ['#fceabb', '#f8b5c1', '#c2aee6'], attr: 'latest-step', mod: 46, fade: 'smooth' },
  { name: 'Sky Pastel', colors: ['#accbee', '#c9e0f5', '#e7f0fd'], attr: 'latest-step', mod: 42, fade: 'smooth' },
  // Forest / earth — first-step growth.
  { name: 'Forest Deep', colors: ['#0b3d2e', '#1e5631', '#4c9141', '#a4de02'], attr: 'first-step', mod: 60, fade: 'smooth', overlay: { colors: ['#02140d', '#d7ff9e'], opacity: 0.2 } },
  { name: 'Moss', colors: ['#1a3c1a', '#2c5f2d', '#97bc62'], attr: 'first-step', mod: 24, fade: 'bands' },
  { name: 'Woodland', colors: ['#3e2723', '#6d4c41', '#a1887f', '#d7ccc8'], attr: 'first-step', mod: 50, fade: 'smooth' },
  { name: 'Olive Grove', colors: ['#283618', '#606c38', '#bc6c25', '#dda15e'], attr: 'first-step', mod: 40, fade: 'sharp' },
  { name: 'Sage', colors: ['#4b6043', '#87986a', '#cbd18f'], attr: 'latest-step', mod: 36, fade: 'smooth' },
  { name: 'Autumn Leaves', colors: ['#582f0e', '#7f4f24', '#a68a64', '#c2c5aa'], attr: 'first-step', mod: 55, fade: 'smooth' },
  { name: 'Pine', colors: ['#04471c', '#058c42', '#16db65'], attr: 'first-step', mod: 20, fade: 'bands' },
  { name: 'Clay', colors: ['#582f0e', '#936639', '#b6ad90'], attr: 'first-step', mod: 44, fade: 'smooth' },
  { name: 'Fern', colors: ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7'], attr: 'first-step', mod: 52, fade: 'smooth' },
  { name: 'Harvest', colors: ['#606c38', '#dda15e', '#bc6c25'], attr: 'latest-step', mod: 26, fade: 'bands' },

  // Purples / berry.
  { name: 'Grape', colors: ['#3c096c', '#5a189a', '#7b2cbf', '#9d4edd'], attr: 'latest-step', mod: 48, fade: 'smooth' },
  { name: 'Berry', colors: ['#590d22', '#a4133c', '#ff4d6d', '#ff8fa3'], attr: 'first-step', mod: 44, fade: 'smooth', overlay: { colors: ['#1a0008', '#ffd6de'], opacity: 0.22 } },
  { name: 'Plum', colors: ['#2d00f7', '#6a00f4', '#8900f2', '#a100f2'], attr: 'first-step', mod: 30, fade: 'sharp' },
  { name: 'Mulberry', colors: ['#3d0e61', '#7b337d', '#c85d8e'], attr: 'latest-step', mod: 22, fade: 'bands' },
  { name: 'Orchid', colors: ['#8e2de2', '#6a17e1', '#4a00e0'], attr: 'latest-step', mod: 34, fade: 'smooth' },
  { name: 'Wine', colors: ['#4a0e0e', '#7b1e1e', '#b33030'], attr: 'first-step', mod: 26, fade: 'sharp' },
  { name: 'Amethyst', colors: ['#c471ed', '#9d50bb', '#6e48aa'], attr: 'latest-step', mod: 40, fade: 'smooth' },
  { name: 'Fuchsia', colors: ['#f72585', '#b5179e', '#7209b7'], attr: 'first-step', mod: 24, fade: 'bands' },
  { name: 'Royal', colors: ['#240046', '#3c096c', '#5a189a', '#9d4edd'], attr: 'first-step', mod: 58, fade: 'smooth' },
  // Rainbow / spectral — bold multi-hue.
  { name: 'Spectral', colors: ['#d53e4f', '#fee08b', '#99d594', '#3288bd'], attr: 'first-step', mod: 48, fade: 'sharp' },
  { name: 'Rainbow', colors: ['#ff0000', '#ffff00', '#00ff00', '#0000ff'], attr: 'first-step', mod: 40, fade: 'sharp' },
  { name: 'Prism', colors: ['#f94144', '#f9c74f', '#90be6d', '#577590'], attr: 'first-step', mod: 55, fade: 'smooth' },
  { name: 'Jewel', colors: ['#e63946', '#f1faee', '#a8dadc', '#457b9d'], attr: 'latest-step', mod: 50, fade: 'smooth' },
  { name: 'Carnival', colors: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4'], attr: 'first-step', mod: 30, fade: 'sharp' },
  { name: 'Mardi Gras', colors: ['#8338ec', '#ffbe0b', '#06d6a0'], attr: 'first-step', mod: 27, fade: 'sharp' },
  { name: 'Fiesta', colors: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'], attr: 'first-step', mod: 52, fade: 'smooth', overlay: { colors: ['#04121a', '#ffffff'], opacity: 0.18 } },  { name: 'Tie Dye', colors: ['#ff5f6d', '#ffc371', '#47cf73', '#3a7bd5'], attr: 'first-step', mod: 60, fade: 'smooth' },
  { name: 'Chroma', colors: ['#ff0f7b', '#f8567f', '#f89b29'], attr: 'latest-step', mod: 22, fade: 'sharp' },

  // Matplotlib / perceptual — smooth "pulse" (dark→light→dark).
  { name: 'Viridis', colors: ['#440154', '#31688e', '#35b779', '#fde725'], attr: 'latest-step', mod: 64, fade: 'smooth' },
  { name: 'Magma', colors: ['#000004', '#51127c', '#b73779', '#fc8961'], attr: 'latest-step', mod: 48, fade: 'smooth' },
  { name: 'Inferno', colors: ['#000004', '#bc3754', '#f98e09', '#fcffa4'], attr: 'first-step', mod: 44, fade: 'smooth', overlay: { colors: ['#000000', '#fcffa4'], opacity: 0.24 } },
  { name: 'Plasma', colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540'], attr: 'latest-step', mod: 50, fade: 'smooth' },
  { name: 'Cividis', colors: ['#00224e', '#35577d', '#a99d59', '#fee838'], attr: 'latest-step', mod: 46, fade: 'smooth' },
  { name: 'Turbo', colors: ['#30123b', '#1fc9dd', '#a4fc3b', '#f9a339'], attr: 'first-step', mod: 40, fade: 'sharp' },
  { name: 'Twilight', colors: ['#372772', '#7d5ba6', '#e2d9e2'], attr: 'latest-step', mod: 52, fade: 'smooth' },  { name: 'Rocket', colors: ['#03051a', '#7c1d6f', '#dc3977', '#faebdd'], attr: 'latest-step', mod: 50, fade: 'smooth' },
  { name: 'Icefire', colors: ['#2a788e', '#0a0a0a', '#8a2846'], attr: 'first-step', mod: 40, fade: 'sharp' },

  // Mono / duotone — high-contrast, great as posterised bands.
  { name: 'Mono Blue', colors: ['#0a2463', '#3e92cc', '#d8f1ff'], attr: 'first-step', mod: 20, fade: 'bands' },
  { name: 'Mono Red', colors: ['#2b0000', '#8b0000', '#ff4d4d'], attr: 'first-step', mod: 18, fade: 'bands' },
  { name: 'Mono Green', colors: ['#0a2f1d', '#1e7d4f', '#7fffb0'], attr: 'first-step', mod: 22, fade: 'bands' },
  { name: 'Mono Purple', colors: ['#1a0033', '#5b0e91', '#c77dff'], attr: 'first-step', mod: 24, fade: 'bands' },
  { name: 'Grayscale', colors: ['#111111', '#888888', '#eeeeee'], attr: 'first-step', mod: 16, fade: 'bands' },
  { name: 'Sepia', colors: ['#2b1d0e', '#8a6d3b', '#e6d3a3'], attr: 'latest-step', mod: 40, fade: 'smooth' },
  { name: 'Ink', colors: ['#0d1b2a', '#415a77', '#e0e1dd'], attr: 'first-step', mod: 28, fade: 'sharp' },
  { name: 'Slate', colors: ['#1b263b', '#778da9', '#e0e1dd'], attr: 'latest-step', mod: 36, fade: 'smooth' },
  { name: 'Copper', colors: ['#4e2a14', '#b06834', '#e8b17a'], attr: 'latest-step', mod: 34, fade: 'smooth' },
  { name: 'Steel', colors: ['#232526', '#37393b', '#414345'], attr: 'first-step', mod: 30, fade: 'sharp' },

  // Vibrant miscellany.
  { name: 'Watermelon', colors: ['#00b894', '#ff7675', '#2d3436'], attr: 'first-step', mod: 26, fade: 'sharp' },
  { name: 'Dragonfruit', colors: ['#ee0979', '#f73a4d', '#ff6a00'], attr: 'latest-step', mod: 30, fade: 'smooth' },
  { name: 'Citrus', colors: ['#fdc830', '#f89a34', '#f37335'], attr: 'first-step', mod: 20, fade: 'bands' },  { name: 'Flamingo', colors: ['#f093fb', '#f375b3', '#f5576c'], attr: 'latest-step', mod: 44, fade: 'smooth' },
  { name: 'Emerald City', colors: ['#11998e', '#43e97b', '#38f9d7'], attr: 'latest-step', mod: 42, fade: 'smooth' },
  { name: 'Sunburst', colors: ['#f83600', '#fb6b00', '#fe8c00'], attr: 'first-step', mod: 22, fade: 'bands' },
  { name: 'Cosmic', colors: ['#360033', '#204f6b', '#0b8793'], attr: 'first-step', mod: 46, fade: 'smooth', overlay: { colors: ['#0a0010', '#4fe0d8'], opacity: 0.22 } },
  { name: 'Northern Lights', colors: ['#43cea2', '#185a9d', '#7b4397'], attr: 'first-step', mod: 40, fade: 'sharp' },
  // A final wave — 10 more spanning the range of moods & mods (10..300).
  { name: 'Tight Rings', colors: ['#ff4d6d', '#ffd60a', '#38b000'], attr: 'first-step', mod: 12, fade: 'bands' },
  { name: 'Broad Sweep', colors: ['#03045e', '#0077b6', '#00b4d8', '#caf0f8'], attr: 'first-step', mod: 240, fade: 'smooth' },
  { name: 'Wide Aurora', colors: ['#231557', '#44107a', '#ff1361', '#fff800'], attr: 'first-step', mod: 180, fade: 'smooth' },
  { name: 'Slow Fire', colors: ['#3a0ca3', '#f72585', '#ffbe0b'], attr: 'first-step', mod: 150, fade: 'sharp' },
  { name: 'Micro Stripes', colors: ['#22223b', '#4a4e69', '#9a8c98'], attr: 'first-step', mod: 10, fade: 'bands' },
  { name: 'Candy Rings', colors: ['#ffafcc', '#bde0fe', '#a2d2ff'], attr: 'latest-step', mod: 14, fade: 'sharp' },
  { name: 'Deep Space', colors: ['#000000', '#14213d', '#4361ee', '#e5e5e5'], attr: 'latest-step', mod: 120, fade: 'smooth', overlay: { colors: ['#000000', '#8ecae6'], opacity: 0.2 } },
  { name: 'Molten Core', colors: ['#03071e', '#9d0208', '#faa307'], attr: 'first-step', mod: 90, fade: 'sharp' },
  { name: 'Sea Glass', colors: ['#cce3de', '#a4c3b2', '#6b9080'], attr: 'latest-step', mod: 300, fade: 'smooth' },
  { name: 'Confetti', colors: ['#ff70a6', '#70d6ff', '#e9ff70'], attr: 'first-step', mod: 16, fade: 'bands' },
]
