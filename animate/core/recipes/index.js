// GENERATED from src/recipes/index.js by scripts/sync-animate.mjs. Edit the source, not this copy.
// Phation Animate recipes: patterns applied to the user's own elements (a library entry is a full component; a recipe is not).
// Spec: ANIMATE_SPEC.md §02. Values come from resolve.js + a Feel; nothing here is tuned per Feel.
//
// Fields
//   roles        roles Detect can return that this recipe fits (first match = recommended)
//   trigger      press | hover | toggle | select | open | enter | value
//   spring       a CORE.md spring role (resolve.js › SPRING_ROLES)
//   states       from → to, transform and opacity only. Symbolic values are filled by the surface:
//                'travel' = track width − knob width − 2 × inset · '100%' = the element's own height
//   layout       true = the size change is a layout animation (Motion `layout` / `layoutId`), never width/height
//   exit         how it leaves: a spring role, or the Feel's exit curve for durationMs (capped at 250 ms)
//   stagger      { kind: letters | items | groups, ms } — clamped to the Standard's range per Feel
//   reduced      under prefers-reduced-motion: 'none' (no motion) or 'fade' (≤ 150 ms opacity only)
//   figma        full | approx | none — how well Figma Smart Animate can play it
//   figmaTrigger Figma prototype trigger type
//   entry        closest library entry slug, for "see it in Phation"

export const ROLES = ['button', 'icon-button', 'toggle', 'tabs', 'card', 'list', 'modal', 'sheet', 'accordion', 'nav-link', 'input', 'number', 'image', 'unknown']

export const RECIPES = {
  press: {
    id: 'press', name: 'Press', roles: ['button', 'icon-button', 'card'], trigger: 'press', spring: 'snap',
    states: { from: { scale: 1 }, to: { scale: 0.96 } },
    reduced: 'none', figma: 'full', figmaTrigger: 'ON_PRESS', entry: 'buy-morph',
  },
  'hover-lift': {
    id: 'hover-lift', name: 'Hover lift', roles: ['card', 'image', 'button'], trigger: 'hover', spring: 'soft',
    states: { from: { y: 0, scale: 1 }, to: { y: -4, scale: 1.01 } },
    reduced: 'none', figma: 'full', figmaTrigger: 'ON_HOVER', entry: 'work-card-hover',
  },
  'toggle-knob': {
    id: 'toggle-knob', name: 'Toggle', roles: ['toggle'], trigger: 'toggle', spring: 'snap',
    states: { from: { x: 0 }, to: { x: 'travel' } },
    reduced: 'fade', figma: 'full', figmaTrigger: 'ON_CLICK', entry: 'day-night',
  },
  'tab-pill': {
    id: 'tab-pill', name: 'Tab pill', roles: ['tabs'], trigger: 'select', spring: 'snap',
    layout: true, // the pill is one element shared across tabs (layoutId); in Figma, one layer moved between variants
    reduced: 'fade', figma: 'full', figmaTrigger: 'ON_CLICK', entry: 'model-picker',
  },
  'sheet-open': {
    id: 'sheet-open', name: 'Sheet', roles: ['sheet'], trigger: 'open', spring: 'soft',
    states: { from: { y: '100%' }, to: { y: 0 } }, backdrop: { from: { opacity: 0 }, to: { opacity: 1 } },
    exit: { durationMs: 220 },
    reduced: 'fade', figma: 'full', figmaTrigger: 'ON_CLICK',
  },
  'modal-open': {
    id: 'modal-open', name: 'Modal', roles: ['modal'], trigger: 'open', spring: 'soft', // a large surface: soft, not pop
    states: { from: { opacity: 0, scale: 0.94 }, to: { opacity: 1, scale: 1 } }, backdrop: { from: { opacity: 0 }, to: { opacity: 1 } },
    exit: { durationMs: 180 },
    reduced: 'fade', figma: 'full', figmaTrigger: 'ON_CLICK',
  },
  'accordion-open': {
    id: 'accordion-open', name: 'Accordion', roles: ['accordion'], trigger: 'open', spring: 'soft',
    layout: true, content: { from: { opacity: 0, y: -6 }, to: { opacity: 1, y: 0 } },
    exit: { durationMs: 160 },
    reduced: 'fade', figma: 'approx', figmaTrigger: 'ON_CLICK', entry: 'capabilities-accordion',
  },
  'list-enter': {
    id: 'list-enter', name: 'List enter', roles: ['list'], trigger: 'enter', spring: 'soft',
    states: { from: { opacity: 0, y: 20 }, to: { opacity: 1, y: 0 } }, // fade + 18–24 px rise (Standard: never pop in)
    stagger: { kind: 'items', ms: 50 },
    reduced: 'fade', figma: 'approx', figmaTrigger: 'AFTER_TIMEOUT', // Figma: no real stagger, one shared transition
  },
  'number-roll': {
    id: 'number-roll', name: 'Number roll', roles: ['number'], trigger: 'value', spring: 'snap',
    states: { from: { y: '100%', opacity: 0 }, to: { y: 0, opacity: 1 } }, // per digit; the old digit leaves to −100%
    stagger: { kind: 'letters', ms: 30 },
    reduced: 'fade', figma: 'none', entry: 'digit-roll',
  },
  'nav-roll': {
    id: 'nav-roll', name: 'Letter roll', roles: ['nav-link'], trigger: 'hover', spring: 'snap',
    states: { from: { y: 0 }, to: { y: '-100%' } }, // per letter, a copy rolls in from below
    stagger: { kind: 'letters', ms: 25 },
    reduced: 'none', figma: 'none', entry: 'nav-letter-roll',
  },
}

/** Recipes for a role, best first. */
export const recipesFor = role => Object.values(RECIPES).filter(r => r.roles.includes(role))
    .sort((a, b) => a.roles.indexOf(role) - b.roles.indexOf(role))

export { resolve, figmaText, springFor, settleMs, DEFAULT_FEEL } from './resolve.js'
