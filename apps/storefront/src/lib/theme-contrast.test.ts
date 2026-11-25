import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SS-900 brand pass: the storefront token contract must hold WCAG AA contrast
 * in both themes. Values are read from the single source of truth
 * (`app/globals.css`) so a future palette edit cannot quietly ship a
 * low-contrast surface. Body copy targets 4.5:1; focus rings, control borders
 * and other UI boundaries target 3:1.
 */
const CSS = readFileSync(
  fileURLToPath(new URL('../app/globals.css', import.meta.url)),
  'utf8',
);

function tokenBlock(marker: string): Record<string, string> {
  const start = CSS.indexOf(marker);
  if (start === -1) throw new Error(`Token block not found: ${marker}`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  const body = CSS.slice(open + 1, close);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[`--${match[1]}`] = match[2]!.trim();
  }
  return tokens;
}

const light = tokenBlock("\n:root,\n[data-theme='light']");
const dark = tokenBlock("\n[data-theme='dark']");

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const parse = (hex: string): [number, number, number] => {
    const match = hex.match(/^#([0-9a-f]{6})$/i);
    if (!match) throw new Error(`Unsupported token color: ${hex}`);
    const n = parseInt(match[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const luminance = (hex: string): number => {
    const [r, g, b] = parse(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TEXT = 4.5;
const UI = 3;

const PAIRS: Array<[string, string, number]> = [
  ['--ss-fg', '--ss-bg', TEXT],
  ['--ss-fg', '--ss-surface', TEXT],
  ['--ss-fg', '--ss-surface-2', TEXT],
  ['--ss-fg-secondary', '--ss-bg', TEXT],
  ['--ss-fg-secondary', '--ss-surface-2', TEXT],
  ['--ss-fg-muted', '--ss-bg', TEXT],
  ['--ss-fg-muted', '--ss-surface', TEXT],
  ['--ss-fg-muted', '--ss-surface-2', TEXT],
  ['--ss-fg-muted', '--ss-surface-3', TEXT],
  ['--ss-accent', '--ss-surface', TEXT],
  ['--ss-accent', '--ss-accent-soft', TEXT],
  ['--ss-on-accent', '--ss-accent', TEXT],
  ['--ss-on-sale', '--ss-sale', TEXT],
  ['--ss-on-danger', '--ss-danger', TEXT],
  ['--ss-success', '--ss-success-soft', TEXT],
  ['--ss-warning', '--ss-warning-soft', TEXT],
  ['--ss-danger', '--ss-danger-soft', TEXT],
  ['--ss-on-stage', '--ss-stage', TEXT],
  ['--ss-on-stage-secondary', '--ss-stage', TEXT],
  ['--ss-on-stage-muted', '--ss-stage', TEXT],
  ['--ss-accent-stage', '--ss-stage', TEXT],
  ['--ss-plate-fg', '--ss-plate', TEXT],
  ['--ss-plate-muted', '--ss-plate', TEXT],
  ['--ss-plate-accent', '--ss-plate', TEXT],
  ['--ss-focus', '--ss-surface', UI],
  ['--ss-focus-stage', '--ss-stage', UI],
  ['--ss-border-strong', '--ss-surface', UI],
  ['--ss-border-control', '--ss-surface', UI],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('storefront semantic contrast (%s)', (_theme, tokens) => {
  for (const [fgName, bgName, target] of PAIRS) {
    it(`${fgName} on ${bgName} ≥ ${target}:1`, () => {
      const fg = tokens[fgName];
      const bg = tokens[bgName];
      expect(fg, `${fgName} missing`).toBeDefined();
      expect(bg, `${bgName} missing`).toBeDefined();
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(target);
    });
  }
});
