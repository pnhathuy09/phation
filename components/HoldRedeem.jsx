import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, animate } from 'motion/react'

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

// Voucher redemption: redeeming is deliberate, so it is a hold. The accent fills the ink pill while pressed (1.2 s),
// drains back quickly if you let go early, and when it completes the voucher turns over to show the code.
// Phation Soft: white card, hero value, flat ink pill, one green accent, code in a well.

// ── Phation Soft · material tokens ──
const S = {
  card: 'var(--demo-card, #ffffff)', well: 'var(--demo-well, #f4f4f5)',
  ink: 'var(--demo-ink, #161618)', ink2: 'var(--demo-ink2, #66666d)', line: 'var(--demo-line, rgba(0,0,0,.06))',
  shCard: 'var(--demo-sh-card, 0 0 0 1px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.04), 0 12px 28px -10px rgba(0,0,0,.14))',
  shWell: 'var(--demo-sh-well, inset 0 1px 2px rgba(0,0,0,.07), inset 0 0 0 1px rgba(0,0,0,.04))',
  key: 'var(--demo-well, #f2f2f3)',
  shKey: 'none',
  pill: 'var(--demo-pill, #161618)',
  shPill: 'none',
  font: 'Inter, "SF Pro Text", system-ui, sans-serif',
}
// white text ≥ 4.5 : 1 on every option. Studio › Look › Colour picks it.
export const ACCENTS = [{ label: 'Green', color: '#15803d' }, { label: 'Blue', color: '#0b6fd8' }, { label: 'Violet', color: '#6d28d9' }, { label: 'Red', color: '#c42a1f' }]
const tint = (hex, amt = 14) => `color-mix(in srgb, ${hex} ${amt}%, var(--demo-card, #fff))`

// Motion values. Phation Studio exports this object: paste a tuned one over it.
export const MOTION = {
  hold: 1200, // ms of pressing to redeem (linear on purpose: it is a progress bar)
  drain: [0.16, 1, 0.3, 1], // fill drains back if released early
  drainMs: 350,
  flip: { type: 'spring', stiffness: 160, damping: 20, mass: 1 }, // voucher turns over
  check: { type: 'spring', stiffness: 400, damping: 18, mass: 1 }, // tick pops on the back
}
export const params = {
  flip: { type: 'spring', label: 'Card flip', ...MOTION.flip },
  check: { type: 'spring', label: 'Tick pop', ...MOTION.check },
  drain: { type: 'ease', label: 'Drain curve', value: MOTION.drain },
  hold: { type: 'ms', label: 'Hold time', value: MOTION.hold, min: 400, max: 3000, step: 50 },
  drainMs: { type: 'ms', label: 'Drain', value: MOTION.drainMs, min: 100, max: 1000 },
  accent: { type: 'pick', label: 'Colour', value: 0, options: ACCENTS },
  sound: { type: 'pick', label: 'Sound', value: 1, toggle: true, group: 'Sound', options: [{ label: 'Off' }, { label: 'On' }] },
  volume: { type: 'num', label: 'Volume', value: 60, min: 0, max: 100, unit: '%', group: 'Sound' },
}

const BARS = Array.from({ length: 46 }, (_, i) => ((i * 7919) % 5) + 1)
const face = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: 22, background: S.card, color: S.ink, boxShadow: S.shCard, padding: 20, display: 'flex', flexDirection: 'column' }

export default function HoldRedeem({ values }) {
  const m = { ...MOTION, ...values }, HOLD = m.hold / 1000, ACCENT = (ACCENTS[m.accent] ?? ACCENTS[0]).color
  const p = useMotionValue(0), run = useRef(null)
  const [done, setDone] = useState(false), [down, setDown] = useState(false)
  
  const el = useRef(null)
  const press = e => { if (done) return; if (e?.currentTarget) { el.current = e.currentTarget; cue(el.current, 'rise', { ...m, pitch: 0.9 }) } setDown(true); run.current?.stop(); run.current = animate(p, 1, { duration: HOLD * (1 - p.get()), ease: 'linear', onComplete: () => { cue(el.current, 'chime', m); setDown(false); setDone(true) } }) }
  const release = e => { if (down && !done && p.get() < 1) cue(e?.currentTarget, 'fall', m); setDown(false); if (done) return; run.current?.stop(); run.current = animate(p, 0, { duration: m.drainMs / 1000, ease: m.drain }) }
  const reset = () => { setDone(false); run.current?.stop(); run.current = animate(p, 0, { duration: m.drainMs / 1000, ease: m.drain, delay: 0.15 }) } // drains while the card turns back
  // demo: one full hold, then turn back
  useEffect(() => { if (window.__phAuto) return; const a = setTimeout(press, 600), b = setTimeout(reset, 2400 + m.hold); return () => { clearTimeout(a); clearTimeout(b); run.current?.stop() } }, [])
  return (
    <div style={{ width: 290, height: 320, perspective: 1000, fontFamily: S.font }}>
      <motion.div animate={{ rotateY: done ? 180 : 0 }} transition={m.flip} style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d' }}>
        {/* front: voucher */}
        <div style={face}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: S.ink2 }}><span>Rewards voucher</span><span>Until 31 Dec</span></div>
          <div style={{ marginTop: 24, fontSize: 48, fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>$10 <span style={{ color: S.ink2 }}>off</span></div>
          <div style={{ fontSize: 14, color: S.ink2, marginTop: 8 }}>your total bill</div>
          <div style={{ height: 1, background: S.line, margin: '20px 0 16px' }} />
          <div style={{ fontSize: 12, color: S.ink2, lineHeight: 1.5, flex: 1 }}>Valid at participating stores. One voucher per bill.</div>
          <motion.button onPointerDown={press} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
            animate={{ scale: down ? 0.98 : 1 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            style={{ position: 'relative', width: '100%', height: 48, border: 0, borderRadius: 24, overflow: 'hidden', cursor: 'pointer', background: S.pill, color: '#fff', font: `500 15px/1 ${S.font}`, touchAction: 'none', userSelect: 'none' }}>
            <motion.span style={{ position: 'absolute', inset: 0, scaleX: p, transformOrigin: '0 50%', background: ACCENT }} />
            <span style={{ position: 'relative' }}>Hold to redeem</span>
          </motion.button>
        </div>
        {/* back: code */}
        <div style={{ ...face, transform: 'rotateY(180deg)', alignItems: 'center' }}>
          <motion.div initial={false} animate={{ scale: done ? 1 : 0.6, opacity: done ? 1 : 0 }} transition={{ ...m.check, delay: 0.25 }}
            style={{ width: 44, height: 44, borderRadius: 22, background: tint(ACCENT, 16), color: ACCENT, display: 'grid', placeItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 22 22"><path d="M5 11.5l4 4L17 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 12 }}>Voucher redeemed</div>
          <div style={{ fontSize: 13, color: S.ink2, marginTop: 4 }}>Show this code at the counter</div>
          <div style={{ marginTop: 16, width: '100%', padding: '14px 14px 10px', borderRadius: 14, background: '#fff', boxShadow: S.shWell, color: '#111', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2, height: 54 }}>{BARS.map((w, i) => <span key={i} style={{ width: w, background: i % 3 ? '#111' : 'transparent' }} />)}</div>
            <div style={{ font: '500 13px/1 "Geist Mono", monospace', letterSpacing: '.16em', marginTop: 8 }}>TT 5000 2611</div>
          </div>
          <motion.button onClick={e => { cue(e.currentTarget, 'swish', m); reset() }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            style={{ marginTop: 'auto', height: 36, padding: '0 22px', border: 0, borderRadius: 18, background: S.key, color: S.ink, font: `500 13px/1 ${S.font}`, cursor: 'pointer' }}>Done</motion.button>
        </div>
      </motion.div>
    </div>
  )
}
