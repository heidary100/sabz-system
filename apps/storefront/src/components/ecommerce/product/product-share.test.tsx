// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductShare } from './product-share';

/**
 * SS-248/SS-249: the share row offers six anchor channels, a Bale copy
 * action (Bale has no verified web share deep-link — copy fallback, never
 * an invented endpoint), and copy-link. With `shareText` (product pages),
 * Telegram carries the payload minus the duplicated URL line and WhatsApp
 * carries the full message; without it (blog) every channel stays URL-only.
 */
describe('ProductShare', () => {
  afterEach(() => cleanup());

  const canonicalUrl = 'https://shop.example.com/products/some-slug';
  const shareText = [
    'ماوس گیمینگ پرووان مدل BOLT PMG55',
    'proone',
    'قیمت: ۱٬۶۰۰٬۰۰۰ تومان',
    canonicalUrl,
  ].join('\n');

  describe('with shareText (product pages)', () => {
    function renderRow() {
      return render(
        <ProductShare canonicalUrl={canonicalUrl} shareText={shareText} />,
      );
    }

    it('Telegram carries the payload without the duplicated URL line', () => {
      renderRow();
      const telegram = screen.getByRole('link', { name: /تلگرام/ });
      const href = telegram.getAttribute('href') ?? '';
      expect(href).toContain(`url=${encodeURIComponent(canonicalUrl)}`);
      expect(decodeURIComponent(href)).toContain('ماوس گیمینگ');
      expect(decodeURIComponent(href)).toContain('قیمت:');
      // The URL line is dropped from the text param (Telegram renders `url`).
      const textParam = new URL(
        'https://t.me' + href.slice('https://t.me'.length),
      ).searchParams.get('text');
      expect(textParam).not.toContain(canonicalUrl);
      expect(textParam).toContain('قیمت:');
    });

    it('WhatsApp carries the full message including the link', () => {
      renderRow();
      const whatsapp = screen.getByRole('link', { name: /واتساپ/ });
      const href = whatsapp.getAttribute('href') ?? '';
      const text = new URL(
        'https://wa.me' + href.slice('https://wa.me'.length),
      ).searchParams.get('text');
      expect(text).toBe(shareText);
    });

    it('keeps the other four channels URL-only', () => {
      renderRow();
      for (const label of ['ایکس', 'فیس‌بوک', 'پینترست', 'لینکدین']) {
        const link = screen.getByRole('link', { name: new RegExp(label) });
        expect(link.getAttribute('href')).toContain(
          encodeURIComponent(canonicalUrl),
        );
        expect(decodeURIComponent(link.getAttribute('href') ?? '')).not.toContain(
          'قیمت:',
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

  describe('without shareText (blog pages keep URL-only shares)', () => {
    it('Telegram and WhatsApp share only the URL', () => {
      render(<ProductShare canonicalUrl={canonicalUrl} />);
      const telegram = screen.getByRole('link', { name: /تلگرام/ });
      expect(telegram.getAttribute('href')).toBe(
        `https://t.me/share/url?url=${encodeURIComponent(canonicalUrl)}`,
      );
      const whatsapp = screen.getByRole('link', { name: /واتساپ/ });
      expect(whatsapp.getAttribute('href')).toBe(
        `https://wa.me/?text=${encodeURIComponent(canonicalUrl)}`,
      );
    });
  });
});
