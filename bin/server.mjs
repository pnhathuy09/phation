#!/usr/bin/env node
// Phation MCP server (stdio). Tools: list_motions, search_motions, get_motion, add_motion, get_standard, install_standard, audit_motion, animate_ui.
// Also exposes the standard as a resource (phation://standard) and a prompt (motion_review).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ENTRIES, CATEGORIES, search, get, summary, suggest, add, STANDARD, CORE, STANDARD_VERSION, standardSection, install, TOOLS, getCode, motionBlock, requirePro } from '../lib.mjs'

const server = new McpServer(
  { name: 'phation', version: '0.1.1' },
  {
    instructions:
      'Phation: tested React + Motion interactions, a motion standard and a frame-by-frame audit. Work token-lean. ' +
      'For any motion task: search_motions → add_motion (writes the file to disk; never retype it) → edit only its MOTION object, copy and styles → audit_motion, fix blockers, re-run. ' +
      'A Studio link (…/m/<slug>?…) goes in add_motion `from`. get_motion returns the spec and MOTION values; pass code: true only if you must read the source. ' +
      'Free: list_motions, search_motions, get_motion (spec + MOTION values), get_standard, install_standard. Pro (license key via `npx phation login <key>` or PHATION_KEY): add_motion, get_motion code, audit_motion, animate_ui. If a Pro tool answers with the Pro message, tell the user once and continue with the free tools (use the spec values by hand). ' +
      'Rules: get_standard returns the ~600-token core; ask for one section ("springs", "recipes", "accessibility") when you need more, "all" only if asked. ' +
      'To animate the user\'s existing screens: animate_ui (plan) → confirm roles → animate_ui apply → audit_motion. Report the values you used and any rule you broke on purpose.',
  },
)
const text = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
// one line per entry: what the model needs to choose, nothing more
const line = e => `${e.slug} · ${e.name} · ${e.category}${(e.tags || []).length ? ' · ' + e.tags.join(', ') : ''}`
const fail = m => ({ content: [{ type: 'text', text: m }], isError: true })

server.registerTool('list_motions', {
  title: 'List motions',
  description: `Every entry as one line (slug · name · category · tags). Optional category: ${CATEGORIES.join(', ')}.`,
  inputSchema: { category: z.enum(CATEGORIES).optional() },
  annotations: { readOnlyHint: true },
}, async ({ category }) => text(ENTRIES.filter(e => !category || e.category === category).map(line).join('\n')))

server.registerTool('search_motions', {
  title: 'Search motions',
  description: 'Find entries by what the motion is for or how it should feel, e.g. "tactile quantity stepper", "calm bottom sheet".',
  inputSchema: { query: z.string().min(1).describe('What the motion is for or how it should feel'), category: z.enum(CATEGORIES).optional(), limit: z.number().int().min(1).max(20).optional() },
  annotations: { readOnlyHint: true },
}, async ({ query, category, limit }) => {
  const hits = search(query, { category, limit: limit ?? 4 })
  return hits.length ? text(hits.map(h => `${h.slug} · ${h.name} · ${h.category}\n  ${String(h.description).split(/(?<=\.)\s/)[0]}`).join('\n')) : text(`Nothing matched "${query}". Try list_motions, or describe the UI element (button, sheet, list, price, cursor).`)
})

server.registerTool('get_motion', {
  title: 'Get a motion',
  description: 'Spec (curves, springs, timings), its MOTION values, dependencies and media. The source is left out: add_motion writes it to disk. Pass code: true only to read it.',
  inputSchema: { slug: z.string().describe('Entry slug'), code: z.boolean().optional().describe('Include the full React source (~1–2k tokens)') },
  annotations: { readOnlyHint: true },
}, async ({ slug, code }) => {
  const e = get(slug)
  if (!e) return fail(`No entry "${slug}".${suggest(slug).length ? ' Did you mean: ' + suggest(slug).join(', ') + '?' : ''}`)
  const head = [`${e.slug} · ${e.name} · ${e.file}`, e.description, `spec: ${Object.entries(e.spec).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `deps: ${(e.dependencies || []).join(', ')}${(e.assets || []).length ? ` · media: ${e.assets.join(', ')}` : ''}`, '', motionBlock(e)].join('\n')
  if (!code) return text(`${head}\n\n(add_motion writes the file; pass code: true to read the source. Both are Pro.)`)
  try { return text(`${head}\n\n// ${e.file}\n${await getCode(e)}`) } catch (err) { return fail(`${head}\n\n${err.message}`) }
})

server.registerTool('add_motion', {
  title: 'Add a motion to the project',
  description: 'Write an entry\'s file (and its media) into the project, so you never retype it. Will not overwrite unless force. A Studio link (…/m/<slug>?…) in `from` writes its tuned values into MOTION.',
  inputSchema: {
    slug: z.string(),
    projectRoot: z.string().optional().describe('Project path (default: cwd)'),
    dir: z.string().optional().describe('default src/motion'),
    publicDir: z.string().optional().describe('default public'),
    force: z.boolean().optional(),
    from: z.string().optional().describe('Studio share link'),
  },
  annotations: { destructiveHint: false, idempotentHint: true },
}, async args => {
  try { return text(await add(args.slug, args)) } catch (e) { return fail(e.message) }
})

server.registerTool('get_standard', {
  title: 'Get the Phation Standard',
  description: 'The motion rules. No section: the ~600-token core (tokens, never-list, reduced motion, workflow). A section ("springs", "recipes", "accessibility", "code") for detail; "all" for everything.',
  inputSchema: { section: z.string().optional().describe('e.g. "springs", "durations", "recipes", "accessibility", "code", "all"') },
  annotations: { readOnlyHint: true },
}, async ({ section }) => {
  const s = standardSection(section)
  return s ? text(s) : fail(`No section "${section}". Try: principles, tokens, curves, springs, durations, stagger, recipes, never, ui, accessibility, code, workflow.`)
})

server.registerTool('install_standard', {
  title: 'Install the standard into the project',
  description: 'Write the standard as project rules for one tool (~600-token core) plus .phation/STANDARD.md (read on demand). AGENTS.md and CLAUDE.md are merged, never replaced.',
  inputSchema: {
    tool: z.enum([...Object.keys(TOOLS).filter(k => !TOOLS[k].hidden), 'all']),
    projectRoot: z.string().optional().describe('Project path (default: cwd)'),
    force: z.boolean().optional(),
  },
  annotations: { destructiveHint: false, idempotentHint: true },
}, async args => { try { return text(install(args.tool, args)) } catch (e) { return fail(e.message) } })

server.registerTool('audit_motion', {
  title: 'Audit the motion of a page',
  description: 'Play a page in headless Chrome with the given actions, trace every element per frame and score the motion (PASS ≥ 85, no blockers). Returns each issue with time, element and the fix. 15–40 s; the page must be running.',
  inputSchema: {
    url: z.string().url(),
    actions: z.array(z.string()).optional().describe('click:<sel> hover:<sel> focus:<sel> scroll:<px> drag:<sel>:dx,dy hold:<sel>:ms key:<Key> type:<sel>:text wait:<ms>'),
    root: z.string().optional().describe('Selector to trace (default body)'),
    mobile: z.boolean().optional(),
    dark: z.boolean().optional(),
    reduced: z.boolean().optional().describe('Check reduced motion (default true)'),
    json: z.boolean().optional().describe('Add raw JSON'),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async args => {
  try {
    await requirePro()
    const { audit, formatReport } = await import('../audit.mjs')
    const r = await audit(args.url, args)
    if (r.status === 'ERROR') return fail(formatReport(r))
    return { content: [{ type: 'text', text: formatReport(r) }, ...(args.json ? [{ type: 'text', text: JSON.stringify(r) }] : [])] }
  } catch (e) { return fail(e.message) }
})

server.registerTool('animate_ui', {
  title: 'Animate the user\'s own UI',
  description: 'Read a .jsx/.tsx file or folder, name each part (button, card, sheet, modal, tabs, toggle, list, number…) and map it to a Phation recipe under one Feel. ' +
    'Default: plan only (~15 tokens a part). apply: true writes <file>.animated.tsx (write: true edits in place), adds one MOTION object and data-phation hooks, and returns only the changed lines; then run audit_motion with the listed actions. ' +
    'Parts marked "⚠ check" are guesses: confirm or fix them with roles: { "<line>": "<role>" }.',
  inputSchema: {
    path: z.string().describe('File or folder, relative to projectRoot'),
    feel: z.enum(['calm', 'fluid', 'snappy', 'playful', 'heavy', 'mechanical']).optional().describe('One Feel for the screen (default fluid)'),
    only: z.array(z.string()).optional().describe('Limit to these recipe ids, e.g. ["press", "sheet-open"]'),
    roles: z.record(z.string(), z.string()).optional().describe('Fix detected roles: { "<line>": "button" }'),
    apply: z.boolean().optional(),
    write: z.boolean().optional().describe('Edit the file in place instead of writing <file>.animated.tsx'),
    projectRoot: z.string().optional(),
  },
  annotations: { destructiveHint: false },
}, async args => {
  try { await requirePro(); const { animate } = await import('../animate/index.mjs'); return text(animate(args.path, args).text) } catch (e) { return fail(e.message) }
})

server.registerResource('standard', 'phation://standard', { title: 'Phation Standard', description: 'Rules for product UI motion by Pham Huy', mimeType: 'text/markdown' },
  async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: STANDARD }] }))

server.registerPrompt('motion_review', {
  title: 'Review motion against the Phation Standard',
  description: 'Audit the motion in a file or component and propose fixes with exact values.',
  argsSchema: { target: z.string().describe('File, component or screen to review') },
}, ({ target }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
  `Review every animation and transition in ${target} against the Phation Standard below. For each one list: what moves, its current curve/spring and duration, ` +
  `which rules it breaks, and the fix with exact values from the tokens. Then apply the fixes. Call get_standard with a section if you need more detail.\n\n${CORE}` } }] }))

await server.connect(new StdioServerTransport())
