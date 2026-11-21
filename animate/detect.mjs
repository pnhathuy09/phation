// Phation Animate — detection for code (ANIMATE_SPEC.md §03). Parses JSX/TSX with @babel/parser (no regex on code) and
// returns the parts of a screen with a role, a confidence and the signal that decided it.
//
// Confidence = strongest signal: semantic 1.0 · library 0.9 · state 0.7 · name 0.5. Below 0.6 the plan says "check".
// Every part keeps the AST nodes apply.mjs needs to edit the file in place (start/end offsets, never re-printing).
import { parse } from '@babel/parser'
import { ROLES } from './core/recipes/index.js'

const LIB_SOURCE = /(^|\/)(components\/ui|ui)(\/|$)|@radix-ui|@headlessui|@mui|@chakra-ui|@nextui-org|@heroui|@ark-ui|@base-ui|vaul|react-aria/

// component names that libraries (shadcn/Radix/Headless/MUI/Chakra/vaul) use, by role
const LIB_NAMES = [
  ['modal', /^(Dialog|AlertDialog)\.?(Content|Panel)$|^(DialogContent|AlertDialogContent|DialogPanel|ModalContent|CommandDialog)$/],
  ['sheet', /^(Sheet|Drawer)\.?Content$|^(SheetContent|DrawerContent|BottomSheet)$/],
  ['toggle', /^(Switch|Switch\.Root|SwitchRoot|Toggle|Toggle\.Root|ToggleGroupItem|ToggleGroup\.Item)$/],
  ['tabs', /^(Tabs\.List|TabsList|TabList|Tab\.List)$/],
  ['accordion', /^(Accordion\.Content|AccordionContent|Collapsible\.Content|CollapsibleContent|Disclosure\.Panel|DisclosurePanel|AccordionDetails)$/],
  ['icon-button', /^IconButton$/],
  ['button', /Button$/],
  ['card', /^Card$/],
  ['nav-link', /^(NavigationMenu\.Link|NavigationMenuLink|NavLink)$/],
  ['input', /^(\w*Input|Textarea|SelectTrigger|Slider|Checkbox|RadioGroup)$/],
]
// weaker: names an author picked (layer names in Figma, component names here)
const NAME_HINTS = [
  ['sheet', /sheet|drawer|bottom.?bar/i],
  ['modal', /modal|dialog|popup|lightbox/i],
  ['toggle', /toggle|switch/i],
  ['tabs', /tabs|segmented|tab.?bar/i],
  ['accordion', /accordion|collapse|faq.?item|disclosure/i],
  ['number', /price|total|amount|counter|balance|subtotal/i],
  ['nav-link', /nav.?link|menu.?link/i],
  ['icon-button', /icon.?button|icon.?btn|(delete|remove|close|dismiss|edit\w*quantity|increment|decrement|plus|minus).*(button|btn)/i],
  ['button', /button|btn|cta/i],
  ['card', /card|tile/i],
]
const ICON_SOURCE = /lucide|heroicons|react-icons|@tabler\/icons|@radix-ui\/react-icons|phosphor|iconoir|iconsax|@mui\/icons/
const isIconLike = (k, imports) => { const n = jsxName(k.openingElement.name), r = n.split('.')[0]; return n === 'svg' || /Icon$|Avatar|Logo|^Icons\./.test(n) || ICON_SOURCE.test(imports[r] || '') || /sr-only/.test(attrStr(k, 'className') || '') }
const SUB_PART = /[a-z](Content|Header|Footer|Title|Description|Trigger|Close|Overlay|Portal|Provider|Root|Group|Item|Label|Icon|Wrapper|Container|Body|Action|Cancel|Thumb|Indicator|Viewport)$/
const LIB_ROOTS = /^(Sheet|Dialog|AlertDialog|Drawer|Tabs|Accordion|Collapsible|Popover|DropdownMenu|NavigationMenu|Tooltip|HoverCard)$/
const NUMBERISH = /(^|[^a-z])(price|total|subtotal|amount|count|qty|quantity|balance|score|cost|sum)([^a-z]|$)/i
const FORMAT_CALL = /^(toFixed|toLocaleString|formatPrice|formatCurrency|formatMoney|formatNumber|currency)$/ // not format(): date-fns
const UNIT_TEXT = /^\s*(°[CF]?|%|\$|€|£|¥|₫|k|K|ms|s|kg|km|mi|pts?|x|×)/
const UNIT_BEFORE = /(\$|€|£|¥|₫)\s*$/

export function parseCode(source) {
  return parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript', 'decorators-legacy', 'importAttributes'], errorRecovery: true, ranges: false })
}

export const jsxName = n => !n ? '' : n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${jsxName(n.property)}` : n.type === 'JSXNamespacedName' ? `${n.namespace.name}:${n.name.name}` : ''
const attr = (el, name) => el.openingElement.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name)
const attrStr = (el, name) => { const a = attr(el, name); return a?.value?.type === 'StringLiteral' ? a.value.value : a?.value?.expression?.type === 'StringLiteral' ? a.value.expression.value : null }
// the className as written (string or expression), for class-based signals
const classCode = (el, src) => { const a = attr(el, 'className'); return !a?.value ? '' : a.value.type === 'StringLiteral' ? a.value.value : src.slice(a.value.start, a.value.end) }
const isIntrinsic = name => /^[a-z]/.test(name) && !name.includes('.')
const lineOf = (src, pos) => src.slice(0, pos).split('\n').length

function walk(node, visit, parent = null, stack = []) {
  if (!node || typeof node.type !== 'string') return
  visit(node, parent, stack)
  stack.push(node)
  for (const k in node) {
    if (k.startsWith('__') || k === 'loc' || k === 'start' || k === 'end' || k === 'extra' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue
    const v = node[k]
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, node, stack) }
    else if (v && typeof v.type === 'string') walk(v, visit, node, stack)
  }
  stack.pop()
}

/** Map of local name → import source, e.g. { Button: '@/components/ui/button', motion: 'motion/react' }. */
function importsOf(ast) {
  const m = {}
  for (const s of ast.program.body) if (s.type === 'ImportDeclaration') for (const sp of s.specifiers) m[sp.local.name] = s.source.value
  return m
}

/**
 * detect(source, { file }) → { parts, imports, ast }
 * part: { id, role, confidence, signal, name, line, el, kind: 'element' | 'expr', expr?, list? }
 */
export function detect(source, { file = 'file.tsx' } = {}) {
  const ast = parseCode(source), imports = importsOf(ast), importsAll = imports
  const found = new Map() // element node → [{ role, confidence, signal }]
  const exprParts = []
  const add = (el, role, confidence, signal) => {
    const list = found.get(el) || []
    const same = list.find(x => x.role === role)
    if (same) { if (confidence > same.confidence) Object.assign(same, { confidence, signal }); return }
    list.push({ role, confidence, signal }); found.set(el, list)
  }

  // numeric state: const [goal, setGoal] = useState(350) → {goal} is a value that changes
  const numericState = new Set()
  walk(ast.program, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'ArrayPattern' && node.init?.type === 'CallExpression' && /useState$/.test(source.slice(node.init.callee.start, node.init.callee.end))) {
      const a0 = node.init.arguments[0]
      if (a0?.type === 'NumericLiteral' && node.id.elements[0]?.type === 'Identifier') numericState.add(node.id.elements[0].name)
    }
  })
  walk(ast.program, (node, parent, stack) => {
    if (node.type === 'JSXElement') {
      const name = jsxName(node.openingElement.name)
      if (!name || name.startsWith('motion.') || /^Motion[A-Z]/.test(name)) return // already animated
      if (stack.some(s => s.type === 'JSXElement' && jsxName(s.openingElement.name) === 'svg')) return
      const root = name.split('.')[0], fromLib = LIB_SOURCE.test(imports[root] || '')
      const role = attrStr(node, 'role')
      // 1 · semantic
      if (name === 'button') add(node, 'button', 1, '<button>') // icon-only is decided below, from the children
      if (role === 'switch') add(node, 'toggle', 1, 'role="switch"')
      if (role === 'tablist') add(node, 'tabs', 1, 'role="tablist"')
      if (role === 'dialog' || role === 'alertdialog' || name === 'dialog') add(node, 'modal', 1, role ? `role="${role}"` : '<dialog>')
      if (name === 'details') add(node, 'accordion', 1, '<details>')
      if (['input', 'textarea', 'select'].includes(name)) add(node, 'input', 1, `<${name}>`)
      if (/^(a|Link|NavLink)$/.test(name) && stack.some(s => s.type === 'JSXElement' && jsxName(s.openingElement.name) === 'nav')) add(node, 'nav-link', 0.9, `<${name}> in <nav>`)
      const clsCode = classCode(node, source)
      if (/\bbuttonVariants\(/.test(clsCode)) add(node, 'button', 0.9, 'buttonVariants()')
      // 2 · library
      // a library trigger without asChild renders its own <button> (AccordionTrigger, DropdownMenuTrigger…)
      if (fromLib && /Trigger$/.test(name) && !/SubTrigger$/.test(name) && !/^(Select|Tabs)/.test(name) && !attr(node, 'asChild')) add(node, 'button', 0.9, `${name} renders a button`)
      for (const [r, re] of LIB_NAMES) if (re.test(name)) {
        if (r === 'button' && !fromLib && name !== 'Button') continue // a project's own *Button: let its name decide (DeleteItemButton → icon-button)
        // a dialog panel pinned to a screen edge at full height (or full width at the bottom) is a sheet / drawer
        const edge = r === 'modal' && /\bfixed\b/.test(clsCode) && ((/\b(left|right)-0\b/.test(clsCode) && /\btop-0\b/.test(clsCode) && /\bbottom-0\b/.test(clsCode)) || (/\bbottom-0\b/.test(clsCode) && /\binset-x-0\b|\bleft-0\b.*\bright-0\b/.test(clsCode) && !/\btop-0\b/.test(clsCode)))
        add(node, edge ? 'sheet' : r, fromLib ? 0.9 : 0.6, (edge ? 'edge-pinned ' : '') + (fromLib ? `${name} (${imports[root]})` : name)); break
      }
      // 3 · state
      if (!isIntrinsic(name) || name !== 'input') {
        if ((attr(node, 'checked') || attr(node, 'aria-checked') || attr(node, 'onCheckedChange')) && !['input'].includes(name) && !found.get(node)?.some(x => x.role === 'toggle')) add(node, 'toggle', 0.7, 'checked prop')
      }
      // 4 · names: component name, then className words
      // library roots (Sheet, Dialog, Tabs…) render no element of their own, and sub-parts (CardContent, SheetTrigger…) are
      // not the moving surface: names alone never tag them
      const subPart = SUB_PART.test(name) || (fromLib && LIB_ROOTS.test(name))
      const inButton = stack.some(s => s.type === 'JSXElement' && found.get(s)?.some(x => /button/.test(x.role)))
      if (!found.get(node) && !subPart && !inButton && !ICON_SOURCE.test(imports[root] || '') && !/Icon$/.test(name) && !(fromLib && !isIntrinsic(name))) {
        const cls = attrStr(node, 'className') || ''
        for (const [r, re] of NAME_HINTS) {
          if (!isIntrinsic(name) && re.test(name)) { add(node, r, 0.5, `name ${name}`); break }
          if (r === 'card' && cls.split(/\s+/).some(t => /^(card|[\w-]+-card|card-[\w-]+)$/i.test(t))) { add(node, 'card', 0.5, 'class "card"'); break }
        }
      }
    }
    if (node.type === 'JSXElement' && !found.get(node)) {
      const name = jsxName(node.openingElement.name)
      if (name && !name.startsWith('motion.') && !/^Motion[A-Z]/.test(name)) {
        // 5 · behaviour: something clickable that nothing above named is a press target
        // (not library parts such as menu items, and not links: an href navigates, the handler only closes a menu)
        const libPart = LIB_SOURCE.test(imports[name.split('.')[0]] || '')
        if (['onClick', 'formAction', 'onSelect', 'onPress'].some(h => attr(node, h)) && !libPart && !attr(node, 'href') && !['input', 'form', 'label', 'div', 'li', 'tr', 'td', 'span', 'img', 'a'].includes(name)) add(node, 'button', 0.5, 'click handler')
        // a component's root surface with rounded corners and depth (shadow or border) reads as a card
        else if (parent?.type === 'ReturnStatement' || (parent?.type === 'ParenthesizedExpression' && stack.at(-2)?.type === 'ReturnStatement') || parent?.type === 'ArrowFunctionExpression') {
          const c = classCode(node, source)
          if (/\brounded-(lg|xl|2xl|3xl)\b/.test(c) && /\b(shadow(-\w+)?|border)\b/.test(c) && /\bp-\d/.test(c)) add(node, 'card', 0.5, 'root surface: rounded + depth')
        }
      }
    }
    // list: xs.map(x => <Item/>) → the item element
    if ((node.type === 'CallExpression' || node.type === 'OptionalCallExpression') && node.callee?.property?.name === 'map' && (parent?.type === 'JSXExpressionContainer' || stack.some(s => s.type === 'JSXExpressionContainer'))) {
      const fn = node.arguments[0]
      if (fn && /FunctionExpression|ArrowFunctionExpression/.test(fn.type)) {
        let item = fn.body
        if (item.type === 'BlockStatement') item = item.body.find(s => s.type === 'ReturnStatement')?.argument
        while (item?.type === 'ParenthesizedExpression') item = item.expression
        if (item?.type === 'JSXFragment') item = item.children.find(c => c.type === 'JSXElement')
        if (item?.type === 'JSXElement' && !/^motion\.|^Motion[A-Z]/.test(jsxName(item.openingElement.name))) { add(item, 'list', 0.7, '.map() item'); item.__phationMap = fn }
      }
    }
    // number: {total} / {price.toFixed(2)} / {format(amount)} as the content of an element
    if (node.type === 'JSXExpressionContainer' && parent?.type === 'JSXElement' && node.expression.type !== 'JSXEmptyExpression') {
      const code = source.slice(node.expression.start, node.expression.end)
      const call = node.expression.type === 'CallExpression' ? (node.expression.callee.property?.name || node.expression.callee.name) : null
      const stateNum = node.expression.type === 'Identifier' && numericState.has(node.expression.name)
      const sib = parent.children, at = sib.indexOf(node), next = sib[at + 1], prev = sib[at - 1]
      const unit = (next?.type === 'JSXText' && UNIT_TEXT.test(next.value)) || (prev?.type === 'JSXText' && UNIT_BEFORE.test(prev.value))
      if (code.length < 80 && !/=>|<|\.map\(/.test(code) && (stateNum || unit || NUMBERISH.test(code) || (call && FORMAT_CALL.test(call)))) {
        exprParts.push({ role: 'number', confidence: 0.7, signal: stateNum ? `{${code}} numeric state` : unit ? `{${code.length > 20 ? code.slice(0, 18) + '…' : code}} + unit` : `{${code.length > 28 ? code.slice(0, 26) + '…' : code}}`, el: parent, expr: node })
      }
    }
  })

  // a button that is only an icon (size="icon", or an icon + sr-only label) is an icon-button
  for (const [el, roles] of found) for (const r of roles) if (r.role === 'button') {
    const size = attrStr(el, 'size') || ''
    const text = el.children.some(c => c.type === 'JSXText' && c.value.trim()) || el.children.some(c => c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression')
    const labelled = el.children.some(c => c.type === 'JSXElement' && /sr-only/.test(attrStr(c, 'className') || ''))
    const kids = el.children.filter(c => c.type === 'JSXElement')
    const iconLike = k => isIconLike(k, imports)
    if (attr(el, 'asChild')) continue // the child carries the content
    // aria-label + no text = the visible content is a glyph, unless that content is a picture (a thumbnail button)
    const picture = kids.some(k => /^(img|picture|video)$|Image|Img|Photo|Thumbnail|Picture/.test(jsxName(k.openingElement.name)))
    if (/^icon/.test(size) || (!text && kids.length && (kids.every(iconLike) || (attr(el, 'aria-label') && !picture)))) { r.role = 'icon-button'; r.signal += ' · icon only' }
  }
  const parts = []
  for (const [el, roles] of found) for (const r of roles) parts.push({ ...r, el, kind: 'element', name: jsxName(el.openingElement.name), line: lineOf(source, el.start) })
  for (const p of exprParts) parts.push({ ...p, kind: 'expr', name: jsxName(p.el.openingElement.name), line: lineOf(source, p.expr.start) })
  // a library content element covers its own role; drop weaker duplicates on the same node, keep the strongest per element+trigger
  parts.sort((a, b) => a.line - b.line || b.confidence - a.confidence)
  parts.forEach((p, i) => { p.id = i + 1; if (!ROLES.includes(p.role)) p.role = 'unknown' })
  return { parts, imports, ast, file }
}
