// Phation audit: measures the motion of any web page in headless Chrome, frame by frame, and scores it
// against the Phation Standard (§4 "Never", §5 UI, §6 reduced motion). Same detectors as the library's own QC.
//
//   import { audit, formatReport } from './audit.mjs'
//   const r = await audit('http://localhost:3000/checkout', { actions: ['click:#pay'], root: 'main' })
//
// Three loads of the page:
//   A. timing   rAF deltas only, no tracing overhead (dropped frames)
//   B. trace    every element under `root`: rect, cumulative opacity, visible area, inline layout styles, each frame
//   C. reduced  same as B with prefers-reduced-motion: reduce, to check the page respects it
// Each load: open → wait for the intro → run the actions → record a little longer.
import puppeteer from 'puppeteer-core'
import fs from 'fs'

// ---------- Chrome ----------
export function findChrome() {
  const c = [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
  const hit = c.find(p => p && fs.existsSync(p))
  if (!hit) throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH to a Chrome/Chromium executable.')
  return hit
}

// ---------- in-page tracer (delta-encoded: a row is sent only when it changes) ----------
function tracer(rootSel, cap) {
  const ids = new WeakMap(), desc = [], paints = new WeakMap(); let next = 0
  const paintOf = (el, cs) => {
    const a = c => { const m = c.match(/[\d.]+/g); return m ? (m.length > 3 ? +m[3] : 1) : 0 }
    if (/^(IMG|VIDEO|CANVAS|svg)$/i.test(el.tagName)) return 1
    if (a(cs.backgroundColor) > 0.05 || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0) return 1
    if (cs.backgroundImage !== 'none' && cs.webkitBackgroundClip !== 'text' && cs.backgroundClip !== 'text') return 1
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && a(cs.color) > 0.05) return 1
    return 0
  }
  const name = el => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
    const label = el.getAttribute('aria-label') || (el.childElementCount < 4 ? el.textContent.trim().replace(/\s+/g, ' ') : '')
    return label ? `${s} "${label.slice(0, 28)}"` : s
  }
  const T = (window.__trace = { frames: [], dts: [], on: false, desc, css: {} })
  // CSS transitions / keyframes on layout properties (Motion's inline-style animation is caught by `sig` below)
  const CSSLAYOUT = /^(top|left|right|bottom|width|height|inset|margin|padding|max-width|max-height|min-width|min-height)/
  let tick = 0
  const LAYOUT = ['width', 'height', 'top', 'left', 'right', 'bottom', 'marginTop', 'marginLeft', 'paddingTop', 'paddingLeft']
  let last = 0, prev = new Map()
  function walk(el, op, clip, out, fixed) {
    if (el.dataset && el.dataset.audit === 'skip') return // a deliberate bad example (e.g. a "before" demo) is not judged
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const fx = fixed || cs.position === 'fixed' || cs.position === 'sticky'
    const o = op * (+cs.opacity)
    if (!ids.has(el)) { ids.set(el, next); desc[next] = name(el); paints.set(el, paintOf(el, cs)); next++ }
    const r = el.getBoundingClientRect()
    const vw = Math.max(0, Math.min(r.right, clip[2]) - Math.max(r.left, clip[0])), vh = Math.max(0, Math.min(r.bottom, clip[3]) - Math.max(r.top, clip[1]))
    let sig = ''
    for (const k of LAYOUT) if (el.style[k]) sig += k + el.style[k]
    const m = cs.transform.match(/matrix\(([^,]+),([^,]+)/)
    out.push([ids.get(el), Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, Math.round(o * 1000) / 1000, sig, Math.round(vw * vh), paints.get(el), cs.clipPath === 'none' ? '' : cs.clipPath, m ? Math.round(Math.atan2(+m[2], +m[1]) * 573) / 10 : 0, fx ? 1 : 0])
    const nclip = cs.overflow !== 'visible' || cs.clipPath !== 'none' ? [Math.max(clip[0], r.left), Math.max(clip[1], r.top), Math.min(clip[2], r.right), Math.min(clip[3], r.bottom)] : clip
    if (out.length < cap) for (const c of el.children) { if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD|META|LINK)$/.test(c.tagName)) continue; walk(c, o, nclip, out, fx) }
  }
  function loop(ts) {
    if (last) T.dts.push(ts - last); last = ts
    if (T.on) {
      const root = (rootSel && document.querySelector(rootSel)) || document.body
      if (root) {
        const out = [], seen = new Set(), rows = []
        for (const c of root.children) walk(c, 1, [0, 0, innerWidth, innerHeight], out, false)
        for (const row of out) { const id = row[0], k = row.join('|'); seen.add(id); if (prev.get(id) !== k) { prev.set(id, k); rows.push(row) } }
        for (const id of prev.keys()) if (!seen.has(id)) { rows.push([id, null]); prev.delete(id) }
        T.frames.push([ts, rows, scrollX, scrollY])
        if (++tick % 4 === 0 && document.getAnimations) for (const an of document.getAnimations()) {
          const el = an.effect && an.effect.target; if (!el || !root.contains(el)) continue
          let props = []
          if (an.transitionProperty) props = [an.transitionProperty]
          else if (an.effect.getKeyframes) props = an.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).map(k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()))
          const b = el.getBoundingClientRect(), small = b.width <= 240 && b.height <= 80
          for (const pr of props) if (CSSLAYOUT.test(pr) && !(small && /^(width|height|min-|max-)/.test(pr))) { if (!ids.has(el)) { ids.set(el, next); desc[next] = name(el); next++ } const key = ids.get(el) + '|' + pr; T.css[key] = T.css[key] || ts }
        }
      }
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// rebuild full frames from the deltas, in page coordinates: scrolling the page is not element motion
// (fixed and sticky elements stay in viewport coordinates, because that is where they live)
function expand(deltas) {
  const state = new Map()
  return deltas.map(([ts, rows, sx = 0, sy = 0]) => {
    for (const r of rows) r[1] === null ? state.delete(r[0]) : state.set(r[0], r)
    return [ts, [...state.values()].map(r => r[11] ? r : [r[0], r[1] + sx, r[2] + sy, ...r.slice(3)])]
  })
}

// ---------- in-page UI audit (text, targets, images inside the viewport) ----------
function uiAudit(rootSel) {
  const root = (rootSel && document.querySelector(rootSel)) || document.body
  const parse = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0] }
  const inView = r => r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
  const shown = el => {
    const r = el.getBoundingClientRect(); if (!inView(r)) return false
    let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false; o *= +cs.opacity }
    return o > 0.6 && !facesAway(el)
  }
  // the hidden side of a flip card (backface-visibility: hidden, turned past 90°) is not on screen
  const facesAway = el => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (getComputedStyle(e).backfaceVisibility !== 'hidden') continue
      let m = new DOMMatrix()
      for (let a = e; a && a.nodeType === 1; a = a.parentElement) { const t = getComputedStyle(a).transform; if (t && t !== 'none') m = new DOMMatrix(t).multiply(m) }
      if (m.m33 < 0) return true
    }
    return false
  }
  const texts = [], targets = [], imgs = []
  let n = 0
  for (const el of root.querySelectorAll('*')) {
    if (++n > 4000) break
    if (el.closest('[aria-hidden="true"],[data-qc="decorative"],[data-audit="skip"]')) continue
    const cs = getComputedStyle(el)
    const own = [...el.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())
    if (own && texts.length < 150 && shown(el)) {
      const r = el.getBoundingClientRect(), fs = parseFloat(cs.fontSize), fg = parse(cs.color)
      if (fg[3] === undefined || fg[3] > 0.5) texts.push({ t: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), fs, large: fs >= 24 || (fs >= 18.6 && +cs.fontWeight >= 600), x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.width, innerWidth - Math.max(0, r.x)), h: Math.min(r.height, innerHeight - Math.max(0, r.y)), fg: fg.slice(0, 3) })
    }
    if (el.matches('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=slider],[role=checkbox],[role=switch]') && shown(el)) {
      const r = el.getBoundingClientRect(), inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li')
      if (!inline) targets.push({ t: (el.getAttribute('aria-label') || el.textContent.trim() || el.tagName).replace(/\s+/g, ' ').slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) })
    }
    if (el.tagName === 'IMG' && el.naturalWidth && shown(el)) { const r = el.getBoundingClientRect(); imgs.push({ src: (el.currentSrc || el.src).split('/').pop().slice(0, 40), up: Math.round((r.width * devicePixelRatio) / el.naturalWidth * 100) / 100 }) }
  }
  return { texts, targets, imgs }
}

// pixel contrast, computed in a blank page (the audited page's CSP can't block it): same method as qc/contrast.py
async function pixelContrast(browser, png, texts, dpr) {
  if (!texts.length) return texts
  const p = await browser.newPage()
  try {
    const res = await p.evaluate(async (b64, rects, d) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
      const cv = new OffscreenCanvas(img.width, img.height), g = cv.getContext('2d'); g.drawImage(img, 0, 0)
      const lum = ([r, gg, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b) }
      return rects.map(r => {
        const x0 = Math.max(0, Math.floor(r.x * d)), y0 = Math.max(0, Math.floor(r.y * d)), w = Math.min(img.width - x0, Math.floor(r.w * d)), h = Math.min(img.height - y0, Math.floor(r.h * d))
        if (w < 2 || h < 2) return null
        const px = g.getImageData(x0, y0, w, h).data, text = [], rest = [], near = []
        for (let i = 0; i < px.length; i += 4) {
          const c = [px[i], px[i + 1], px[i + 2]], dist = Math.hypot(c[0] - r.fg[0], c[1] - r.fg[1], c[2] - r.fg[2])
          if (dist < 40) text.push(c); if (dist > 90) rest.push(lum(c)); if (dist > 12) near.push(lum(c))
        }
        const n = px.length / 4, cover = text.length / n
        let bg = rest; if (bg.length < 10 && cover > 0.6) bg = near.length >= 10 ? near : bg
        if (bg.length < 10 || cover < 0.01) return { cr: null, cover }
        bg.sort((a, b) => a - b); const lb = bg[bg.length >> 1], lf = lum(r.fg), hi = Math.max(lf, lb), lo = Math.min(lf, lb)
        return { cr: Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100, cover }
      })
    }, png, texts, dpr)
    // text with no pixels of its colour on screen (covered, a back face) is not checked; tiny antialiased type keeps a few
    return texts.map((t, i) => ({ ...t, cr: res[i]?.cr ?? null, hidden: res[i] && res[i].cover < 0.002 })).filter(t => !t.hidden)
  } finally { await p.close() }
}

// ---------- actions ----------
// "click:#buy" · "hover:.card" · "scroll:600" · "drag:.thumb:200,0" · "hold:.btn:1500" · "key:Escape" · "type:input[name=q]:hello" · "wait:800"
export function parseAction(a) {
  if (typeof a === 'object') return a
  const i = a.indexOf(':'), type = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase(), rest = i < 0 ? '' : a.slice(i + 1)
  const tail = () => { const j = rest.lastIndexOf(':'); return j < 0 ? [rest, ''] : [rest.slice(0, j), rest.slice(j + 1)] }
  switch (type) {
    case 'click': case 'hover': case 'focus': return { type, selector: rest }
    case 'scroll': return { type, y: +rest || 600 }
    case 'wait': return { type, ms: +rest || 800 }
    case 'key': return { type, key: rest || 'Enter' }
    case 'drag': { const [s, d] = tail(); const [dx, dy] = (d || '200,0').split(',').map(Number); return { type, selector: s, dx: dx || 0, dy: dy || 0 } }
    case 'hold': { const [s, ms] = tail(); return { type, selector: s, ms: +ms || 1500 } }
    case 'type': { const [s, text] = tail(); return { type, selector: s, text } }
    default: throw new Error(`Unknown action "${a}". Use click:, hover:, focus:, scroll:, drag:, hold:, key:, type: or wait:`)
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function centre(page, selector) {
  const el = await page.$(selector); if (!el) throw new Error(`Action target not found: ${selector}`)
  // only scroll when the target is not already fully on screen
  const off = await el.evaluate(e => { const r = e.getBoundingClientRect(); return r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth })
  if (off) { await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' })); await sleep(400) }
  const b = await el.boundingBox(); if (!b) throw new Error(`Action target is not visible: ${selector}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
async function run(page, a, after) {
  const m = page.mouse
  if (a.type === 'wait') return sleep(a.ms)
  if (a.type === 'scroll') { for (let i = 0; i < 20; i++) { await m.wheel({ deltaY: a.y / 20 }); await sleep(30) } }
  else if (a.type === 'key') await page.keyboard.press(a.key)
  else if (a.type === 'focus') await page.focus(a.selector)
  else if (a.type === 'type') { await page.click(a.selector); await page.keyboard.type(a.text, { delay: 40 }) }
  else {
    const c = await centre(page, a.selector)
    if (a.type === 'hover') await m.move(c.x, c.y, { steps: 12 })
    if (a.type === 'click') { await m.move(c.x, c.y, { steps: 8 }); await sleep(80); await m.click(c.x, c.y) }
    if (a.type === 'hold') { await m.move(c.x, c.y, { steps: 8 }); await m.down(); await sleep(a.ms); await m.up() }
    if (a.type === 'drag') { await m.move(c.x, c.y); await m.down(); for (let i = 1; i <= 30; i++) { await m.move(c.x + a.dx * i / 30, c.y + a.dy * i / 30); await sleep(16) } await m.up() }
  }
  await sleep(after)
}
// no actions given: hover a few visible controls (never click: that could submit or navigate)
async function autoActions(page, root) {
  const sels = await page.evaluate(r => {
    const base = (r && document.querySelector(r)) || document.body, out = []
    for (const el of base.querySelectorAll('button, a[href], [role=button], [role=tab]')) {
      const b = el.getBoundingClientRect(); if (b.width < 8 || b.height < 8 || b.bottom < 0 || b.top > innerHeight) continue
      el.setAttribute('data-hp-audit', String(out.length)); out.push(`[data-hp-audit="${out.length}"]`); if (out.length >= 4) break
    }
    return out
  }, root)
  return sels.map(s => ({ type: 'hover', selector: s }))
}

// ---------- analysis (shared with qc/certify.mjs) ----------
function analyse(frames, actFrame) {
  const tracks = new Map()
  frames.forEach(([ts, els], fi) => els.forEach(([id, x, y, w, h, o, sig, va, pt, cp, ang]) => {
    if (!tracks.has(id)) tracks.set(id, [])
    tracks.get(id).push({ fi, ts, x, y, w, h, o, sig, va, pt, cp, ang })
  }))
  const N = frames.length, issues = [], segs = []
  const ends = []
  for (const tr of tracks.values()) ends.push(tr[0], tr[tr.length - 1])
  let movedAfterAct = false
  for (const [id, tr] of tracks) {
    const area = Math.max(...tr.map(p => p.w * p.h))
    if (area < 16) continue
    const first = tr[0], lastp = tr[tr.length - 1]
    const same = (p, fi) => ends.some(q => q !== tr[0] && q !== tr[tr.length - 1] && Math.abs(q.fi - fi) <= 2 && Math.abs(q.x - p.x) < 3 && Math.abs(q.y - p.y) < 3 && Math.abs(q.w - p.w) < 3 && Math.abs(q.h - p.h) < 3)
    const reveal = p0 => tr.slice(0, 8).some(q => q.cp !== p0.cp)
    if (first.pt && !reveal(first) && first.fi > 8 && first.o > 0.9 && first.va > 6000 && tr[Math.min(3, tr.length - 1)].o > 0.9 && !same(first, first.fi)) issues.push({ k: 'cut-in', el: id, ts: first.ts, d: `${Math.round(first.w)}×${Math.round(first.h)} appears at full opacity` })
    if (lastp.pt && lastp.fi < N - 2 && lastp.o > 0.9 && lastp.va > 6000 && !same(lastp, lastp.fi)) issues.push({ k: 'cut-out', el: id, ts: lastp.ts, d: `${Math.round(lastp.w)}×${Math.round(lastp.h)} vanishes at full opacity` })
    const sigs = new Set(tr.map(p => p.sig).filter(Boolean))
    // a small control morphing its own size is allowed by the standard (§1.6): ≤ 240 × 80 px
    const small = Math.max(...tr.map(p => p.w)) <= 240 && Math.max(...tr.map(p => p.h)) <= 80
    if (sigs.size >= 8 && !small) issues.push({ k: 'layout-anim', el: id, ts: tr[0].ts, d: `inline ${[...sigs][0].replace(/[\d.\-]+.*/, '')} changes on ${sigs.size} frames` })
    // a container bigger than the screen growing because content loaded is layout, not motion: skip its size channels
    const page = area > 1.2e6
    for (const ch of ['x', 'y', 'w', 'h', 'o']) {
      if (page && (ch === 'w' || ch === 'h')) continue
      const thr = ch === 'o' ? 0.008 : 0.3
      let i = 1
      while (i < tr.length) {
        if (Math.abs(tr[i][ch] - tr[i - 1][ch]) <= thr || tr[i].fi !== tr[i - 1].fi + 1) { i++; continue }
        let j = i, still = 0
        while (j < tr.length && tr[j].fi === tr[j - 1].fi + 1 && still <= 2) { still = Math.abs(tr[j][ch] - tr[j - 1][ch]) <= thr ? still + 1 : 0; j++ }
        const s = tr.slice(i - 1, j - still)
        i = j
        if (s.length < 4) {
          if (s.length >= 2) { const jump = Math.abs(s[s.length - 1][ch] - s[0][ch]); const vis = s[0].pt && Math.max(s[0].o, s[s.length - 1].o) > 0.5 && Math.max(s[0].va, s[s.length - 1].va) > 200
            // an image or lazy block getting its size for the first time (from ~0) is loading, not motion
            const loading = s[0].w < 4 || s[0].h < 4
            if (vis && !loading && ((ch !== 'o' && jump > 40) || (ch === 'o' && jump > 0.6 && area > 3000))) segs.push({ id, ch, pop: true, ts: s[0].ts, fi: s[0].fi, jump, area }) }
          continue
        }
        const v = s.map(p => p[ch]), dur = s[s.length - 1].ts - s[0].ts, travel = v[v.length - 1] - v[0]
        const sp = v.slice(1).map((p, k) => Math.abs(p - v[k]))
        const mid = sp.slice(Math.floor(sp.length * 0.15), Math.ceil(sp.length * 0.85))
        const mean = mid.reduce((a, b) => a + b, 0) / (mid.length || 1)
        const cv = Math.sqrt(mid.reduce((a, b) => a + (b - mean) ** 2, 0) / (mid.length || 1)) / (mean || 1)
        const beyond = travel === 0 ? 0 : Math.max(0, ...v.map(p => (p - v[v.length - 1]) * Math.sign(travel)))
        const spinning = Math.max(...s.map(p => p.ang)) - Math.min(...s.map(p => p.ang)) > 5
        const ambient = spinning || dur > 2600 || s[s.length - 1].fi >= N - 2
        const vis = Math.max(...s.map(p => p.o)) > 0.3 && Math.max(...s.map(p => p.va)) > 200
        if (actFrame >= 0 && s[s.length - 1].fi > actFrame && Math.max(...v.map(p => Math.abs(p - v[0]))) > (ch === 'o' ? 0.1 : 3)) movedAfterAct = true
        if (!vis) continue
        segs.push({ id, ch, ts: s[0].ts, fi: s[0].fi, dur, frames: s.length, travel, mean, cv, over: travel ? beyond / Math.abs(travel) : 0, ambient, area, load: s[0].w < 4 || s[0].h < 4 })
      }
    }
  }
  const key = s => `${s.ch}|${Math.round(s.ts / 50)}|${Math.round(s.dur / 50)}|${Math.round((s.travel || s.jump || 0) * (s.ch === 'o' ? 20 : 0.2))}`
  const uniq = [...new Map(segs.map(s => [key(s), s])).values()]
  const shape = s => `${s.ch}|${Math.round(s.dur / 120)}|${Math.round(Math.abs(s.travel || 0) * (s.ch === 'o' ? 10 : 0.1))}`
  const reps = {}; for (const s of uniq) if (!s.pop) reps[shape(s)] = (reps[shape(s)] || 0) + 1
  for (const s of uniq) if (!s.pop && reps[shape(s)] >= 3) s.ambient = true
  let moves = 0, dist = 0
  for (const s of uniq) {
    if (s.pop) { issues.push({ k: s.ch === 'o' ? 'opacity-pop' : 'teleport', el: s.id, ts: s.ts, d: `${s.ch} jumps ${s.ch === 'o' ? s.jump.toFixed(2) : Math.round(s.jump) + 'px'} in one frame` }); continue }
    if (!s.ambient && !s.load && (s.ch === 'x' || s.ch === 'y') && Math.abs(s.travel) > 12) { moves++; dist += Math.abs(s.travel) }
    const big = s.ch === 'o' ? Math.abs(s.travel) > 0.3 : Math.abs(s.travel) > 12
    if (!s.ambient && big && s.frames >= 15 && s.mean > (s.ch === 'o' ? 0.01 : 0.6) && s.cv < 0.07)
      issues.push({ k: s.ch === 'o' ? 'linear-fade' : 'linear-move', el: s.id, ts: s.ts, d: `${s.ch} ${s.ch === 'o' ? s.travel.toFixed(2) : Math.round(s.travel) + 'px'} at constant speed for ${Math.round(s.dur)} ms` })
    if (!s.ambient && s.ch !== 'o' && Math.abs(s.travel) > 16 && s.over > 0.22) issues.push({ k: 'overshoot', el: s.id, ts: s.ts, d: `${s.ch} overshoots ${Math.round(s.over * 100)}% of ${Math.round(Math.abs(s.travel))}px` })
    if (!s.ambient && s.ch !== 'o' && Math.abs(s.travel) > 60 && s.dur > 1300 && Math.abs(s.travel) / s.dur * 1000 < 300) issues.push({ k: 'slow', el: s.id, ts: s.ts, d: `${s.ch} ${Math.round(s.travel)}px takes ${Math.round(s.dur)} ms` })
    if (!s.ambient && s.ch !== 'o' && Math.abs(s.travel) > 60 && s.dur < 110 && s.frames >= 4) issues.push({ k: 'snap', el: s.id, ts: s.ts, d: `${s.ch} ${Math.round(s.travel)}px in ${Math.round(s.dur)} ms` })
  }
  return { issues, movedAfterAct, moves, dist: Math.round(dist), segments: uniq.length }
}

// ---------- scoring + fixes (values from the Phation Standard) ----------
export const W = { 'page-error': 25, 'cut-in': 6, 'cut-out': 6, teleport: 6, 'opacity-pop': 4, 'linear-move': 8, 'linear-fade': 2, overshoot: 3, slow: 2, snap: 3, 'layout-anim': 2, 'no-response': 8, jank: 6, 'jank-heavy': 12, 'ignores-reduced-motion': 6, 'low-contrast': 8, 'weak-contrast': 2, 'tiny-text': 2, 'small-target': 3, 'upscaled-image': 3 }
const CAP = { 'linear-fade': 6, 'layout-anim': 6, 'weak-contrast': 6, 'tiny-text': 6, 'small-target': 9, 'upscaled-image': 6, overshoot: 9, 'opacity-pop': 12, 'cut-in': 12, 'cut-out': 12, teleport: 12, 'linear-move': 24, slow: 6, snap: 9 }
export const BLOCK = new Set(['page-error', 'linear-move', 'low-contrast', 'jank-heavy', 'no-response'])
export const FIX = {
  'linear-move': 'Moves at constant speed. Use `enter` cubic-bezier(0.16, 1, 0.3, 1), or the `snap` spring k420 c32 for controls (§2.1, §2.2). Linear is only for ambient loops.',
  'linear-fade': 'Linear fade. Use `fade` cubic-bezier(0.4, 0, 0.2, 1) for opacity (§2.1).',
  teleport: 'Jumps more than 40 px in one frame. Animate transform (x/y) or use Motion `layout` / `layoutId` instead of setting the position (§1.6).',
  'opacity-pop': 'Appears or disappears in one frame. Fade it: 150–220 ms on `fade` (§2.3).',
  'cut-in': 'A large element appears at full opacity. Enter it: y 18–24 px + fade, 400 ms `enter` (§3), or grow it out of its trigger (§1.3).',
  'cut-out': 'A large element vanishes at full opacity. Exit it with a fade + small move at ≈0.7× its enter duration on `move` (§1.5).',
  overshoot: 'Bounces too far. Use `snap` k420 c32 (≈2 %); keep `pop` k400 c20 for small elements only (§2.2).',
  slow: 'Too slow for its distance. Large moves take 700–900 ms; nothing over 1.3 s (§2.3).',
  snap: 'Too abrupt for its distance. Moves over 60 px take at least 300 ms (§2.3).',
  'layout-anim': 'Animates width/height/top/left. Animate transform, or use Motion `layout` (§1.6). A small control morphing its own width is the one exception.',
  'no-response': 'Nothing moved after the action. Give feedback: press = scale 0.96 for 160 ms, or show the next state (§3).',
  jank: 'Drops frames. Animate only transform and opacity; avoid animating filter, box-shadow or blur on large areas (§1.6).',
  'jank-heavy': 'Drops many frames. Animate only transform and opacity; avoid animating filter, box-shadow or blur on large areas (§1.6).',
  'ignores-reduced-motion': 'Still moves with prefers-reduced-motion. Use useReducedMotion() and replace movement with a ≤ 150 ms fade (§6).',
  'low-contrast': 'Text under 3:1. Raise it to 4.5:1 (3:1 for ≥ 24 px); add a scrim over photos (§5).',
  'weak-contrast': 'Body text under 4.5:1. Darken the text or add a scrim (§5).',
  'tiny-text': 'Text under 10.5 px. Use at least 11 px (§5).',
  'small-target': 'Touch target under 24 px. Make it at least 24 px, 44 px on mobile (§5).',
  'upscaled-image': 'Image drawn bigger than its pixels. Serve a larger source (§5).',
  'page-error': 'The page threw an error during the audit. Fix it first; motion results may be incomplete.',
}

function uiIssues(ui, tag, mobile) {
  const out = [], seen = new Set(), once = (k, d) => { if (!seen.has(k + d)) { seen.add(k + d); out.push({ k, d: `${tag}: ${d}` }) } }
  for (const t of ui.texts) {
    if (t.cr != null && t.cr < 3) once('low-contrast', `"${t.t}" ${t.cr}:1`)
    else if (t.cr != null && t.cr < 4.5 && !t.large) once('weak-contrast', `"${t.t}" ${t.cr}:1 at ${t.fs}px`)
    if (t.fs < 10.5) once('tiny-text', `"${t.t}" ${t.fs}px`)
  }
  for (const t of ui.targets) if (Math.min(t.w, t.h) < (mobile ? 24 : 20)) once('small-target', `"${t.t}" ${t.w}×${t.h}`)
  for (const i of ui.imgs) if (i.up > 1.3) once('upscaled-image', `${i.src} ×${i.up}`)
  return out
}

/**
 * Audit the motion of a page.
 * @param {string} url
 * @param {{ actions?: (string|object)[], root?: string, mobile?: boolean, intro?: number, after?: number, reduced?: boolean, cap?: number, shots?: string }} opts
 */
export async function audit(url, { actions = [], root = null, mobile = false, dark = false, intro = 2500, after = 1200, reduced = true, cap = 1500, shots = null, onStep = () => {}, launch = {}, guard = null } = {}) {
  const acts = actions.map(parseAction)
  const view = mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 2 }
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, ...launch, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--no-first-run', ...(launch.args || [])] })
  const rep = { url, viewport: (mobile ? 'mobile 390×844' : 'desktop 1440×900') + (dark ? ' · dark' : ''), root: root || 'body', actions: [], issues: [] }
  const desc = []
  try {
    const open = async (traceOn, media) => {
      const p = await browser.newPage(); await p.setViewport(view)
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, ...(media ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])])
      await p.evaluateOnNewDocument(tracer, root, cap)
      if (traceOn) await p.evaluateOnNewDocument(() => { window.__hpTraceFromStart = true })
      const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)))
      // hosted audits: `guard(url) → bool` vets every request the page makes (no private hosts behind a public page)
      if (guard) { await p.setRequestInterception(true); p.on('request', r => (guard(r.url()) ? r.continue() : r.abort('blockedbyclient'))) }
      await p.evaluateOnNewDocument(() => { if (window.__hpTraceFromStart) { const s = () => window.__trace ? (window.__trace.on = true) : requestAnimationFrame(s); s() } })
      const res = await p.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      if (!res || res.status() >= 400) throw new Error(`Could not load ${url} (${res ? 'HTTP ' + res.status() : 'no response'}). Is the dev server running?`)
      return { p, errs }
    }
    const play = async (p, list) => {
      await sleep(intro)
      const actFrame = await p.evaluate(() => window.__trace.frames.length)
      const done = []
      for (const a of list) { await run(p, a, after); done.push(a) }
      await sleep(after)
      return { actFrame, done }
    }

    // A — timing
    onStep('timing')
    let { p, errs } = await open(false)
    const list = acts.length ? acts : await autoActions(p, root)
    await play(p, list)
    const dts = await p.evaluate(() => window.__trace.dts.slice(30)); await p.close()
    const dropped = dts.filter(d => d > 25).length / (dts.length || 1)
    rep.dropped = Math.round(dropped * 1000) / 10
    if (dropped > 0.15) rep.issues.push({ k: 'jank-heavy', d: `${rep.dropped}% of frames over 25 ms` })
    else if (dropped > 0.05) rep.issues.push({ k: 'jank', d: `${rep.dropped}% of frames over 25 ms` })

    // B — trace, from the first frame so entrance motion counts
    onStep('trace')
    ;({ p, errs } = await open(true))
    const listB = acts.length ? acts : await autoActions(p, root)
    const shot = async f => { const png = await p.screenshot({ encoding: 'base64' }); if (shots) { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(`${shots}/${f}.png`, Buffer.from(png, 'base64')) } return png }
    await sleep(intro)
    const uiRest = await p.evaluate(uiAudit, root); uiRest.texts = await pixelContrast(browser, await shot('rest'), uiRest.texts, view.deviceScaleFactor)
    // waiting is not an interaction: only real actions must get a visible response
    const interacts = acts.some(a => a.type !== 'wait')
    const actFrame = interacts ? await p.evaluate(() => window.__trace.frames.length) : -1
    for (const a of listB) { await run(p, a, after); rep.actions.push(a.type + (a.selector && !a.selector.startsWith('[data-hp-audit') ? ' ' + a.selector : a.y ? ' ' + a.y : a.key ? ' ' + a.key : '')) }
    await sleep(after)
    const uiEnd = await p.evaluate(uiAudit, root); uiEnd.texts = await pixelContrast(browser, await shot('end'), uiEnd.texts, view.deviceScaleFactor)
    const raw = await p.evaluate(() => { window.__trace.on = false; return { frames: window.__trace.frames, desc: window.__trace.desc, css: window.__trace.css } })
    await p.close()
    desc.push(...raw.desc)
    const frames = expand(raw.frames)
    if (!frames.length) throw new Error('No frames recorded. Check the root selector.')
    const a = analyse(frames, actFrame)
    const t0 = frames[0][0]
    rep.frames = frames.length; rep.segments = a.segments
    rep.issues.push(...a.issues.map(i => ({ k: i.k, at: i.ts ? `${((i.ts - t0) / 1000).toFixed(2)}s` : undefined, el: i.el != null ? desc[i.el] : undefined, d: i.d })))
    for (const [key, ts] of Object.entries(raw.css || {})) { const [id, prop] = key.split('|'); rep.issues.push({ k: 'layout-anim', at: `${((ts - t0) / 1000).toFixed(2)}s`, el: desc[+id], d: `CSS animates ${prop}` }) }
    if (interacts && !a.movedAfterAct) rep.issues.push({ k: 'no-response', d: `nothing moved after: ${rep.actions.join(', ')}` })
    rep.issues.push(...uiIssues(uiRest, 'rest', mobile), ...uiIssues(uiEnd, 'after actions', mobile))
    errs.forEach(e => rep.issues.push({ k: 'page-error', d: e }))

    // C — reduced motion: the same run should barely move
    if (reduced && a.dist > 60) {
      onStep('reduced')
      ;({ p } = await open(true, true))
      const listC = acts.length ? acts : await autoActions(p, root)
      await play(p, listC)
      const rf = expand(await p.evaluate(() => { window.__trace.on = false; return window.__trace.frames })); await p.close()
      const r = analyse(rf, -1)
      rep.reduced = { normalPx: a.dist, reducedPx: r.dist, share: Math.round(r.dist / a.dist * 100) }
      // movement is measured as total travel; under 30 % left means the page swapped motion for fades
      if (r.dist > Math.max(60, a.dist * 0.3)) rep.issues.push({ k: 'ignores-reduced-motion', d: `${rep.reduced.share}% of the movement (${r.dist} of ${a.dist} px) still plays with prefers-reduced-motion: reduce` })
    }
  } catch (e) {
    // could not load or drive the page at all: that is an error to fix, not a motion score
    if (!rep.frames) rep.error = /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|Could not load/.test(e.message) ? `Could not open ${url}. Is the dev server running?` : String(e.message).slice(0, 240)
    else rep.issues.push({ k: 'page-error', d: 'audit: ' + String(e.message).slice(0, 200) })
  } finally { await browser.close() }
  if (rep.error) { rep.status = 'ERROR'; rep.score = null; rep.blockers = []; return rep }

  for (const i of rep.issues) i.fix = FIX[i.k]
  const by = {}; for (const i of rep.issues) by[i.k] = (by[i.k] || 0) + (W[i.k] || 1)
  let score = 100; for (const [k, v] of Object.entries(by)) score -= Math.min(v, CAP[k] ?? v)
  rep.score = Math.max(0, score)
  rep.blockers = [...new Set(rep.issues.filter(i => BLOCK.has(i.k)).map(i => i.k))]
  rep.status = rep.blockers.length ? 'FAIL' : rep.score >= 85 ? 'PASS' : 'REVIEW'
  return rep
}

// human-readable report, grouped by kind, blockers first
export function formatReport(r) {
  if (r.status === 'ERROR') return `Phation audit · ERROR · ${r.url}\n${r.error}`
  const L = [`Phation audit · ${r.status} ${r.score}/100 · ${r.url}`, `${r.viewport} · root ${r.root} · ${r.frames ?? 0} frames · ${r.dropped ?? '–'}% dropped · actions: ${r.actions.join(', ') || 'none'}`]
  if (r.reduced) L.push(`reduced motion: ${r.reduced.share}% of the movement still plays (${r.reduced.reducedPx} of ${r.reduced.normalPx} px)`)
  if (!r.issues.length) { L.push('', 'No issues. The motion meets the Phation Standard on this run.'); return L.join('\n') }
  const groups = {}; for (const i of r.issues) (groups[i.k] = groups[i.k] || []).push(i)
  const order = Object.keys(groups).sort((a, b) => (BLOCK.has(b) - BLOCK.has(a)) || (W[b] || 1) - (W[a] || 1))
  for (const k of order) {
    const g = groups[k]
    L.push('', `${BLOCK.has(k) ? '✗' : '!'} ${k} (${g.length})${BLOCK.has(k) ? ' — blocker' : ''}`, `  fix: ${FIX[k] || ''}`)
    for (const i of g.slice(0, 6)) L.push(`  · ${i.at ? i.at.padStart(6) + '  ' : ''}${i.el ? i.el + ': ' : ''}${i.d}`)
    if (g.length > 6) L.push(`  · … ${g.length - 6} more`)
  }
  return L.join('\n')
}
