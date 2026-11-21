// GENERATED from src/recipes/resolve.js by scripts/sync-animate.mjs. Edit the source, not this copy.
// Phation Animate: turns a recipe + a Feel into exact motion values.
// One function shared by every surface (animate_ui, the Figma plugin, the site's previews), so a Feel looks the same everywhere.
//
//   import { resolve } from './resolve.js'
//   resolve(RECIPES.press, 'snappy') → { spring, settleMs, ease, durationMs, staggerMs, exit, figma }
//
// How a Feel bends a spring role (roles and base values from skill/CORE.md):
//   tempo  — the Feel's `time`, relative to Fluid's, scales the role's natural period: stiffness = k / t² (mass kept).
//            Fluid (the default) gives back the CORE.md values exactly. A Feel's own mass (Heavy 2.4) is not carried over.
//   bounce — the role's damping ratio ζ shifts by the Feel's distance from Fluid (the neutral Feel, the default).
//            ζ is clamped to [0.45, 1.2]: 0.45 ≈ 20 % overshoot, under the Standard's 22 % cap.
// Durations and staggers scale by `time` and are clamped to the Standard's ranges. Exits use the Feel's `out` curve, ≤ 250 ms.

import { FEELS } from '../feels.js'

export const DEFAULT_FEEL = 'fluid'

// CORE.md springs (k / c / m). `bounce` (celebration) is left out on purpose: its overshoot is over the cap for UI recipes.
export const SPRING_ROLES = {
  snap: { stiffness: 420, damping: 32, mass: 1 },   // controls, pills, rolls
  pop: { stiffness: 400, damping: 20, mass: 1 },    // small things appearing
  soft: { stiffness: 170, damping: 22, mass: 1 },   // large surfaces
  follow: { stiffness: 420, damping: 34, mass: 0.6 }, // pointer-following
}

const ZETA_MIN = 0.45, ZETA_MAX = 1.2
const EXIT_MAX_MS = 250
const STAGGER = { letters: [25, 60], items: [35, 80], groups: [100, 300] }
const STAGGER_TOTAL_MAX = 400

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const r = (v, n = 0) => +v.toFixed(n)
export const zetaOf = s => s.damping / (2 * Math.sqrt(s.stiffness * (s.mass ?? 1)))
/** Peak overshoot of an underdamped spring released from rest, as a fraction (0.2 = 20 %). */
export const overshootOf = s => { const z = zetaOf(s); return z >= 1 ? 0 : Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z)) }

/** Time for a spring to settle within 2 % of its target, in ms. Used as Figma's `duration` and as a fallback length. */
export function settleMs(s) {
  const m = s.mass ?? 1, w = Math.sqrt(s.stiffness / m), z = zetaOf(s)
  const rate = z < 1 ? z * w : w * (z - Math.sqrt(z * z - 1)) // slowest decaying mode
  return Math.round((Math.log(50) / rate) * 1000)
}

export const feelOf = id => FEELS.find(f => f.id === id) ?? FEELS.find(f => f.id === DEFAULT_FEEL)
const NEUTRAL_ZETA = zetaOf(feelOf(DEFAULT_FEEL).spring)
const NEUTRAL_TIME = feelOf(DEFAULT_FEEL).time

/** A spring role under a Feel. */
export function springFor(role, feelId = DEFAULT_FEEL) {
  const base = SPRING_ROLES[role]
  if (!base) throw new Error(`Unknown spring role "${role}". Use one of: ${Object.keys(SPRING_ROLES).join(', ')}`)
  const f = feelOf(feelId)
  const t = f.time / NEUTRAL_TIME // Fluid gives back the CORE values exactly
  const m = base.mass, stiffness = r(base.stiffness / (t * t))
  const z = clamp(zetaOf(base) + (zetaOf(f.spring) - NEUTRAL_ZETA), ZETA_MIN, ZETA_MAX)
  return { stiffness, damping: r(z * 2 * Math.sqrt(stiffness * m), 1), mass: m }
}

/** Every value a surface needs to play or write one recipe under one Feel. */
export function resolve(recipe, feelId = DEFAULT_FEEL) {
  const f = feelOf(feelId)
  const spring = springFor(recipe.spring, f.id)
  const out = { recipe: recipe.id, feel: f.id, spring, settleMs: settleMs(spring), ease: f.ease }

  if (recipe.durationMs) out.durationMs = Math.round(recipe.durationMs * f.time)
  if (recipe.stagger) {
    const [lo, hi] = STAGGER[recipe.stagger.kind]
    const each = clamp(Math.round(recipe.stagger.ms * f.time), lo, hi)
    // keep the whole wave ≤ 400 ms: past that many items, the rest arrive together
    out.staggerMs = each
    out.staggerMaxItems = Math.floor(STAGGER_TOTAL_MAX / each) + 1
  }
  if (recipe.exit) {
    const exitSpring = recipe.exit.spring ? springFor(recipe.exit.spring, f.id) : null
    out.exit = exitSpring
      ? { spring: exitSpring, settleMs: settleMs(exitSpring) }
      : { ease: f.out, durationMs: Math.min(EXIT_MAX_MS, Math.round(recipe.exit.durationMs * f.time)) }
  }
  // Figma Smart Animate: custom spring + a duration (settle time). `approx` / `none` are reported, not hidden.
  out.figma = recipe.figma === 'none' ? null : {
    support: recipe.figma,
    trigger: recipe.figmaTrigger,
    // Figma's runtime rejects initialVelocity ("Unrecognized key", checked in a real file 2026-11-18) although the typings list it
    easing: { type: 'CUSTOM_SPRING', easingFunctionSpring: { mass: spring.mass, stiffness: spring.stiffness, damping: spring.damping } },
    durationMs: out.settleMs,
  }
  return out
}

/** Short text for "Copy values" / sticky notes, e.g. "Smart Animate · Spring · mass 1 · stiffness 420 · damping 32". */
export function figmaText(resolved) {
  if (!resolved.figma) return `${resolved.recipe}: web only`
  const s = resolved.spring
  return `Smart Animate · Spring · mass ${s.mass} · stiffness ${s.stiffness} · damping ${s.damping} · ≈ ${resolved.settleMs} ms`
}
