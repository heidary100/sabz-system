import { describe, expect, it } from 'vitest';
import {
  SEO_DESCRIPTION_MAX_LENGTH,
  seoDescriptionFromHtml,
  stripHtmlToText,
  truncateText,
} from './seo';

describe('stripHtmlToText', () => {
  it('returns empty for nullish input', () => {
    expect(stripHtmlToText(null)).toBe('');
    expect(stripHtmlToText(undefined)).toBe('');
    expect(stripHtmlToText('')).toBe('');
  });

  it('leaves plain text untouched', () => {
    expect(stripHtmlToText('کالای دیجیتال')).toBe('کالای دیجیتال');
  });

  it('strips nested tags and normalizes whitespace', () => {
    expect(
      stripHtmlToText('<div><h2>عنوان</h2><p>متن  <strong>مهم</strong></p></div>'),
    ).toBe('عنوان متن مهم');
  });

  it('drops script/style content and decodes entities', () => {
    expect(
      stripHtmlToText(
        '<script>alert(1)</script><p>قیمت &amp; تخفیف&nbsp;ویژه</p>',
      ),
    ).toBe('قیمت & تخفیف ویژه');
  });
});

describe('truncateText', () => {
  it('keeps short text intact', () => {
    expect(truncateText('کوتاه', 160)).toBe('کوتاه');
  });

  it('avoids splitting a word when a space is nearby', () => {
    const text = 'word '.repeat(50).trim();
    const out = truncateText(text, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith(' ')).toBe(false);
    expect(`x${out}`).not.toMatch(/w$/);
  });
});

describe('seoDescriptionFromHtml', () => {
  it('truncates long HTML to the SEO maximum', () => {
    const html = `<p>${'کلمه '.repeat(100)}</p>`;
    const out = seoDescriptionFromHtml(html);
    expect(out.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX_LENGTH);
    expect(out).not.toContain('<');
  });

  it('returns empty when there is no readable text', () => {
    expect(seoDescriptionFromHtml('<br><hr>')).toBe('');
  });
});
