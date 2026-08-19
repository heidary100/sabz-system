import { generateSlug } from './slug';

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
});
