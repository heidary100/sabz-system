/**
 * SS-267/SS-271 contrast gate — verifies the Sabz admin semantic tokens against
 * WCAG 2.2 contrast targets (4.5:1 body text, 3:1 UI components).
 *
 * Reads --sabz-* values straight from src/index.css (single source of
 * truth), composites alpha colors over their real backdrops, and exits
 * non-zero when any pair falls below its threshold.
 *
 * Run: pnpm --filter @sabz/admin contrast
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css')
const css = readFileSync(cssPath, 'utf8')

/** Pull one CSS rule block (e.g. `:root { ... }`) as a variable map. */
function extractBlock(blockSelector) {
  // Anchor to a line-start rule so `.dark {` does not match the earlier
  // `@variant dark (&:where(.dark, .dark *));` statement.
  const start = css.indexOf(`\n${blockSelector} {`)
  if (start === -1) throw new Error(`CSS block not found: ${blockSelector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const vars = {}
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[`--${match[1]}`] = match[2].trim()
  }
  return vars
}

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/i)
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: +rgb[4] }
  }
  const rgbPlain = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/i)
  if (rgbPlain) {
    return { r: +rgbPlain[1], g: +rgbPlain[2], b: +rgbPlain[3], a: 1 }
  }
  throw new Error(`Unsupported color value: ${value}`)
}

/** Composite a (possibly translucent) color over an opaque backdrop. */
function composite(color, backdrop) {
  const a = color.a
  if (a >= 1) return color
  return {
    r: Math.round(color.r * a + backdrop.r * (1 - a)),
    g: Math.round(color.g * a + backdrop.g * (1 - a)),
    b: Math.round(color.b * a + backdrop.b * (1 - a)),
    a: 1,
  }
}

function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

const light = extractBlock(':root')
const dark = extractBlock('.dark')

const RATIOS = { TEXT: 4.5, UI: 3 }

// [theme, label, fgVar, bgVar, threshold, extraBackdropCompositor]
const PAIRS = [
  ['light', 'body text on page', 'foreground', 'background', RATIOS.TEXT],
  ['light', 'body text on card', 'foreground', 'surface', RATIOS.TEXT],
  ['light', 'muted text on page', 'muted', 'background', RATIOS.TEXT],
  ['light', 'muted text on card', 'muted', 'surface', RATIOS.TEXT],
  ['light', 'primary link on card', 'primary', 'surface', RATIOS.TEXT],
  ['light', 'success text on subtle', 'success', 'success-subtle', RATIOS.TEXT],
  ['light', 'warning text on subtle', 'warning', 'warning-subtle', RATIOS.TEXT],
  ['light', 'danger text on subtle', 'danger', 'danger-subtle', RATIOS.TEXT],
  ['light', 'info text on subtle', 'info', 'info-subtle', RATIOS.TEXT],
  ['light', 'primary button on card (UI)', 'primary-strong', 'surface', RATIOS.UI],
  ['light', 'primary button label', 'on-primary', 'primary-strong', RATIOS.TEXT],
  ['light', 'danger button on card (UI)', 'danger', 'surface', RATIOS.UI],
  ['light', 'strong border on card (UI)', 'border-strong', 'surface', RATIOS.UI],
  ['light', 'focus ring on input (UI)', 'focus-ring', 'surface-strong', RATIOS.UI],
  ['dark', 'body text on page', 'foreground', 'background', RATIOS.TEXT],
  ['dark', 'body text on card', 'foreground', 'surface', RATIOS.TEXT],
  ['dark', 'muted text on page', 'muted', 'background', RATIOS.TEXT],
  ['dark', 'muted text on card', 'muted', 'surface', RATIOS.TEXT],
  ['dark', 'primary link on card', 'primary', 'surface', RATIOS.TEXT],
  ['dark', 'success text on subtle', 'success', 'success-subtle', RATIOS.TEXT],
  ['dark', 'warning text on subtle', 'warning', 'warning-subtle', RATIOS.TEXT],
  ['dark', 'danger text on subtle', 'danger', 'danger-subtle', RATIOS.TEXT],
  ['dark', 'info text on subtle', 'info', 'info-subtle', RATIOS.TEXT],
  ['dark', 'primary button on card (UI)', 'primary-strong', 'surface', RATIOS.UI],
  ['dark', 'primary button label', 'on-primary', 'primary-strong', RATIOS.TEXT],
  ['dark', 'danger button on card (UI)', 'danger', 'surface', RATIOS.UI],
  ['dark', 'strong border on card (UI)', 'border-strong', 'surface', RATIOS.UI],
  ['dark', 'focus ring on input (UI)', 'focus-ring', 'surface-strong', RATIOS.UI],
]

// SS-271: badge tones. Foreground must reach body-text contrast on the subtle
// fill. Badges do not rely on a border to convey state, so the border tokens
// are not treated as required UI boundaries here.
for (const theme of ['light', 'dark']) {
  PAIRS.push([theme, 'neutral badge text', 'muted', 'surface-strong', RATIOS.TEXT])
  for (const tone of ['info', 'success', 'warning', 'danger']) {
    PAIRS.push([theme, `${tone} badge text`, tone, `${tone}-subtle`, RATIOS.TEXT])
  }
}

let failures = 0
console.log(`SS-267/SS-271 contrast gate — ${PAIRS.length} pairs\n`)
for (const [theme, label, fgVar, bgVar, threshold] of PAIRS) {
  const vars = theme === 'light' ? light : dark
  const fgRef = vars[`--sabz-${fgVar}`]
  const bgRef = vars[`--sabz-${bgVar}`]
  if (!fgRef || !bgRef) {
    console.log(`MISSING  [${theme}] ${label} (fg=${fgRef ?? '∅'}, bg=${bgRef ?? '∅'})`)
    failures += 1
    continue
  }
  // Backdrop may itself be translucent (dark subtles): composite over card.
  const bgParsed = parseColor(bgRef)
  const backdrop = bgParsed.a >= 1 ? bgParsed : composite(bgParsed, parseColor(vars['--sabz-surface']))
  const fg = composite(parseColor(fgRef), backdrop)
  const ratio = contrastRatio(fg, backdrop)
  const ok = ratio >= threshold
  if (!ok) failures += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  [${theme}] ${label.padEnd(34)} ${ratio.toFixed(2)}:1 (need ${threshold}:1)`,
  )
}

console.log(`\n${failures === 0 ? 'All pairs pass.' : `${failures} pair(s) below target.`}`)
process.exitCode = failures === 0 ? 0 : 1
