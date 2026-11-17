import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

const COLOR_UTILITY =
  /(?<![\w-])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|group-focus:|sm:|md:|lg:|xl:|2xl:)*(?:bg|text|border|ring|outline|divide|from|via|to|placeholder|fill|stroke|decoration)-(?:white|black|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|sand|ink|sabz)(?:-\d{2,3})?)(?:\/[\d.]+)?/g;

const FORBIDDEN_SNIPPETS = [
  'bg-gradient-',
  'text-gradient-',
  'backdrop-blur',
  'blur-3xl',
  'blur-2xl',
  'glass',
];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

const files = walk(SRC);
const sources = new Map(
  files.map((file) => [relative(SRC, file), readFileSync(file, 'utf8')]),
);

describe('semantic token usage', () => {
  it('contains no raw palette utilities in storefront components', () => {
    const failures: string[] = [];
    for (const [file, source] of sources) {
      for (const match of source.matchAll(COLOR_UTILITY)) {
        failures.push(`${file}:${lineOf(source, match.index ?? 0)} ${match[0]}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('contains no dark: variants or ad-hoc hex colors', () => {
    const failures: string[] = [];
    for (const [file, source] of sources) {
      if (/dark:[a-z]/.test(source)) {
        failures.push(`${file}: dark: variant`);
      }
      for (const match of source.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        failures.push(`${file}:${lineOf(source, match.index ?? 0)} ${match[0]}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('contains no removed decorative treatments', () => {
    const failures: string[] = [];
    for (const [file, source] of sources) {
      for (const snippet of FORBIDDEN_SNIPPETS) {
        if (source.includes(snippet)) {
          failures.push(`${file}: ${snippet}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('pins the semantic material of every major surface', () => {
    const contracts: Record<string, string[]> = {
      'components/ecommerce/ui/button.tsx': ['bg-accent', 'text-on-accent', 'rounded-control'],
      'components/ecommerce/ui/badge.tsx': ['bg-sale', 'text-on-sale', 'bg-stage/90'],
      'components/ecommerce/ui/card.tsx': ['bg-surface', 'border-border', 'rounded-card'],
      'components/ecommerce/ui/section-header.tsx': ['text-h2', 'text-fg', 'bg-accent'],
      'components/ecommerce/checkout/address-form.tsx': ['border-border-control', 'bg-surface'],
      'components/ecommerce/header/site-header.tsx': ['bg-surface', 'border-border'],
      'components/ecommerce/header/desktop-nav.tsx': ['bg-surface', 'border-border'],
      'components/ecommerce/header/search-overlay.tsx': ['bg-surface', 'bg-overlay'],
      'components/ecommerce/product-card/product-card.tsx': ['bg-plate', 'bg-surface', 'text-fg'],
      'components/ecommerce/footer/site-footer.tsx': ['bg-stage', 'text-on-stage-secondary'],
      'components/ecommerce/hero/hero-slider.tsx': ['bg-stage', 'text-on-stage'],
      'app/checkout/checkout-wizard.tsx': ['bg-surface', 'text-fg'],
      'app/account/account-panel.tsx': ['bg-surface', 'bg-stage', 'text-fg'],
      'app/login/page.tsx': ['bg-surface', 'bg-stage', 'text-on-stage'],
    };

    for (const [file, tokens] of Object.entries(contracts)) {
      const source = sources.get(file);
      expect(source, `${file} should exist`).toBeDefined();
      for (const token of tokens) {
        expect(source, `${file} should use ${token}`).toContain(token);
      }
    }
  });
});
