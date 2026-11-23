---
name: phation
description: "Required for any UI motion work: Pham Huy's Phation standard (curve, spring and duration tokens, choreography, recipes, reduced motion). Use whenever adding or changing any UI animation, transition, hover or press state, gesture response, loading or success state, page or route transition, or when the user asks to make an interface feel smoother, more tactile, calmer, more alive or more polished, or asks to review or fix motion, including any code that uses motion/react, framer-motion, CSS transitions or keyframes."
---

# Phation Standard (core)

Short rules for every motion task. The full standard (recipes, examples, accessibility code) is in `.phation/STANDARD.md`: open only the section you need (§3 recipes, §6 accessibility, §7 code). With the MCP server, `get_standard` with a section does the same.

**Workflow, token-lean:** `search_motions` → `add_motion` writes the file to disk, so never retype it → edit only its `MOTION` object, copy and styles → `audit_motion` with the actions that trigger it, fix blockers, re-run. A Studio link (`…/m/<slug>?…`) goes in `from`.

**Rules:** motion explains a change · one main motion at a time (secondary ≥ 80 ms later) · morph the touched element instead of cross-fading · animate transform and opacity only (`layout` / `layoutId` for size) · exits ≈ 0.7× enters · interruptible: springs for anything the user drives.

**Curves:** enter `0.16, 1, 0.3, 1` (default) · move `0.65, 0, 0.35, 1` (A → B on screen) · fade `0.4, 0, 0.2, 1` (opacity, colour) · exit `0.7, 0, 0.84, 0` (≤ 250 ms, leaves the screen) · overshoot `0.34, 1.56, 0.64, 1` (once per screen). Never linear for movement (spinners and marquees only).

**Springs (k / c / m):** snap 420 / 32 / 1 controls, pills, rolls · pop 400 / 20 / 1 small things appearing · soft 170 / 22 / 1 large surfaces · follow 420 / 34 / 0.6 pointer-following · bounce 160 / 14 / 1 one celebration per screen. Overshoot < 22 %. Close with ζ ≥ 1 (k220 c30).

**Durations:** micro 120–220 ms · small 300–450 · medium 450–650 · large 700–900 · scenic ≤ 1400. Moves over 60 px: 110 ms to 1.3 s. Hover in ≤ 300 ms. **Stagger:** letters 25–60 ms · items 35–80 · groups 100–300, whole stagger ≤ 400 ms.

**Never:** linear movement · pops and hard cuts (fade + 18–24 px rise instead) · overshoot over 22 % · animating width, height, top or left · ignoring reduced motion.

**Reduced motion (required):** with `useReducedMotion()`, swap the targets for a ≤ 150 ms fade and stop ambient loops. A shorter duration is not enough.

**Code:** values in one `export const MOTION = { … }`; durations as ms numbers (`fadeMs: 200`), converted at the call site; components accept `values` merged over `MOTION`. Keyboard parity for drag and hold; focus moves into opened surfaces and back.

**Report** the values you used and any rule you broke on purpose.
