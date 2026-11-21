// Phation Animate — surface A (ANIMATE_SPEC.md §04): plan and apply recipes on a user's own JSX/TSX.
//   animate(path, { feel, only, roles, apply, write }) → { text, files[], plan[] }
// plan:  token-lean list (≈ 15 tokens a part) of role → recipe, with confidence and "⚠ check" under 0.6.
// apply: edits the file in place by offsets (never re-prints it): motion tags, one MOTION object, data-phation hooks for
//        audit_motion. Writes <name>.animated.<ext> unless write: true. Returns the changed lines only.
import fs from 'fs'
import path from 'path'
import { detect, jsxName } from './detect.mjs'
import { RECIPES, recipesFor, resolve, DEFAULT_FEEL } from './core/recipes/index.js'
import { FEELS } from './core/feels.js'

const EXT = /\.(jsx|tsx)$/
const camel = id => id.replace(/-(\w)/g, (_, c) => c.toUpperCase())
const feelName = id => FEELS.find(f => f.id === id)?.name || id
// what each recipe can do automatically in code; the rest is planned and pointed at a library entry
const AUTO = new Set(['press', 'hover-lift', 'sheet-open', 'modal-open', 'accordion-open', 'list-enter', 'number-roll', 'toggle-knob', 'tab-pill'])

/** Pick the recipe for a part: the first recipe for its role, filtered by `only`. */
function pick(part, only) {
  const list = recipesFor(part.role).filter(r => !only?.length || only.includes(r.id))
  return list[0] || null
}

function files(target) {
  const st = fs.statSync(target)
  if (st.isFile()) return [target]
  const out = []
  const visit = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name.startsWith('.') || f.name === 'node_modules' || f.name.includes('.animated.')) continue
    const p = path.join(d, f.name)
    if (f.isDirectory()) visit(p); else if (EXT.test(f.name)) out.push(p)
  } }
  visit(target)
  return out
}

/** Plan one file: parts with their recipe and resolved values. `roles` = { "<line>": "<role>" } overrides. */
export function planFile(file, { feel = DEFAULT_FEEL, only, roles } = {}) {
  const source = fs.readFileSync(file, 'utf8')
  const d = detect(source, { file })
  const items = []
  for (const p of d.parts) {
    const forced = roles?.[String(p.line)] || roles?.[p.name]
    if (forced) { p.role = forced; p.confidence = 1; p.signal = 'you' }
    const rc = pick(p, only)
    if (!rc) continue
    // a number shown by a component (<Price amount={…}/>) has no expression here to roll: point at its file instead
    items.push({ ...p, recipe: rc, values: resolve(rc, feel), auto: AUTO.has(rc.id) && !(rc.id === 'number-roll' && p.kind !== 'expr') })
  }
  // one recipe per element: keep the strongest; a list item can also take hover-lift (different trigger)
  const seen = new Map(), keep = []
  for (const it of items.sort((a, b) => b.confidence - a.confidence)) {
    const k = `${it.el.start}:${it.recipe.trigger}`
    if (seen.has(k)) continue
    seen.set(k, it); keep.push(it)
  }
  keep.sort((a, b) => a.line - b.line)
  keep.forEach((it, i) => { it.n = i + 1 })
  return { file, source, detected: d, items: keep, feel }
}

// one short line a part: "5 L126 <DeleteItemButton> icon-button .5 → press ⚠" (⚠ = a guess: confirm with roles)
function planLine(it) {
  const v = it.values, extra = v.staggerMs ? ` ${v.staggerMs}ms` : ''
  const warn = it.confidence < 0.6 ? ' ⚠' : ''
  const manual = it.auto ? '' : it.recipe.entry ? ` · manual: add_motion ${it.recipe.entry}` : ' · manual'
  const label = it.kind === 'expr' ? `{} in <${it.name}>` : `<${it.name}>`
  return `${it.n} L${it.line} ${label} ${it.role} ${String(it.confidence.toFixed(1)).replace(/^0/, '')} → ${it.recipe.id}${extra}${manual}${warn}`
}

// ---------- apply ----------
const lit = v => typeof v === 'string' ? `'${v}'` : String(v)
const obj = o => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : typeof v === 'object' ? obj(v) : lit(v)}`).join(', ')} }`
const spring = s => ({ type: 'spring', stiffness: s.stiffness, damping: s.damping, mass: s.mass })

function motionEntry(rc, v) {
  const e = {}
  const st = rc.states || rc.content
  if (st) { e.from = { ...st.from }; e.to = { ...st.to } }
  if (rc.id === 'toggle-knob') { e.to = { x: 20 }; e.travel = 'track − knob − 2 × inset' }
  e.spring = spring(v.spring)
  if (v.exit) e.exit = v.exit.durationMs ? { durationMs: v.exit.durationMs, ease: v.exit.ease } : { spring: spring(v.exit.spring) }
  if (v.staggerMs) { e.staggerMs = v.staggerMs; e.maxItems = v.staggerMaxItems }
  return e
}

export function applyPlan(plan) {
  const { source, detected, items } = plan
  const ast = detected.ast, edits = [], notes = [], done = []
  const M = /\bexport\s+const\s+MOTION\b|\bconst\s+MOTION\b/.test(source) ? 'PHATION_MOTION' : 'MOTION'
  const creates = new Map() // component name → Motion alias
  const used = new Map() // recipe id → entry
  const edit = (start, end, text) => edits.push({ start, end, text })
  const tagged = new Set()

  const motionName = name => {
    if (/^[a-z]/.test(name) && !name.includes('.')) return `motion.${name}`
    const alias = 'Motion' + name.replace(/\./g, '')
    creates.set(name, alias)
    return alias
  }
  const retag = el => {
    if (tagged.has(el)) return
    tagged.add(el)
    const name = jsxName(el.openingElement.name), to = motionName(name)
    edit(el.openingElement.name.start, el.openingElement.name.end, to)
    if (el.closingElement) edit(el.closingElement.name.start, el.closingElement.name.end, to)
  }
  const has = (el, n) => el.openingElement.attributes.some(a => a.type === 'JSXAttribute' && a.name?.name === n)
  // props are collected per element and written once, so two recipes on one element never repeat an attribute
  const pending = new Map() // el → { hooks: [], props: [] }
  const props = (el, text, id) => { const p = pending.get(el) || { hooks: [], props: [] }; p.props.push(text); if (id) p.hooks.push(id); pending.set(el, p) }

  for (const it of items) {
    const rc = it.recipe, key = camel(rc.id), ref = `${M}.${key}`
    if (!it.auto) { notes.push(`${it.n} ${rc.id}: not applied automatically${rc.entry ? `. add_motion ${rc.entry} for the full pattern` : ''}`); continue }
    const el = it.el
    const clash = ['whileTap', 'whileHover', 'initial', 'animate', 'layoutId'].find(p => has(el, p))
    if (it.kind === 'element' && clash) { notes.push(`${it.n} ${rc.id}: <${it.name}> already has ${clash}; left as is`); continue }
    const hook = '' // data-phation is written once per element below
    // gestures carry their own spring inside the target, so they never fight an entrance transition on the same element
    if (rc.id === 'press') { retag(el); props(el, `whileTap={{ ...${ref}.to, transition: ${ref}.spring }}`, rc.id) }
    else if (rc.id === 'hover-lift') { retag(el); props(el, `whileHover={{ ...${ref}.to, transition: ${ref}.spring }}`, rc.id) }
    else if (rc.id === 'sheet-open' || rc.id === 'modal-open') {
      retag(el)
      props(el, `initial={${ref}.from} animate={${ref}.to} exit={{ ...${ref}.from, transition: { duration: ${ref}.exit.durationMs / 1000, ease: ${ref}.exit.ease } }} transition={${ref}.spring}`, rc.id)
      notes.push(`${it.n} ${rc.id}: the exit plays only inside <AnimatePresence> (Radix: add forceMount to the content)`)
    } else if (rc.id === 'accordion-open') { retag(el); props(el, `initial={${ref}.from} animate={${ref}.to} transition={${ref}.spring}`, rc.id) }
    else if (rc.id === 'list-enter') {
      const fn = el.__phationMap
      let idx = fn?.params[1]?.type === 'Identifier' ? fn.params[1].name : null
      if (!idx && fn?.params.length === 1) {
        idx = 'phationI'
        const p = fn.params[0], wrapped = fn.start < p.start && source.slice(fn.start, p.start).includes('(')
        if (wrapped) edit(p.end, p.end, ', phationI'); else edit(p.start, p.end, `(${source.slice(p.start, p.end)}, phationI)`)
      }
      retag(el)
      props(el, idx
        ? `initial={${ref}.from} animate={${ref}.to} transition={{ ...${ref}.spring, delay: Math.min(${idx}, ${ref}.maxItems - 1) * ${ref}.staggerMs / 1000 }}`
        : `initial={${ref}.from} animate={${ref}.to} transition={${ref}.spring}`, rc.id)
    } else if (rc.id === 'number-roll') {
      const ex = it.expr, code = source.slice(ex.expression.start, ex.expression.end)
      edit(ex.start, ex.end, `<motion.span key={String(${code})} data-phation="number-roll" initial={${ref}.from} animate={${ref}.to} transition={${ref}.spring} style={{ display: 'inline-block' }}>{${code}}</motion.span>`)
      notes.push(`${it.n} number-roll: the whole value rolls in; add_motion digit-roll rolls each digit`)
    } else if (rc.id === 'toggle-knob') {
      const knob = el.children.find(c => c.type === 'JSXElement')
      const state = el.openingElement.attributes.find(a => a.type === 'JSXAttribute' && ['checked', 'aria-checked'].includes(a.name?.name) && a.value?.type === 'JSXExpressionContainer')
      if (!knob || !state) { notes.push(`${it.n} toggle-knob: no knob child with a checked state here; animate the thumb inside the switch component (add_motion day-night)`); continue }
      const cond = source.slice(state.value.expression.start, state.value.expression.end)
      retag(knob); props(knob, `initial={false} animate={{ x: ${cond} ? ${ref}.to.x : 0 }} transition={${ref}.spring}`, rc.id)
      notes.push(`${it.n} toggle-knob: set ${M}.toggleKnob.to.x to the real travel (track − knob − 2 × inset)`)
    } else if (rc.id === 'tab-pill') {
      let pill = null
      const visit = n => { if (!n || pill || typeof n !== 'object') return
        if (n.type === 'LogicalExpression' && n.operator === '&&' && n.right?.type === 'JSXElement') { pill = n.right; return }
        if (n.type === 'ConditionalExpression' && n.consequent?.type === 'JSXElement' && n.alternate?.type !== 'JSXElement') { pill = n.consequent; return }
        for (const k in n) if (k !== 'loc' && !k.startsWith('__') && n[k] && typeof n[k] === 'object') Array.isArray(n[k]) ? n[k].forEach(visit) : visit(n[k]) }
      visit(el)
      if (!pill) { notes.push(`${it.n} tab-pill: no active-tab indicator found; render one inside the active tab and give it layoutId (add_motion model-picker)`); continue }
      retag(pill); props(pill, `layoutId="phation-tab-pill" transition={${ref}.spring}`, rc.id)
    }
    used.set(rc.id, motionEntry(rc, it.values))
    done.push(it.n)
  }
  // reduced motion (Standard §6): wrap each touched component's returned JSX once in <MotionConfig reducedMotion="user">,
  // which drops transform and layout motion for users who ask for less and keeps opacity fades
  const roots = new Set()
  const visitRet = n => { if (!n || typeof n !== 'object') return
    let arg = n.type === 'ReturnStatement' ? n.argument : n.type === 'ArrowFunctionExpression' && n.body?.type !== 'BlockStatement' ? n.body : null
    while (arg?.type === 'ParenthesizedExpression') arg = arg.expression
    if (arg && (arg.type === 'JSXElement' || arg.type === 'JSXFragment') && [...pending.keys(), ...items.filter(i => i.kind === 'expr').map(i => i.expr)].some(e => e.start >= arg.start && e.end <= arg.end)) {
      if (![...roots].some(r => r.start <= arg.start && r.end >= arg.end)) { for (const r of [...roots]) if (arg.start <= r.start && arg.end >= r.end) roots.delete(r); roots.add(arg) }
    }
    for (const k in n) if (k !== 'loc' && !k.startsWith('__') && n[k] && typeof n[k] === 'object') Array.isArray(n[k]) ? n[k].forEach(visitRet) : visitRet(n[k]) }
  visitRet(ast.program)
  for (const r of roots) { edit(r.start, r.start, '<MotionConfig reducedMotion="user">'); edit(r.end, r.end, '</MotionConfig>') }
  const needConfig = roots.size > 0

  for (const [el, p] of pending) {
    // an element with an entrance transition and a gesture keeps one transition prop (the entrance); gestures carry theirs
    const text = (p.hooks.length ? `data-phation="${p.hooks.join(' ')}" ` : '') + p.props.join(' ')
    edit(el.openingElement.name.end, el.openingElement.name.end, ' ' + text)
  }
  if (!done.length) return { source, changed: false, notes, done }

  // imports + MOTION object (after the last import; after directives when there are none)
  const body = ast.program.body
  const imp = body.filter(s => s.type === 'ImportDeclaration')
  const mImp = imp.find(s => s.source.value === 'motion/react' || s.source.value === 'framer-motion')
  const head = []
  const want = ['motion', ...(needConfig ? ['MotionConfig'] : [])]
  if (!mImp) head.push(`import { ${want.join(', ')} } from 'motion/react'`)
  else {
    const missing = want.filter(n => !mImp.specifiers.some(s => s.local.name === n))
    const first = mImp.specifiers.find(s => s.type === 'ImportSpecifier')
    if (missing.length && first) edit(first.start, first.start, missing.join(', ') + ', ')
    else if (missing.length) head.push(`import { ${missing.join(', ')} } from '${mImp.source.value}'`)
  }
  const at = imp.length ? imp[imp.length - 1].end : (ast.program.directives?.length ? ast.program.directives.at(-1).end : 0)
  const motionObj = [`// Phation Animate · Feel: ${feelName(plan.feel)} · springs k/c/m, durations in ms. Reduced motion: <MotionConfig reducedMotion="user"> keeps fades, drops movement.`,
    `export const ${M} = {`, ...[...used].map(([id, e]) => `  ${camel(id)}: ${obj(e)},`), `}`]
  const createLines = [...creates].map(([name, alias]) => `const ${alias} = motion.create(${name})`)
  const block = (head.length ? '\n' + head.join('\n') : '') + '\n\n' + motionObj.join('\n') + (createLines.length ? '\n' + createLines.join('\n') : '')
  edit(at, at, at === 0 ? block.trimStart() + '\n' : block)
  if (creates.size) notes.push(`motion.create(${[...creates.keys()].join(', ')}): these components must forward their ref to the DOM element (shadcn/Radix do)`)

  let out = source
  for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return { source: out, changed: true, notes, done }
}

/** Changed lines only, as a compact unified-style list. */
export function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n'), n = A.length, m = B.length
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out = []
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { i++; j++ }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { out.push(`+${String(j + 1).padStart(4)} ${B[j]}`); j++ }
    else { out.push(`-${String(i + 1).padStart(4)} ${A[i]}`); i++ }
  }
  return out.join('\n')
}

// audit actions that trigger each applied recipe (audit_motion `actions`)
const ACTION = {
  press: '"hold:[data-phation~=press]:300"', 'hover-lift': '"hover:[data-phation~=hover-lift]"', 'tab-pill': 'click on another tab',
  'toggle-knob': 'click the switch', 'accordion-open': 'click its trigger', 'sheet-open': 'click its trigger', 'modal-open': 'click its trigger',
  'list-enter': 'page load (no action)', 'number-roll': 'change the value',
}

/** Plan (default) or apply across a file or folder. */
export function animate(target, { feel = DEFAULT_FEEL, only, roles, apply = false, write = false, projectRoot = process.cwd() } = {}) {
  const abs = path.resolve(projectRoot, target)
  if (!fs.existsSync(abs)) throw new Error(`No file or folder at ${target}`)
  if (!FEELS.some(f => f.id === feel)) throw new Error(`Unknown feel "${feel}". Use one of: ${FEELS.map(f => f.id).join(', ')}`)
  const list = files(abs)
  if (!list.length) throw new Error(`No .jsx/.tsx files in ${target}`)
  const lines = [], results = []
  for (const f of list) {
    let plan
    try { plan = planFile(f, { feel, only, roles }) } catch (e) { lines.push(`${path.relative(projectRoot, f)} · parse error: ${e.message}`); continue }
    if (!plan.items.length) continue
    const rel = path.relative(projectRoot, f)
    lines.push(`${rel} · Feel: ${feelName(feel)}`, ...plan.items.map(planLine))
    if (apply) {
      const r = applyPlan(plan)
      if (r.changed) {
        const out = write ? f : f.replace(EXT, '.animated.$1')
        fs.writeFileSync(out, r.source)
        lines.push(`→ wrote ${path.relative(projectRoot, out)} (${r.done.length} part${r.done.length > 1 ? 's' : ''})`, lineDiff(plan.source, r.source))
        const acts = [...new Set(plan.items.filter(it => r.done.includes(it.n)).map(it => `${it.recipe.id}: ${ACTION[it.recipe.id]}`))]
        lines.push(`check: audit_motion({ url, actions }) · ${acts.join(' · ')}`)
      }
      lines.push(...r.notes.map(n => `  · ${n}`))
      results.push({ file: rel, ...r, source: undefined })
    }
    lines.push('')
    results.push({ file: rel, parts: plan.items.map(it => ({ n: it.n, line: it.line, name: it.name, role: it.role, confidence: it.confidence, signal: it.signal, recipe: it.recipe.id, auto: it.auto })) })
  }
  if (!lines.length) return { text: `Nothing to animate in ${target}: no buttons, cards, sheets, dialogs, tabs, toggles, lists or numbers found.`, results }
  if (!apply) lines.push(`⚠ = guess, fix with roles: { "<line>": "<role>" } · then apply: true`)
  return { text: lines.join('\n').trim(), results }
}
