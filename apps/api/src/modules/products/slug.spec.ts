import { ensureUniqueSlug, generateSlug, slugify, transliteratePersian } from './slug';

describe('generateSlug', () => {
  it('lowercases and collapses runs of non-alphanumeric characters to a single hyphen', () => {
    expect(generateSlug('Dell XPS   13 -- Pro', 'product')).toBe('dell-xps-13-pro');
  });

  it('trims leading and trailing hyphens', () => {
    expect(generateSlug('--hello--', 'product')).toBe('hello');
  });

  it('caps length at 255 characters', () => {
    const slug = generateSlug('a'.repeat(300), 'product');
    expect(slug).toHaveLength(255);
  });

  it('falls back to a prefixed random suffix when the sanitized name is empty', () => {
    const slug = generateSlug('!!!', 'brand');
    expect(slug).toMatch(/^brand-[0-9a-f]{8}$/);
  });

  it('uses the provided fallback prefix in the random suffix', () => {
    const slug = generateSlug('   ', 'category');
    expect(slug).toMatch(/^category-[0-9a-f]{8}$/);
  });

  it('transliterates Persian runs and passes Latin through', () => {
    expect(transliteratePersian('سلام')).toBe('slam');
    expect(transliteratePersian('HD710 Pro')).toBe('HD710 Pro');
  });

  it('slugifies dataset-anchored Persian names', () => {
    expect(slugify('کالای دیجیتال')).toBe('kalay-dyjytal');
    expect(generateSlug('لپتاپ', 'product')).toBe('lptap');
    expect(
      slugify('هارد اکسترنال ای دیتا مدل HD710 Pro ظرفیت 1 ترابایت'),
    ).toBe('hard-akstrnal-ay-dyta-mdl-hd710-pro-zrfyt-1-trabayt');
  });

  it('drops zero-width joiners instead of hyphenating them', () => {
    expect(slugify('می‌شود')).toBe('myshvd');
  });

  it('maps Persian digits and preserves Latin', () => {
    expect(slugify('XPS ۱۳')).toBe('xps-13');
  });

  it('returns an empty base when nothing slug-worthy survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns the base untouched when free', async () => {
    await expect(
      ensureUniqueSlug('کالای دیجیتال', 'category', async () => false),
    ).resolves.toEqual({ slug: 'kalay-dyjytal', suffixed: false });
  });

  it('suffixes on collision and reports it', async () => {
    const taken = new Set(['kalay-dyjytal', 'kalay-dyjytal-2']);
    await expect(
      ensureUniqueSlug('کالای دیجیتال', 'category', async (slug) =>
        taken.has(slug),
      ),
    ).resolves.toEqual({ slug: 'kalay-dyjytal-3', suffixed: true });
  });

  it('falls back to uuid when the namespace is exhausted', async () => {
    await expect(
      ensureUniqueSlug('لپتاپ', 'product', async () => true, 2),
    ).resolves.toMatchObject({ suffixed: true });
    const result = await ensureUniqueSlug('لپتاپ', 'product', async () => true, 2);
    expect(result.slug).toMatch(/^lptap-[0-9a-f]{8}$/);
  });

  it('falls back for empty bases', async () => {
    await expect(
      ensureUniqueSlug('!!!', 'brand', async () => false),
    ).resolves.toMatchObject({ suffixed: true });
  });
});
