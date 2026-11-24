import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion, useSpring } from 'motion/react'

// ── Sound: tiny Web Audio cues, synthesized in code (no files). A cue only plays right after a real visitor input
// inside this component (auto-played intros stay silent) and never under an element with data-sound="off".
const SND = typeof window === 'undefined' ? null : (window.__cueIn ||= (() => {
  const s = { t: -1e9, el: null, path: null, down: null, last: {} }
  const on = ev => {
    if (!ev.isTrusted) return
    s.t = performance.now()
    const held = ev.type === 'pointermove' && ev.buttons && s.down // a drag keeps belonging to where it started
    if (ev.type === 'pointerdown') s.down = ev.composedPath()
    s.path = held ? s.down : (ev.type === 'pointerup' && s.down) || ev.composedPath(); s.el = s.path[0]
    if (ev.type === 'pointerup') s.down = null
  }
  for (const e of ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'wheel', 'touchstart']) addEventListener(e, on, { capture: true, passive: true })
  return s
})())
function cue(root, kind, { sound = 1, volume = 60, gap = 28, pitch = 1 } = {}) {
  const S = SND, now = performance.now()
  if (!S || !sound || !volume || !root || !(S.path?.includes(root) || root.contains?.(S.el)) || now - S.t > 3000 || root.closest?.('[data-sound="off"]')) return
  if (now - (S.last[kind] || 0) < gap) return; S.last[kind] = now
  const ac = (S.ac ||= new (window.AudioContext || window.webkitAudioContext)()); if (ac.state === 'suspended') ac.resume()
  const t = ac.currentTime, out = ac.createGain(); out.gain.value = (volume / 100) * 0.45; out.connect(ac.destination)
  const tone = (f0, f1, dur, type = 'sine', g = 1, at = 0) => {
    const o = ac.createOscillator(), v = ac.createGain(); o.type = type
    o.frequency.setValueAtTime(f0 * pitch, t + at); o.frequency.exponentialRampToValueAtTime(f1 * pitch, t + at + dur)
    v.gain.setValueAtTime(0.0001, t + at); v.gain.exponentialRampToValueAtTime(g, t + at + 0.005); v.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
    o.connect(v).connect(out); o.start(t + at); o.stop(t + at + dur + 0.03)
  }
  const air = (dur, f0, f1, g = 1) => { // filtered noise sweep
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), v = ac.createGain(); src.buffer = b; bp.type = 'bandpass'; bp.Q.value = 1.4
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur)
    v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(g, t + dur * 0.35); v.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(v).connect(out); src.start(t)
  }
  ;({
    tick: () => tone(2600, 1900, 0.022, 'triangle', 0.3),   // detent, step, letter
    tap: () => tone(640, 520, 0.07, 'sine', 0.6),           // press
    pop: () => tone(900, 460, 0.09, 'sine', 0.7),           // something opens / appears
    thunk: () => tone(170, 85, 0.14, 'sine', 0.9),          // weight, impact
    whoosh: () => air(0.3, 500, 2600, 0.4),                 // big move in
    swish: () => air(0.18, 2200, 800, 0.28),                // quick move / close
    rise: () => tone(300, 780, 0.55, 'sine', 0.3),          // hold / charge
    fall: () => tone(720, 280, 0.32, 'sine', 0.26),         // release / cancel
    chime: () => { tone(1046, 1046, 0.5, 'sine', 0.42); tone(1568, 1568, 0.65, 'sine', 0.28, 0.07) }, // done
    blip: () => tone(1320, 1320, 0.045, 'square', 0.08),    // status, typing
  })[kind]?.()
}

// Morphing button: the button becomes its own progress indicator. The label leaves first, the width folds into a
// circle, an arc spins, the check draws with one 5% beat as it lands while the ink turns to the accent, then the
// button opens back into the label. The pill wears the glow CTA from phamhuyds/PHAXIS: on hover (and while it works)
// a light runs round the rim and a soft blurred halo turns with it; the button leans toward the pointer on a spring.
// Use <MorphButton state="idle" | "loading" | "done" onClick={…}>Label</MorphButton>; you own the state machine.

// Motion values. Phation Studio exports this object: paste a tuned one over it.
export const MOTION = {
  morph: [0.16, 1, 0.3, 1], // width ↔ circle
  morphMs: 500,
  spinMs: 600,
  checkMs: 300,
  labelOutMs: 120,
  glowSpin: 2200, // ms per lap of the rim light
  magnet: { type: 'spring', stiffness: 260, damping: 18, mass: 0.6 }, // pull toward the pointer (30% of the offset)
}
// the done state's accent. Studio › Look › Colour picks it.
export const ACCENTS = [{ label: 'Green', color: '#178a4a' }, { label: 'Blue', color: '#0b6fd8' }, { label: 'Violet', color: '#6d28d9' }, { label: 'Orange', color: '#c2410c' }]
export const params = {
  morph: { type: 'ease', label: 'Width morph', value: MOTION.morph },
  morphMs: { type: 'ms', label: 'Morph duration', value: MOTION.morphMs, min: 150, max: 1200 },
  spinMs: { type: 'ms', label: 'Spinner', value: MOTION.spinMs, min: 200, max: 1500 },
  checkMs: { type: 'ms', label: 'Check draw', value: MOTION.checkMs, min: 100, max: 800 },
  labelOutMs: { type: 'ms', label: 'Label out', value: MOTION.labelOutMs, min: 0, max: 400 },
  glowSpin: { type: 'ms', label: 'Glow lap', value: MOTION.glowSpin, min: 800, max: 5000, step: 100 },
  magnet: { type: 'spring', label: 'Magnet', ...MOTION.magnet },
  glow: { type: 'pick', label: 'Glow', value: 0, group: 'Glow', options: [{ label: 'Hover' }, { label: 'Always' }] },
  accent: { type: 'pick', label: 'Colour', value: 0, options: ACCENTS },
  sound: { type: 'pick', label: 'Sound', value: 1, toggle: true, group: 'Sound', options: [{ label: 'Off' }, { label: 'On' }] },
  volume: { type: 'num', label: 'Volume', value: 60, min: 0, max: 100, unit: '%', group: 'Sound' },
}
const OPA = [0.4, 0, 0.2, 1]
const PILL = 'var(--demo-pill, #161618)' // flat ink (lighter graphite at night)

// Glow CTA: a conic light (violet → white → blue) masked to a 1.5 px rim, plus the same light blurred 9 px behind as a
// halo. --ga is a registered angle so the gradient itself can turn. .on = forced (loading / Always).
const GLOW_CSS = `@property --ga { syntax: '<angle>'; initial-value: 0deg; inherits: true; }
@keyframes gm-spin { to { --ga: 360deg; } }
.gm-glow { position: relative; display: inline-grid; isolation: isolate; --ga: 0deg; border-radius: 999px; }
.gm-glow .gm-r, .gm-glow .gm-w i { position: absolute; inset: 0; border-radius: inherit;
  background: conic-gradient(from var(--ga), transparent 0 52%, rgb(123 92 255 / 0) 56%, #7b5cff 68%, #e9e4ff 76%, #2f6bff 84%, transparent 94%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
.gm-glow .gm-r { inset: -1.5px; padding: 1.5px; opacity: 0; transition: opacity .4s cubic-bezier(.4,0,.2,1); pointer-events: none; z-index: 2; }
.gm-glow .gm-w { position: absolute; inset: -6px; border-radius: 999px; filter: blur(9px); opacity: 0; transition: opacity .5s cubic-bezier(.4,0,.2,1); pointer-events: none; z-index: -1; }
.gm-glow .gm-w i { padding: 5px; }
.gm-glow > button { outline: none; box-shadow: 0 0 0 0 rgb(110 90 255 / 0); transition: box-shadow .45s cubic-bezier(.4,0,.2,1); }
.gm-glow:hover, .gm-glow:focus-within, .gm-glow.on { animation: gm-spin var(--gm-lap, 2.2s) linear infinite; }
.gm-glow:hover > button, .gm-glow:has(:focus-visible) > button, .gm-glow.on > button { box-shadow: 0 10px 30px -10px rgb(110 90 255 / .55); }
.gm-glow:hover .gm-r, .gm-glow:hover .gm-w, .gm-glow:has(:focus-visible) .gm-r, .gm-glow:has(:focus-visible) .gm-w, .gm-glow.on .gm-r, .gm-glow.on .gm-w { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .gm-glow, .gm-glow.on, .gm-glow:hover { animation: none; } }`

export function MorphButton({ state = 'idle', onClick, children, width = 220, height = 52, color = PILL, accent = '#178a4a', glow = 0, values }) {
  const m = { ...MOTION, ...values }
  const x = useSpring(0, m.magnet), y = useSpring(0, m.magnet)
  const pull = e => { if (reduce || e.pointerType !== 'mouse') return; const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * 0.3); y.set((e.clientY - r.top - r.height / 2) * 0.3) }
  const round = state !== 'idle', s = v => v / 1000
  const [down, setDown] = useState(false)
  // MotionConfig reducedMotion="user" only covers transforms: the width morph has to be cut by hand.
  const reduce = useReducedMotion()
  return (
    <motion.span className={`gm-glow${glow || state === 'loading' ? ' on' : ''}`} style={{ x, y, '--gm-lap': `${m.glowSpin}ms` }} onPointerMove={pull} onPointerLeave={() => { x.set(0); y.set(0) }}>
      <style>{GLOW_CSS}</style>
      <span className="gm-w" aria-hidden="true"><i /></span><span className="gm-r" aria-hidden="true" />
    <motion.button
      onClick={onClick} aria-busy={state === 'loading'}
      onPointerDown={() => !round && setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)}
            animate={{ width: round ? height : width, scale: state === 'done' ? [1, 1.05, 1] : down ? 0.97 : 1 }}
      transition={{ width: reduce ? { duration: 0 } : { duration: s(m.morphMs), ease: m.morph, delay: round ? s(m.labelOutMs) : 0 }, scale: state === 'done' ? { duration: 0.3, ease: OPA, delay: 0.04 } : { type: 'spring', stiffness: 600, damping: 30 }, y: { duration: 0.16, ease: OPA } }}
      style={{
        position: 'relative', height, border: 0, borderRadius: height / 2, background: color, color: '#fff', cursor: 'pointer',
        display: 'grid', placeItems: 'center', overflow: 'hidden', font: '500 16px/1 Inter, system-ui, sans-serif',
      }}
    >
      {/* the accent arrives with the check and leaves before the label returns */}
      <motion.span aria-hidden initial={false} animate={{ opacity: state === 'done' ? 1 : 0 }} transition={{ duration: 0.2, ease: OPA }}
        style={{ position: 'absolute', inset: 0, background: accent }} />
      <AnimatePresence initial={false}>
        {state === 'idle' && (
          <motion.span key="l" style={{ gridArea: '1/1', whiteSpace: 'nowrap', position: 'relative' }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: m.morph, delay: s(m.morphMs) * 0.6 } }}
            exit={{ opacity: 0, transition: { duration: s(m.labelOutMs), ease: OPA } }}>
            {children}
          </motion.span>
        )}
        {state === 'loading' && (
          <motion.svg key="sp" width="24" height="24" viewBox="0 0 24 24" style={{ gridArea: '1/1', position: 'relative' }} aria-label="Loading"
            initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 1, rotate: 360 }} exit={{ opacity: 0, transition: { duration: 0.16, ease: OPA } }}
            transition={{ opacity: { duration: 0.15, delay: s(m.morphMs) }, rotate: { duration: s(m.spinMs), ease: OPA, delay: s(m.morphMs) } }}>
            <motion.circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
              initial={{ pathLength: 0.25 }} animate={{ pathLength: 0.8 }} transition={{ duration: s(m.spinMs), ease: OPA, delay: s(m.morphMs) }} />
          </motion.svg>
        )}
        {state === 'done' && (
          <motion.svg key="ck" width="22" height="22" viewBox="0 0 22 22" style={{ gridArea: '1/1', position: 'relative' }} aria-label="Done" exit={{ opacity: 0, transition: { duration: 0.15, ease: OPA } }}>
            <motion.path d="M5 11.5l4 4L17 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: s(m.checkMs), ease: m.morph, delay: 0.04 }} />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
    </motion.span>
  )
}

// ---------------- demo: fake checkout that resolves after the spinner, holds the check, then resets ----------------
export default function BuyMorph({ values }) {
  const m = { ...MOTION, ...values }
  const [state, setState] = useState('idle')
  const t = useRef([])
  const el = useRef(null)
  const buy = e => {
    if (state !== 'idle') return
    if (e?.currentTarget) { el.current = e.currentTarget; cue(el.current, 'tap', m) }
    setState('loading')
    const done = m.morphMs + m.spinMs + 20 // the spinner starts when the morph is under way
    t.current = [setTimeout(() => { cue(el.current, 'chime', m); setState('done') }, done), setTimeout(() => setState('idle'), done + 950)]
  }
  useEffect(() => { const id = window.__phAuto ? 0 : setTimeout(buy, 700); // intro, skipped while Auto play drives it
    return () => { clearTimeout(id); t.current.forEach(clearTimeout) } }, [])
  return <MorphButton state={state} onClick={buy} values={m} accent={(ACCENTS[m.accent] ?? ACCENTS[0]).color} glow={m.glow}>Buy it now</MorphButton>
}
