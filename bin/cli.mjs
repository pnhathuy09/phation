#!/usr/bin/env node
// Phation CLI, for projects without an AI agent.
//   phation list [category]
//   phation search <words…>
//   phation show <slug>
//   phation add <slug> [--from <studio link>] [--dir src/motion] [--public public] [--force]
//   phation init [claude|cursor|codex|windsurf|vscode|all] [--force]   install the Phation Standard for your agent
//   phation standard [section]                                       print the standard (or one section, e.g. springs)
//   phation audit <url> [--do click:#buy]… [--root main] [--mobile] [--dark] [--json] [--shots dir] [--no-reduced]
//   phation animate <file|folder> [--feel snappy] [--only press] [--role 12=button] [--apply] [--write]   animate your own UI
//   phation mcp                                                       start the MCP server (stdio)
//   phation login <license-key> | logout | whoami                     Pro: add, audit, animate (https://phation.app/pricing)
import { ENTRIES, CATEGORIES, search, get, suggest, add, summary, install, standardSection, TOOLS, login, logout, licenseKey, requirePro, motionBlock } from '../lib.mjs'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (n, d) => { const i = rest.indexOf(`--${n}`); return i < 0 ? d : rest[i + 1] }
const has = n => rest.includes(`--${n}`)
const args = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && !['--force', '--apply', '--write', '--json', '--mobile', '--dark', '--no-reduced'].includes(rest[i - 1])))
const row = e => `  ${e.slug.padEnd(26)} ${e.name}${e.interaction ? `  · ${e.interaction}` : ''}`

switch (cmd) {
  case 'list': {
    const c = args[0]
    if (c && !CATEGORIES.some(x => x.toLowerCase() === c.toLowerCase())) { console.error(`Unknown category. Use one of: ${CATEGORIES.join(', ')}`); process.exit(1) }
    for (const cat of CATEGORIES.filter(x => !c || x.toLowerCase() === c.toLowerCase())) {
      const list = ENTRIES.filter(e => e.category === cat); if (!list.length) continue
      console.log(`\n${cat}`); list.map(summary).forEach(e => console.log(row(e)))
    }
    break
  }
  case 'search': {
    const hits = search(args.join(' '))
    if (!hits.length) { console.log('Nothing matched. Try: phation list'); break }
    hits.forEach(e => console.log(row(e)))
    break
  }
  case 'show': {
    const e = get(args[0])
    if (!e) { console.error(`No entry "${args[0]}".${suggest(args[0] || '').length ? ' Did you mean: ' + suggest(args[0]).join(', ') + '?' : ''}`); process.exit(1) }
    console.log(`${e.name} · ${e.category}\n${e.description}\n`)
    for (const [k, v] of Object.entries(e.spec)) console.log(`  ${k.padEnd(16)} ${v}`)
    if (motionBlock(e)) console.log(`\n${motionBlock(e)}`)
    console.log(`\n  file  ${e.file} · needs ${e.dependencies.join(', ')}${e.assets.length ? ` · ${e.assets.length} media file(s)` : ''}`)
    console.log(`  add   npx phation add ${e.slug}  (Pro)`)
    break
  }
  case 'add': {
    try {
      const r = await add(args[0]?.startsWith('--') ? undefined : args[0], { dir: flag('dir', 'src/motion'), publicDir: flag('public', 'public'), force: has('force'), from: flag('from', undefined) })
      console.log(`Added ${r.entry}:`); r.files.forEach(f => console.log(`  + ${f}`))
      if (r.tuned) console.log(`\nStudio values applied: ${r.tuned.applied.join(', ') || 'none'}${r.tuned.skipped.length ? ` (not in this file: ${r.tuned.skipped.join(', ')})` : ''}`)
      if (r.install) console.log(`\nInstall: ${r.install}`)
      console.log(`\nUse it:\n${r.usage.split('\n').map(l => '  ' + l).join('\n')}`)
    } catch (e) { console.error(e.message); process.exit(1) }
    break
  }
  case 'init': {
    try {
      const r = install(args[0] || 'all', { force: has('force') })
      console.log(`Phation Standard v${r.version}`)
      r.results.forEach(x => console.log(`  ${x.state.startsWith('skipped') ? '!' : '+'} ${x.file.padEnd(48)} ${x.label} · ${x.state}`))
      console.log('\nYour agent now follows the standard when it writes motion. Ask it to "add motion to …" or "review the motion in …".')
    } catch (e) { console.error(e.message); process.exit(1) }
    break
  }
  case 'audit': {
    const url = rest.find(a => /^https?:\/\//.test(a))
    if (!url) { console.error('Usage: phation audit <url> [--do click:#buy] [--do hover:.card] [--root main] [--mobile] [--json] [--shots dir] [--no-reduced]\nActions: click:<sel> hover:<sel> focus:<sel> scroll:<px> drag:<sel>:dx,dy hold:<sel>:ms key:<Key> type:<sel>:text wait:<ms>'); process.exit(1) }
    const all = (n) => rest.flatMap((a, i) => a === `--${n}` && rest[i + 1] ? [rest[i + 1]] : [])
    try { await requirePro() } catch (e) { console.error(e.message); process.exit(1) }
    const { audit, formatReport } = await import('../audit.mjs')
    if (!has('json')) console.error(`Auditing ${url} … (three runs: timing, trace, reduced motion)`)
    const r = await audit(url, { actions: all('do'), root: flag('root', null), mobile: has('mobile'), dark: has('dark'), shots: flag('shots', null), reduced: !has('no-reduced') })
    console.log(has('json') ? JSON.stringify(r, null, 2) : formatReport(r))
    process.exit(r.status === 'ERROR' ? 1 : r.status === 'FAIL' ? 2 : 0)
  }
  case 'animate': { // phation animate <file|folder> [--feel snappy] [--only press,sheet-open] [--apply] [--write]
    if (!args[0]) { console.error('Usage: phation animate <file|folder> [--feel fluid|calm|snappy|playful|heavy|mechanical] [--only press,list-enter] [--role 12=button]… [--apply] [--write]'); process.exit(1) }
    try {
      await requirePro()
      const { animate } = await import('../animate/index.mjs')
      const roles = Object.fromEntries(rest.flatMap((a, i) => a === '--role' && rest[i + 1] ? [rest[i + 1].split('=')] : []))
      const only = flag('only', undefined)?.split(',')
      const r = animate(args[0], { feel: flag('feel', undefined), only, roles, apply: has('apply'), write: has('write') })
      console.log(r.text)
    } catch (e) { console.error(e.message); process.exit(1) }
    break
  }
  case 'standard': {
    const s = standardSection(args.join(' '))
    if (!s) { console.error(`No section "${args.join(' ')}". Try: principles, tokens, curves, springs, durations, stagger, recipes, never, ui, accessibility, code, workflow`); process.exit(1) }
    console.log(s)
    break
  }
  case 'login': {
    if (!args[0]) { console.error('Usage: phation login <license-key>   (the key is in your Polar receipt email)'); process.exit(1) }
    try { const r = await login(args[0]); console.log(`Signed in: ${r.email || 'Pro'} · ${r.kind}${r.until ? ` until ${r.until.slice(0, 10)}` : ''}\nSaved to ${r.file}`) } catch (e) { console.error(e.message); process.exit(1) }
    break
  }
  case 'logout': console.log(`Removed ${logout()}`); break
  case 'whoami': {
    if (!licenseKey()) { console.log('Free (no license). Pro: https://phation.app/pricing then phation login <key>'); break }
    try { const r = await login(licenseKey()); console.log(`Pro · ${r.email || ''} · ${r.kind}${r.until ? ` until ${r.until.slice(0, 10)}` : ''}`) } catch (e) { console.error(e.message); process.exit(1) }
    break
  }
  case 'mcp': { // `npx -y phation mcp` starts the MCP server over stdio
    await import('./server.mjs')
    break
  }
  default:
    console.log(`phation list [category] | search <words> | show <slug> | add <slug> [--from <studio link>] [--dir src/motion] [--public public] [--force]\n          init [${Object.keys(TOOLS).filter(k => !TOOLS[k].hidden).join('|')}|all] [--force] | standard [section]\n          audit <url> [--do click:#buy]… [--root sel] [--mobile] [--json]\n          animate <file|folder> [--feel fluid] [--only press] [--apply] [--write]\n          mcp   (start the MCP server) | login <license-key> | logout | whoami\n\nFree: list, search, show, standard, init. Pro: add, audit, animate.`)
    if (cmd && cmd !== 'help') process.exit(1)
}
