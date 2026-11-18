import { describe, expect, it } from 'vitest';
import {
  buildShareMessage,
  buildSharePayload,
  shareTextWithoutUrl,
} from './share-message';

/**
 * SS-249 composer vectors: priced single-variant, multi-variant «از …»,
 * call-for-price, unbranded — plus the no-fabrication rules (missing brand
 * omits its line, the URL is always the last line, nothing is invented).
 */
const URL = 'https://shop.example.com/products/some-slug';

describe('buildShareMessage', () => {
  it('composes title + brand + exact Toman price + URL for a single-variant product', () => {
    const message = buildShareMessage({
      title: 'ماوس گیمینگ پرووان مدل BOLT PMG55',
      brandName: 'proone',
      priceFromRial: '16000000',
      variantCount: 1,
      url: URL,
    });
    const lines = message.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('ماوس گیمینگ پرووان مدل BOLT PMG55');
    expect(lines[1]).toBe('proone');
    expect(lines[2]).toMatch(/^قیمت: .+ ریال$/);
    expect(lines[3]).toBe(URL);
  });

  it('uses «از …» only for a genuine multi-variant spread (card rule)', () => {
    const message = buildShareMessage({
      title: 'هارد اکسترنال ای دیتا مدل HD710 Pro',
      brandName: 'ای دیتا',
      priceFromRial: '42000000',
      variantCount: 4,
      url: URL,
    });
    expect(message.split('\n')[2]).toMatch(/^قیمت: از .+ ریال$/);
  });

  it('quotes تماس بگیرید for a call-for-price product — never a fabricated price', () => {
    const message = buildShareMessage({
      title: 'آی مک 21.5 اینچ 2011 اپل',
      brandName: null,
      priceFromRial: null,
      variantCount: 1,
      url: URL,
    });
    expect(message.split('\n')).toEqual([
      'آی مک 21.5 اینچ 2011 اپل',
      'قیمت: تماس بگیرید',
      URL,
    ]);
  });

  it('omits the brand line when the brand is missing', () => {
    const message = buildShareMessage({
      title: 'آنتی ویروس پنج کاربره Node 32',
      brandName: null,
      priceFromRial: '500000',
      variantCount: 1,
      url: URL,
    });
    expect(message.split('\n')).toHaveLength(3);
  });

  it('treats an empty price string as call-for-price', () => {
    const message = buildShareMessage({
      title: 'X',
      priceFromRial: '',
      variantCount: 1,
      url: URL,
    });
    expect(message).toContain('قیمت: تماس بگیرید');
  });
});

describe('shareTextWithoutUrl', () => {
  const message = buildShareMessage({
    title: 'T',
    brandName: 'B',
    priceFromRial: '1000000',
    variantCount: 1,
    url: URL,
  });

  it('drops only the trailing URL line and keeps the rest intact', () => {
    const without = shareTextWithoutUrl(message, URL);
    expect(without.endsWith(URL)).toBe(false);
    expect(message.startsWith(without)).toBe(true);
    expect(without.split('\n')).toHaveLength(3);
  });

  it('is a no-op when the message does not end with the URL', () => {
    expect(shareTextWithoutUrl('plain text', URL)).toBe('plain text');
  });
});


describe('buildSharePayload (SS-900)', () => {
  it('includes short description, brand, selected variant, image and prices', () => {
    const payload = buildSharePayload({
      title: 'لپ‌تاپ ایسوس',
      shortDescription: 'مدل گیمینگ ۱۶ اینچی',
      brandName: 'ایسوس',
      variantName: 'Core i7 / 16GB',
      imageUrl: 'https://shop.example/media/a.png',
      priceFromRial: '7700000',
      compareAtPriceRial: '8100000',
      variantCount: 1,
      url: URL,
    });
    expect(payload.imageUrl).toBe('https://shop.example/media/a.png');
    expect(payload.shortDescription).toBe('مدل گیمینگ ۱۶ اینچی');
    expect(payload.variantName).toBe('Core i7 / 16GB');
    expect(payload.priceRial).toBe('7700000');
    expect(payload.compareAtPriceRial).toBe('8100000');
    expect(payload.text).toContain('مدل گیمینگ ۱۶ اینچی');
    expect(payload.text).toContain('مدل: Core i7 / 16GB');
    expect(payload.text).toContain('قیمت: ۷٬۷۰۰٬۰۰۰ ریال');
    expect(payload.text).toContain('قیمت پیش از تخفیف: ۸٬۱۰۰٬۰۰۰ ریال');
    expect(payload.text).not.toContain('description');
  });

  it('never includes an invalid discount after rounding', () => {
    const message = buildShareMessage({
      title: 'X',
      priceFromRial: '7700000',
      compareAtPriceRial: '7700000',
      variantCount: 1,
      url: URL,
    });
    expect(message).not.toContain('قیمت پیش از تخفیف');
  });
});
