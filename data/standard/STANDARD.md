# Phation Standard

> v1.0 · 2026-11-06 · approved by Pham Huy. Values come from the 35 Phation library entries.

You are writing UI motion for a product. Follow this standard whenever you add or change an animation, transition, hover, press, gesture response or loading state. When a rule here conflicts with a request, follow the request and say which rule you broke and why.

---

## 1. Principles

1. **Motion explains a change.** Every animation answers "what just happened?" (cause → effect). If nothing changed, nothing moves. No decoration loops on product screens.
2. **One dominant motion at a time.** Secondary motion starts ≥ 80 ms after the main one and finishes before it.
3. **Continuity.** The element the user touched is the element that changes (morph it, grow it, move it). Do not cross-fade between two unrelated states when one element can become the other.
4. **Designed rest states.** The first and last frame of every motion are finished layouts. Never end mid-transition, clipped, or overlapping.
5. **Fast in, faster out.** Exits are about 0.7× the enter duration. Users wait for things to arrive, never for them to leave.
6. **Transform and opacity only.** Animate `transform` (x, y, scale, rotate) and `opacity`. Use layout animation (`layout`, `layoutId`) instead of animating width, height, top or left.
   One exception: a small control (≤ 240 px wide) may morph its own `width` and `borderRadius`, as in the async button. Text inside it must fade out first, so nothing reflows on screen.
7. **Interruptible.** A new input cancels or redirects the running motion from where it is. Springs do this for free; prefer them for anything the user drives.

---

## 2. Tokens

### 2.1 Curves (cubic-bezier)

| Token | Value | Use for | Library uses |
|---|---|---|---|
| `enter` | `0.16, 1, 0.3, 1` | Default. Anything arriving, settling, expanding, revealing. | 23 |
| `move` | `0.65, 0, 0.35, 1` | A → B where both ends are on screen: wipes, sweeps, theme change, a surface leaving downward. | 7 |
| `fade` | `0.4, 0, 0.2, 1` | Opacity-only changes, colour changes, tick draws. | 1 |
| `exit` | `0.7, 0, 0.84, 0` | Short exits that leave the screen (≤ 250 ms). | — |
| `overshoot` | `0.34, 1.56, 0.64, 1` | One small landing overshoot on a single focal element. At most once per screen. | 1 |

Never use `linear` for movement. `linear` is allowed only for continuous ambient motion: spinners, marquees, a record turning.

> Surfaces that leave while still on screen (a sheet going down, a line rising out) use `move`. `exit` is only for short exits that leave the screen entirely.

### 2.2 Springs (stiffness k, damping c, mass m)

| Token | k / c / m | ζ | Feel | Use for | Library examples |
|---|---|---|---|---|---|
| `snap` | 420 / 32 / 1 | ≈ 0.78 | Quick, ~2 % overshoot, settles ~0.3 s | Controls: selection rings, tab pills, chips, toggles, swaps, digit rolls | date-chips, route-swap, digit-roll, finish-swatch |
| `pop` | 400 / 20 / 1 | ≈ 0.5 | One visible bounce (~16 %) | Small things appearing: ticks, dots, badges, a held-ring | hold-redeem check, size-slider ring |
| `soft` | 170 / 22 / 1 | ≈ 0.85 | Heavier, unhurried | Large surfaces: card flips, arms, sheets dragged by hand | hold-redeem flip, vinyl arm |
| `follow` | 420 / 34 / 0.6 | ≈ 1.0 | No overshoot, light lag | Pointer- or finger-following: cursors, magnetic pills, scrubbing | reel-card pill, circle-cursor, image-cursor |
| `bounce` | 160 / 14 / 1 | ≈ 0.55 | Playful (~13 %) | Brand or celebration moments only. **Max one per screen.** | search-radar bloom |

Rules:
- Overshoot stays under 22 % of travel (`snap` ≈ 2 %, `pop` ≈ 16 %).
- Close or cancel with a critically damped spring (ζ ≥ 1, e.g. k220 c30). Never bounce on the way out.


### 2.3 Durations (for curve-based motion)

| Size of change | Duration | Examples |
|---|---|---|
| Micro: press, icon swap, checkbox, label out | 120–220 ms | button press 160, icon morph 220, label out 120 |
| Small: chip, label roll, text rise, tooltip text | 300–450 ms | text rise 350, slot deal 350, label roll 450 |
| Medium: accordion, sheet, card morph, segment draw | 450–650 ms | unfold 500, morph 500, sheet up 620 |
| Large: card → full screen, photo slide, page | 700–900 ms | card → player 750, photo slide 800, wipe 900 |
| Scenic: brand intro, scene change, scroll tour | ≤ 1400 ms | scene zoom 1400, tracking settle 1100 |

- A move longer than 60 px must not take more than 1.3 s, or less than 110 ms.
- Exit ≈ 0.7× enter (sheet: up 620 / down 450).
- Hover responses ≤ 300 ms on the way in. Hover-out may be slower (≤ 600 ms) so the eye can follow.

### 2.4 Stagger

| Unit | Gap |
|---|---|
| Letters | 25–60 ms |
| Words, list items, tiles | 35–80 ms |
| Groups, sections, callouts | 100–300 ms |

- Keep the whole stagger under about 400 ms for UI. Brand moments may go up to 600 ms.
- Direction follows reading order or the cause (a wave starts where the user acted).
- Secondary text trails its headline by 80–250 ms and moves less (10 px vs 18 px).

---

## 3. Recipes

Search the library first (MCP `search_motions`), add the closest entry with `add_motion` (the file is written for you, so do not retype it) and adapt it. If there is none, use these defaults.

| Pattern | Recipe | Library entry |
|---|---|---|
| Button press | scale 0.94–0.96 + ~12 % darker, 160 ms, back on release. `whileTap` / `whileHover` get their **own** `transition`; never let them inherit a longer one from the component. | button-press |
| Async button (buy, save, send) | Label out 120 ms → width morphs to a circle 500 ms `enter` → spinner → tick draws 300 ms → back. Same element throughout. | buy-morph |
| Bottom sheet / modal | Up 620 ms `0.2,0.9,0.25,1`, down 450 ms `move`, scrim 0 → 18 % black. Escape and scrim tap close it. | bottom-sheet |
| Tabs, chips, segmented control | Shared `layoutId` pill on `snap` | weather-switch, date-chips |
| Accordion | Height auto + fade 500 ms `enter`, icon turns 400 ms, one open at a time | capabilities-accordion |
| Number change | Each digit rolls on `snap`, 50 ms apart left → right; only changed digits move | digit-roll |
| List / grid arrive | y 18–24 px + fade, 400 ms `enter`, 35 ms stagger | card-stagger, word-cascade |
| Text reveal (headline) | Each line rises 110 % out of its own mask, 350 ms `enter`, 60 ms per line. Never fade type in. | mask-rise |
| Swap two values | Both travel past each other on one shared spring; the control rotates 180° | route-swap |
| Hover on a card | Image scale 1.06 over 900 ms, title rolls 600 ms `enter` | work-card-hover |
| Custom cursor | `follow` spring; shape morphs on `snap` | circle-cursor |
| Tooltip / hotspot | Springs out from its anchor on `snap`; the others dim to 35 % | product-hotspots |
| Destructive or deliberate action | Hold to confirm: linear progress fill (it is a progress bar, so linear is correct), drains back 350 ms `enter` | hold-redeem |
| Status change across many rows | Flip each tag 260 ms, 100 ms apart; swap content at the edge-on midpoint | tag-flip |

---

## 4. Never (measured by `npx phation audit <url>`)

| Don't | Detected as |
|---|---|
| Linear easing on movement | ≥ 15 frames, travel > 12 px, constant speed |
| Things that pop | > 40 px jump or > 0.6 opacity jump in one frame |
| Hard cuts | A large element (> 6000 px²) appearing or vanishing at full opacity |
| Big overshoot | > 22 % of travel |
| Sluggish moves | > 60 px taking > 1.3 s |
| Snappy moves | > 60 px in < 110 ms |
| Layout-property animation | width, height, top or left changing on ≥ 8 frames |
| Dropped frames | > 5 % of frames over 25 ms |
| No response | Nothing moves after the user acts |
| Ignoring reduced motion | With `prefers-reduced-motion: reduce`, more than 30 % of the travel still plays |

---

## 5. UI guardrails (motion does not excuse bad UI)

- Text contrast is at least 4.5 : 1, or 3 : 1 for text ≥ 24 px (18.6 px bold), at every frame, including over photos and moving backgrounds. Add a scrim if needed.
- No text below 10.5 px as shown.
- Touch targets are at least 24 px on the short side. Prefer 44 px on mobile.
- Images are never drawn above 1.3× their pixel size.

---

## 6. Accessibility

- **`prefers-reduced-motion: reduce` is required, not optional.** Every component you write handles it: replace movement with a fade of ≤ 150 ms, stop ambient loops (spinners may keep turning), keep every state change visible.

  Shortening the duration is not enough: the element must stop travelling. Swap the **targets**, not just the transition:

  ```jsx
  import { useReducedMotion } from 'motion/react'
  const reduce = useReducedMotion()
  const fade = { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
  <motion.div
    initial={reduce ? { opacity: 0 } : { y: '100%' }}
    animate={reduce ? { opacity: 1, transition: fade } : { y: 0, transition: MOTION.open }}
    exit={reduce ? { opacity: 0, transition: fade } : { y: '100%', transition: MOTION.close }}
  />
  ```
  Width or height morphs need the same treatment: under reduce, jump to the end size and cross-fade the content.
- **Keyboard parity:** anything you can drag or hold can also be done with the keyboard (arrow keys for sliders, Space/Enter to hold or confirm).
- No flashing more than 3 times per second.
- Focus moves with the motion: when a sheet opens, focus goes into it; when it closes, focus returns to the trigger.

---

## 7. Code conventions

Default stack: React + Motion (`import { motion } from 'motion/react'`).

```js
// Every animated component reads its values from one MOTION object.
export const MOTION = {
  open: { type: 'spring', stiffness: 420, damping: 32, mass: 1 }, // snap
  fade: [0.4, 0, 0.2, 1],
  fadeMs: 200,
}
```

- **Names:** name keys after what they move (`open`, `rollMs`, `stagger`), not after the token. Comment which token they come from.
- **Units:** durations live in the object as numbers in **ms** with an `Ms` suffix (`fadeMs: 200`). Never store seconds or prebuilt `{ duration: 0.2 }` objects. Convert at the call site (`duration: m.fadeMs / 1000`), so Studio exports paste in unchanged.
- **Tuning:** components take `values` (or individual props) merged over `MOTION`, so Phation Studio exports paste straight in.
- **CSS:** when there is no JS, use the same tokens: `transition: transform 500ms cubic-bezier(0.16, 1, 0.3, 1)`.
- **Other platforms:** keep the same k / c / m. Reanimated: `withSpring(v, { stiffness, damping, mass })`. SwiftUI: `.interpolatingSpring(mass:stiffness:damping:)`.

---

## 8. Workflow for the agent

1. **Find** the closest library entry (`search_motions`). `get_motion` gives its spec and `MOTION` values without the source; ask for `code: true` only if you must read it.
2. **Add, don't retype:** `add_motion` (or `npx phation add <slug>`) writes the file to disk. Edit only what differs: its `MOTION` object, copy, colours and props. If there is no entry, write the motion with the tokens and recipes above, with a `MOTION` object.
3. **Check** against sections 4–6 yourself: list each motion with its curve or spring, duration and why. Before you finish, confirm each item:
   - [ ] reduced motion handled in every component you touched (§6)
   - [ ] press and hover have their own short transitions (§3)
   - [ ] durations in `MOTION` are ms numbers (§7)
   - [ ] keyboard parity, and focus moves into opened surfaces and back (§6)
   - [ ] no linear movement except ambient loops; exits ≈ 0.7× enters (§1, §2)
4. **Verify** when the app runs locally: `npx phation audit <url> --do click:<selector> …` (or the MCP tool `audit_motion`) with the actions that trigger the motion. Fix every blocker and every `ignores-reduced-motion`, then re-run until it passes.
5. **Report** to the user: what moves, the values used, and any rule you deliberately broke.
