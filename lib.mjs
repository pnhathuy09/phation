// Phation core: shared by the MCP server (bin/server.mjs) and the CLI (bin/cli.mjs).
// Data comes from data/entries.json, exported from the library by scripts/export-entries.mjs.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { decodeValues, applyValues, slugOfLink } from './share.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// The published package carries data/entries.json: metadata, specs and MOTION values, no source. A local checkout of the
// library also has data/entries.full.json (with source); PHATION_REMOTE=1 ignores it to test the published behaviour.
const FULL = path.join(HERE, 'data/entries.full.json')
const LOCAL = fs.existsSync(FULL) && !process.env.PHATION_REMOTE
const DATA = JSON.parse(fs.readFileSync(LOCAL ? FULL : path.join(HERE, 'data/entries.json'), 'utf8'))
export const ENTRIES = DATA.entries
// Free entries ship their source (MIT) in the package and the public repo; `add` works for them without a key.
export const FREE = ENTRIES.filter(e => e.free).map(e => e.slug)
export const CATEGORIES = DATA.categories
export const SITE = 'https://phation.app'
const API = process.env.PHATION_API || SITE

// ---------------- Pro license ----------------
// Free (CLI): list, search, show (spec + MOTION values), the standard, init, add for free entries. Pro: the MCP server, add/source for the rest, audit, animate.
// The key comes from PHATION_KEY or ~/.config/phation/license.json (written by `phation login <key>`).
const CONF = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'phation', 'license.json')
const readConf = () => { try { return JSON.parse(fs.readFileSync(CONF, 'utf8')) } catch { return null } }
export const licenseKey = () => process.env.PHATION_KEY || readConf()?.key || null
export const PRO_HINT = 'This is part of Phation Pro. Get a license at https://phation.app/pricing, then run: npx phation login <license-key> (or set PHATION_KEY).'
async function api(pathname, key = licenseKey()) {
  if (!key) throw new Error(PRO_HINT)
  let r
  try { r = await fetch(API + pathname, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'phation-cli' } }) } catch { throw new Error(`Could not reach ${API}. Check your connection.`) }
  const d = await r.json().catch(() => ({}))
  if (r.status === 401) throw new Error(`Your license key was not accepted (wrong, refunded or expired). ${PRO_HINT}`)
  if (!r.ok) throw new Error(d.message || `${API} answered ${r.status}.`)
  return d
}
/** Check a key with phation.app and remember it. */
export async function login(key) {
  const d = await api('/api/source?check=1', String(key || '').trim())
  fs.mkdirSync(path.dirname(CONF), { recursive: true })
  fs.writeFileSync(CONF, JSON.stringify({ key: String(key).trim(), email: d.email, kind: d.kind, until: d.until, checked: Date.now() }, null, 2), { mode: 0o600 })
  return { email: d.email, kind: d.kind, until: d.until, file: CONF }
}
export function logout() { try { fs.rmSync(CONF) } catch {} return CONF }
/** Pro gate for local tools (audit, animate): a key checked online within 7 days, re-checked when older. */
export async function requirePro() {
  if (LOCAL) return
  const c = readConf(), key = licenseKey()
  if (!key) throw new Error(PRO_HINT)
  if (c?.key === key && Date.now() - (c.checked || 0) < 7 * 864e5) return
  const d = await api('/api/source?check=1', key)
  if (c?.key === key) fs.writeFileSync(CONF, JSON.stringify({ ...c, kind: d.kind, until: d.until, checked: Date.now() }, null, 2), { mode: 0o600 })
}
/** An entry's React source: local in a library checkout, otherwise from phation.app with the Pro key. */
export async function getCode(e) {
  if (e.code) return e.code
  return (await api(`/api/source?slug=${encodeURIComponent(e.slug)}`)).code
}
export const motionBlock = e => e.motion ?? ((e.code || '').match(/^export const MOTION = \{[\s\S]*?\n\}/m) || [''])[0]

// Words people use for a feeling, mapped to the words entries use for the mechanism.
const FEEL = {
  tactile: ['press', 'spring', 'tap', 'scale', 'button', 'hold'], physical: ['spring', 'drag', 'flip', 'release'],
  snappy: ['press', 'spring', 'snap'], calm: ['settle', 'ease', 'fade', 'sheet', 'no overshoot'], smooth: ['ease', 'settle', 'shared'],
  playful: ['bounce', 'overshoot', 'pop', 'spring'], bouncy: ['bounce', 'overshoot', 'spring'], premium: ['wipe', 'settle', 'light sweep', 'tracking'],
  alive: ['roll', 'digit', 'breath', 'pulse'], stepper: ['quantity', 'digit'], quantity: ['digit', 'total'], tab: ['chip', 'ring', 'shared', 'pill'], price: ['digit', 'roll', 'total', 'price'], number: ['digit', 'roll', 'count'], counter: ['digit', 'roll', 'count'],
  checkout: ['buy', 'payment', 'sheet', 'price'], cart: ['quantity', 'digit', 'buy'], loading: ['spinner', 'morph', 'progress'], progress: ['morph', 'hold', 'fill'],
  success: ['check', 'confirm', 'tick'], modal: ['sheet', 'scrim', 'expand'], drawer: ['sheet'], list: ['stagger', 'rows', 'list'], grid: ['stagger', 'grid'],
  headline: ['word', 'mask', 'text', 'rise'], heading: ['word', 'mask', 'text'], title: ['word', 'mask', 'roll'], logo: ['wordmark', 'letters'],
  hover: ['hover', 'cursor', 'magnetic'], cursor: ['cursor', 'follow'], swipe: ['drag', 'swipe', 'slider'], slider: ['slider', 'drag', 'snap'],
  tabs: ['tab', 'chip', 'pill', 'shared'], toggle: ['switch', 'toggle', 'chip'], theme: ['day', 'night', 'theme'], dark: ['night', 'theme'],
  onboarding: ['stagger', 'word', 'callout'], tooltip: ['hotspot', 'tooltip', 'callout'], chart: ['donut', 'draw', 'count'], voice: ['orb', 'listen', 'assistant'],
  scroll: ['scroll', 'reveal'], reveal: ['reveal', 'mask', 'wipe', 'rise'], status: ['tag', 'flip', 'status', 'wave'], select: ['checkbox', 'chip', 'ring'],
}
const norm = s => String(s).toLowerCase()
const STOP = new Set('a an the it its this that these to for of and or with my our your their when on in into at as be is are was should could would make made feel feels feeling like more less some very really want need add use using please'.split(' '))
const words = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w))

export function search(query = '', { category, limit = 8 } = {}) {
  const q = words(query), expanded = new Set(q)
  for (const w of q) for (const x of FEEL[w] || FEEL[w.replace(/s$/, '')] || []) expanded.add(x)
  const scored = ENTRIES.filter(e => !category || norm(e.category) === norm(category)).map(e => {
    const fields = [[e.name, 4], [(e.tags || []).join(' '), 3], [e.category, 2], [e.hint || '', 1], [e.description, 1.5], [Object.entries(e.spec).flat().join(' '), 1], [e.from, 0.5]]
    let score = 0
    for (const t of expanded) {
      const direct = q.includes(t) ? 1 : 0.35
      for (const [f, w] of fields) if (norm(f).includes(t)) score += w * direct
    }
    return { e, score }
  })
  const hits = q.length ? scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score) : scored
  return hits.slice(0, limit).map(({ e, score }) => ({ ...summary(e), score: Math.round(score * 10) / 10 }))
}

export const summary = e => ({ slug: e.slug, name: e.name, category: e.category, tags: e.tags || [], description: e.description, interaction: e.hint, url: `${SITE}/m/${e.slug}` })
export const get = slug => ENTRIES.find(e => e.slug === slug) || null

export function suggest(slug) {
  const s = norm(slug)
  return ENTRIES.map(e => e.slug).filter(x => x.includes(s) || s.includes(x) || x.split('-').some(p => s.includes(p))).slice(0, 5)
}

/**
 * Copies an entry into a project: the component file plus the media it references.
 * @param {string} slug
 * `from` = a Studio share link (or its query): its tuned values are written into the file's MOTION object.
 * @param {{ projectRoot?: string, dir?: string, publicDir?: string, force?: boolean, from?: string }} opts
 */
export async function add(slug, { projectRoot = process.cwd(), dir = 'src/motion', publicDir = 'public', force = false, from } = {}) {
  if (!slug && from) slug = slugOfLink(from)
  const linked = from ? slugOfLink(from) : null
  if (linked && slug && linked !== slug) throw new Error(`The link is for "${linked}", not "${slug}".`)
  const e = get(slug)
  if (!e) throw new Error(`No entry "${slug}".${suggest(slug).length ? ' Did you mean: ' + suggest(slug).join(', ') + '?' : ''}`)
  const root = path.resolve(projectRoot)
  if (!fs.existsSync(root)) throw new Error(`Project folder not found: ${root}`)
  const target = path.join(root, dir, e.file)
  if (fs.existsSync(target) && !force) throw new Error(`${path.relative(root, target)} already exists. Pass force to overwrite it.`)
  let code = await getCode(e), tuned = null
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (from) {
    const vals = decodeValues(from)
    if (!Object.keys(vals).length) throw new Error('The link has no tuned values. Change something in the Studio, then press Share.')
    const link = from.includes('://') ? from.trim() : `${SITE}/m/${e.slug}?${from.replace(/^[^?]*\?/, '')}`
    const r = applyValues(code, vals, `tuned in Phation Studio: ${link}`)
    code = r.code; tuned = { applied: r.applied, skipped: r.skipped }
  }
  fs.writeFileSync(target, code)
  const written = [path.relative(root, target)]
  for (const a of e.assets) {
    const src = path.join(HERE, 'data/public', a), dst = path.join(root, publicDir, a)
    if (fs.existsSync(dst) && !force) continue
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    if (fs.existsSync(src)) fs.copyFileSync(src, dst)
    else { // the published package has no media: fetch it from the site (they are public demo images)
      const r = await fetch(SITE + a).catch(() => null)
      if (!r?.ok) continue
      fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()))
    }
    written.push(path.relative(root, dst))
  }
  // which runtime packages the project still needs
  let have = {}
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); have = { ...pkg.dependencies, ...pkg.devDependencies } } catch {}
  const pkgOf = d => d.startsWith('@') ? d.split('/').slice(0, 2).join('/') : d.split('/')[0]
  const need = [...new Set(e.dependencies.map(pkgOf))].filter(d => !have[d])
  const name = e.file.replace(/\.jsx?$/, '')
  return {
    entry: e.slug, files: written, missingPackages: need, tuned,
    install: need.length ? `npm install ${need.join(' ')}` : null,
    usage: `import ${name} from './${path.posix.join(dir.replace(/^src\/?/, ''), name)}'\n\n<${name} />`,
    note: 'The demo plays its intro on mount. Its colours, type and copy are the source product\'s: adapt them to your design system and keep the motion values in the spec.',
    spec: e.spec,
  }
}

// ---------------- Phation Standard (rules for coding agents) ----------------
const STD_DIR = path.join(HERE, 'data/standard')
export const STANDARD = fs.existsSync(path.join(STD_DIR, 'STANDARD.md')) ? fs.readFileSync(path.join(STD_DIR, 'STANDARD.md'), 'utf8') : ''
export const CORE = fs.existsSync(path.join(STD_DIR, 'CORE.md')) ? fs.readFileSync(path.join(STD_DIR, 'CORE.md'), 'utf8') : STANDARD
export const STANDARD_VERSION = fs.existsSync(path.join(STD_DIR, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(STD_DIR, 'meta.json'), 'utf8')).version : '0'

/** One section by number or heading words ("2.2", "springs", "accessibility"); the short core when omitted, everything with "all". */
export function standardSection(q) {
  if (!q || String(q).toLowerCase().trim() === 'core') return CORE
  if (String(q).toLowerCase().trim() === 'all') return STANDARD
  const parts = STANDARD.split(/^(?=#{2,3} )/m), k = String(q).toLowerCase().trim()
  const hit = parts.find(p => { const h = p.split('\n')[0].toLowerCase(); return h.replace(/^#+\s*/, '').startsWith(k) || h.includes(k) })
  return hit ? hit.trim() : null
}

// where each tool reads project rules from
export const TOOLS = {
  claude: { file: '.claude/skills/phation/SKILL.md', src: 'claude/SKILL.md', label: 'Claude Code skill', also: ['claude-md', 'full'] },
  'claude-md': { file: 'CLAUDE.md', src: 'claude/CLAUDE.block.md', label: 'CLAUDE.md pointer (always loaded, so the skill is used every time)', merge: true, hidden: true },

  // the full standard, read by section only when needed (every rule file above carries just the ~600-token core)
  full: { file: '.phation/STANDARD.md', src: 'STANDARD.md', label: 'Full standard (read on demand)', hidden: true },
  cursor: { file: '.cursor/rules/phation.mdc', src: 'cursor/phation.mdc', label: 'Cursor rule', also: ['full'] },
  codex: { file: 'AGENTS.md', src: 'codex/AGENTS.block.md', label: 'AGENTS.md section (Codex and other AGENTS.md readers)', merge: true, also: ['full'] },
  windsurf: { file: '.windsurf/rules/phation.md', src: 'windsurf/phation.md', label: 'Windsurf rule', also: ['full'] },
  vscode: { file: '.github/instructions/phation.instructions.md', src: 'vscode/phation.instructions.md', label: 'VS Code / Copilot instructions', also: ['full'] },
}

/**
 * Writes the standard into a project for one tool (or 'all').
 * AGENTS.md is merged: only the block between the phation markers is replaced, the rest of the file is kept.
 */
export function install(tool = 'all', { projectRoot = process.cwd(), force = false } = {}) {
  const base = tool === 'all' ? Object.keys(TOOLS).filter(n => !TOOLS[n].hidden) : [tool]
  const names = [...new Set(base.flatMap(n => [n, ...[].concat(TOOLS[n]?.also || [])]))]
  const bad = names.filter(n => !TOOLS[n] || (TOOLS[n].hidden && !base.some(b => [].concat(TOOLS[b]?.also || []).includes(n)))); if (bad.length) throw new Error(`Unknown tool "${bad[0]}". Use one of: ${Object.keys(TOOLS).filter(k => !TOOLS[k].hidden).join(', ')}, all`)
  const root = path.resolve(projectRoot)
  if (!fs.existsSync(root)) throw new Error(`Project folder not found: ${root}`)
  const res = []
  for (const n of names) {
    const t = TOOLS[n], dst = path.join(root, t.file), txt = fs.readFileSync(path.join(STD_DIR, t.src), 'utf8')
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    if (t.merge) {
      const cur = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : ''
      const re = /<!-- phation:start[\s\S]*?<!-- phation:end -->\n?/
      const next = re.test(cur) ? cur.replace(re, txt) : (cur ? cur.replace(/\n*$/, '\n\n') : '# AGENTS.md\n\n') + txt
      const state = !cur ? 'created' : re.test(cur) ? (cur === next ? 'unchanged' : 'updated') : 'added section'
      if (cur !== next) fs.writeFileSync(dst, next)
      res.push({ tool: n, label: t.label, file: t.file, state })
    } else {
      const cur = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : null
      // overwrite only our own file (same name, starts with our header) unless forced
      if (cur !== null && cur !== txt && !force && !/Phation/.test(cur)) { res.push({ tool: n, label: t.label, file: t.file, state: 'skipped: file exists and is not ours (pass force)' }); continue }
      if (cur !== txt) fs.writeFileSync(dst, txt)
      res.push({ tool: n, label: t.label, file: t.file, state: cur === null ? 'created' : cur === txt ? 'unchanged' : 'updated' })
    }
  }
  return { version: STANDARD_VERSION, results: res }
}
