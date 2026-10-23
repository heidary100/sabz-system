// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductShare } from './product-share';

/**
 * SS-248: the share row offers the six anchor channels, a Bale copy action
 * (Bale has no verified web share deep-link — copy fallback, never an
 * invented endpoint), and copy-link. Every channel href carries the exact
 * canonical URL.
 */
describe('ProductShare', () => {
  afterEach(() => cleanup());

  const canonicalUrl = 'https://shop.example.com/products/some-slug';

  function renderRow() {
    return render(<ProductShare canonicalUrl={canonicalUrl} />);
  }

  it('renders all six share anchors with the canonical URL encoded', () => {
    renderRow();
    for (const label of ['تلگرام', 'واتساپ', 'ایکس', 'فیس‌بوک', 'پینترست', 'لینکدین']) {
      const link = screen.getByRole('link', { name: new RegExp(label) });
      expect(link.getAttribute('href')).toBeTruthy();
      expect(link.getAttribute('href')).toContain(
        encodeURIComponent(canonicalUrl),
      );
    }
  });

  it('renders the Bale copy action (no invented share endpoint)', () => {
    renderRow();
    const bale = screen.getByRole('button', { name: /بله/ });
    expect(bale.getAttribute('href')).toBeNull();
    expect(bale.getAttribute('title')).toContain('کپی');
  });

  it('renders the plain copy-link button', () => {
    renderRow();
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeTruthy();
  });
});
