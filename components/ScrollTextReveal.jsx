import { useEffect, useRef } from 'react'
import { motion, useScroll, useTransform, animate } from 'motion/react'

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

// Scroll-linked paragraph: each character fades #666 → #fff as the paragraph
// crosses the viewport, scroll offset ["start 0.75", "start 0.15"]. Words split the progress evenly, letters split their word.
// Here the "viewport" is the card itself: scroll inside it (it auto-scrolls once to show the effect).
const TEXT = 'Every project is a chance to blend design and development, shaping bold interactive ideas into sleek digital realities — built with intent, speed, and visual clarity.'

// Motion values. Phation Studio exports this object: paste a tuned one over it.
// The reveal itself is scroll-linked (no timing); these drive the demo's one-off auto-scroll.
export const MOTION = {
  scroll: [0.65, 0, 0.35, 1], // auto-scroll curve
  scrollMs: 2400,
  startDelay: 300,
}
export const params = {
  scroll: { type: 'ease', label: 'Auto-scroll curve', value: MOTION.scroll, bounce: false },
  scrollMs: { type: 'ms', label: 'Auto-scroll', value: MOTION.scrollMs, min: 600, max: 5000, step: 100 },
  startDelay: { type: 'ms', label: 'Start delay', value: MOTION.startDelay, min: 0, max: 1500 },
  sound: { type: 'pick', label: 'Sound', value: 1, toggle: true, group: 'Sound', options: [{ label: 'Off' }, { label: 'On' }] },
  volume: { type: 'num', label: 'Volume', value: 60, min: 0, max: 100, unit: '%', group: 'Sound' },
}

function Char({ c, p, a, b }) {
  const opacity = useTransform(p, [a, b], [0.22, 1]) // ink at 22% → 100%: reads on the light card and the dark one
  return <motion.span style={{ opacity }}>{c}</motion.span>
}

export default function ScrollTextReveal({ values }) {
  const m = { ...MOTION, ...values }
  const box = useRef(null), target = useRef(null)
  const { scrollYProgress } = useScroll({ container: box, target, offset: ['start 0.75', 'start 0.15'] })
  useEffect(() => {
    const el = box.current
    if (window.__phAuto) return // Auto play scrolls it instead
    // stop where progress just reaches 1: paragraph top at 15% of the box
    const c = animate(0, target.current.offsetTop - el.clientHeight * 0.15 + 4, { duration: m.scrollMs / 1000, ease: m.scroll, delay: m.startDelay / 1000, onUpdate: v => { el.scrollTop = v } })
    const stop = () => c.stop()
    el.addEventListener('wheel', stop, { passive: true }); el.addEventListener('touchstart', stop, { passive: true })
    return () => { c.stop(); el.removeEventListener('wheel', stop); el.removeEventListener('touchstart', stop) }
  }, [])
  const words = TEXT.split(' '), n = words.length
  // one soft tick per word as it lights up (silent while the intro scrolls on its own)
  const live = useRef(m); live.current = m
  useEffect(() => { let w = -1; return scrollYProgress.on('change', p => { const k = Math.floor(p * n); if (k !== w) { w = k; if (k > 0 && k < n) cue(box.current, 'tick', { ...live.current, gap: 40 }) } }) }, [])
  return (
    <div ref={box} style={{ position: 'relative', width: 440, height: 300, overflowY: 'auto', borderRadius: 22, background: 'var(--demo-card, #fff)', boxShadow: 'var(--demo-sh-card, 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.04), 0 12px 28px -10px rgba(0,0,0,.14))', scrollbarWidth: 'none', overscrollBehavior: 'contain' }}>
      <div style={{ height: 210, display: 'grid', placeItems: 'end center', paddingBottom: 18, font: '500 12px/1 Inter, sans-serif', letterSpacing: '.08em', color: 'var(--demo-ink2, #66666d)', textTransform: 'uppercase' }}>Scroll ↓</div>
      <p ref={target} style={{ margin: 0, padding: '0 32px', display: 'flex', flexWrap: 'wrap', font: '500 28px/34px Inter, system-ui, sans-serif', letterSpacing: '-.6px', color: 'var(--demo-ink, #161618)' }}>
        {words.map((w, i) => (
          <span key={i} style={{ whiteSpace: 'pre' }}>
            {(w + ' ').split('').map((ch, j) => <Char key={j} c={ch} p={scrollYProgress} a={(i + j / (w.length + 1)) / n} b={(i + (j + 1) / (w.length + 1)) / n} />)}
          </span>
        ))}
      </p>
      <div style={{ height: 230 }} />
    </div>
  )
}
