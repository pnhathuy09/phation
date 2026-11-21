// Studio share links: tuned motion values travel in the URL query of an entry page, only the keys that differ from
// the entry's defaults. Readable on purpose, so a link in Slack says what changed:
//   /m/digit-roll?digit=s420_32_1&stagger=60          spring  s<stiffness>_<damping>_<mass>
//   /m/buy-morph?morph=b0.16_1_0.3_1&morphMs=450       curve   b<x1>_<y1>_<x2>_<y2>
//                                                      number  plain (ms, %, px…)
// Shared by the site (Studio) and the CLI (`phation add <slug> --from <link>`), so both read the same format.

const num = s => (s !== '' && Number.isFinite(+s) ? +s : null)

export function encodeValue(v) {
  if (Array.isArray(v)) return 'b' + v.join('_')
  if (v && typeof v === 'object') return `s${v.stiffness}_${v.damping}_${v.mass ?? 1}`
  return String(v)
}

export function decodeValue(s) {
  s = String(s).trim()
  if (s[0] === 's') {
    const [k, c, m] = s.slice(1).split('_').map(num)
    return k !== null && c !== null ? { stiffness: k, damping: c, mass: m ?? 1 } : null
  }
  if (s[0] === 'b') {
    const b = s.slice(1).split('_').map(num)
    return b.length === 4 && b.every(x => x !== null) ? b : null
  }
  return num(s)
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Query string ('' when nothing changed) for the values that differ from the defaults. */
export function encodeValues(values, defaults) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(values)) if (!same(v, defaults[k])) q.set(k, encodeValue(v))
  return q.toString().replace(/%2C/g, ',')
}

/** { key: value } from a link, a query string or URLSearchParams; unknown or malformed values are dropped. */
export function decodeValues(input) {
  let q
  if (input instanceof URLSearchParams) q = input
  else {
    const s = String(input).trim()
    try { q = new URL(s).searchParams } catch { q = new URLSearchParams(s.includes('?') ? s.slice(s.indexOf('?') + 1) : s) }
  }
  const out = {}
  for (const [k, raw] of q) { const v = decodeValue(raw); if (v !== null && /^\w+$/.test(k)) out[k] = v }
  return out
}

/** Slug of an entry link (/m/<slug>), or null. */
export const slugOfLink = s => { try { return new URL(s).pathname.match(/^\/m\/([^/?#]+)/)?.[1] ?? null } catch { return null } }

const lit = v => (Array.isArray(v) ? `[${v.join(', ')}]` : v && typeof v === 'object' ? `{ type: 'spring', stiffness: ${v.stiffness}, damping: ${v.damping}, mass: ${v.mass} }` : String(v))

/**
 * Rewrites the `export const MOTION = { … }` block of an entry's source with tuned values. Each key sits on its own
 * line (`  key: value, // comment`); comments are kept. Returns { code, applied, skipped }.
 */
export function applyValues(code, values, note) {
  const start = code.search(/^export const MOTION = \{/m)
  if (start < 0) return { code, applied: [], skipped: Object.keys(values) }
  const end = code.indexOf('\n}', start)
  let block = code.slice(start, end)
  const applied = [], skipped = []
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^(\\s+${k}: )(.+?)(,[ \\t]*(//.*)?)$`, 'm')
    if (re.test(block)) { block = block.replace(re, (_, a, _b, c) => a + lit(v) + c); applied.push(k) } else skipped.push(k)
  }
  const head = note && applied.length ? `// ${note}\n` : ''
  return { code: code.slice(0, start) + head + block + code.slice(end), applied, skipped }
}
