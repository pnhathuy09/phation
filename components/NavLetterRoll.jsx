import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

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

// Menu links: each link is split into letters (the live page renders H·o·m·e as separate nodes).
// On hover every letter rolls up to an identical copy, 25 ms apart left → right, so the word ripples instead of jumping.
const LINKS = ['Home', 'Work', 'Contact']

// Motion values. Phation Studio exports this object: paste a tuned one over it.
// Look values (not motion): colour + layout variants. Studio › Look sets them.
export const ACCENTS = [{ label: 'Blue', color: '#0a72ef' }, { label: 'Green', color: '#15803d' }, { label: 'Coral', color: '#d9442a' }, { label: 'Violet', color: '#6d28d9' }]
export const LOOK = { accent: 0 }
const accentOf = m => (ACCENTS[m.accent] ?? ACCENTS[0]).color

export const MOTION = {
  ease: [0.16, 1, 0.3, 1],
  rollMs: 500, // each letter's roll
  stagger: 25, // ms between letters
}
export const params = {
  ease: { type: 'ease', label: 'Roll curve', value: MOTION.ease },
  rollMs: { type: 'ms', label: 'Letter roll', value: MOTION.rollMs, min: 150, max: 1200 },
  stagger: { type: 'ms', label: 'Letter stagger', value: MOTION.stagger, min: 0, max: 120, step: 5 },
  accent: { type: 'pick', label: 'Colour', value: LOOK.accent, options: ACCENTS },
  sound: { type: 'pick', label: 'Sound', value: 1, toggle: true, group: 'Sound', options: [{ label: 'Off' }, { label: 'On' }] },
  volume: { type: 'num', label: 'Volume', value: 60, min: 0, max: 100, unit: '%', group: 'Sound' },
}

function Link({ word, on, set, m }) {
  const ACCENT = accentOf(m)
  return (
    <a href="#" onClick={e => e.preventDefault()} onPointerEnter={e => { cue(e.currentTarget, 'tick', { ...m, gap: 60 }); set(word) }} onPointerLeave={() => set(null)} onFocus={() => set(word)} onBlur={() => set(null)}
      style={{ display: 'inline-flex', color: 'var(--demo-ink, #161618)', textDecoration: 'none', font: '500 48px/1 Inter, system-ui, sans-serif', letterSpacing: '-.03em', overflow: 'hidden', height: 52, paddingTop: 2 }}>
      {word.split('').map((c, i) => (
        <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
          <motion.span style={{ display: 'block' }} animate={{ y: on ? '-110%' : '0%' }} transition={{ duration: m.rollMs / 1000, ease: m.ease, delay: i * m.stagger / 1000 }}>{c}</motion.span>
          <motion.span style={{ position: 'absolute', left: 0, top: 0, display: 'block', color: ACCENT }} initial={false} animate={{ y: on ? '0%' : '110%' }} transition={{ duration: m.rollMs / 1000, ease: m.ease, delay: i * m.stagger / 1000 }}>{c}</motion.span>
        </span>
      ))}
    </a>
  )
}

export default function NavLetterRoll({ values }) {
  const m = { ...MOTION, ...LOOK, ...values }
  const [hot, setHot] = useState(null)
  useEffect(() => {
    if (window.__phAuto) return // Auto play acts it out instead
    const ids = LINKS.map((w, k) => setTimeout(() => setHot(w), 400 + k * 600)).concat(setTimeout(() => setHot(null), 400 + 3 * 600))
    return () => ids.forEach(clearTimeout)
  }, [])
  return (
    <div style={{ display: 'grid', gap: 6, padding: '28px 32px', borderRadius: 22, background: 'var(--demo-card, #fff)', boxShadow: 'var(--demo-sh-card, 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.04), 0 12px 28px -10px rgba(0,0,0,.14))', width: 320 }}>
      <div style={{ font: '500 12px/1 Inter, sans-serif', letterSpacing: '.08em', color: 'var(--demo-ink2, #66666d)', textTransform: 'uppercase', marginBottom: 10 }}>Quick links</div>
      {LINKS.map(w => <Link key={w} word={w} on={hot === w} set={setHot} m={m} />)}
    </div>
  )
}
