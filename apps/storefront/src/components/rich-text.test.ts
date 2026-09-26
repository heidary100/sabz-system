import { describe, expect, it } from 'vitest';
import { withLazyImages, withoutNewlineArtifacts } from './rich-text';

/**
 * SS-217: sanitized rich-text <img> tags must receive lazy loading/decoding
 * hints. The transformation is a pure string augmentation over the
 * API-sanitized allowlist HTML — no attribute content is user-controlled.
 */
describe('withLazyImages', () => {
  it('adds loading and decoding hints to plain img tags', () => {
    const html = '<p>متن</p><img src="/api/v1/catalog/media/1" alt="">';
    expect(withLazyImages(html)).toBe(
      '<p>متن</p><img src="/api/v1/catalog/media/1" alt="" loading="lazy" decoding="async">',
    );
  });

  it('leaves non-img markup untouched', () => {
    const html = '<h2>عنوان</h2><ul><li>آیتم</li></ul><a href="/x">پیوند</a>';
    expect(withLazyImages(html)).toBe(html);
  });

  it('does not double-add loading when already present', () => {
    const html = '<img src="/x" loading="lazy">';
    expect(withLazyImages(html)).toBe('<img src="/x" loading="lazy">');
  });

  it('adds only loading when decoding is already present', () => {
    const html = '<img src="/x" decoding="async">';
    const result = withLazyImages(html);
    expect(result).toContain('loading="lazy"');
    expect(result).toContain('decoding="async"');
    expect(result).not.toContain('loading="lazy" loading="lazy"');
  });

  it('handles self-closing and multi-attribute img tags', () => {
    const html = '<img class="x" src="/y" /><img src="/z">';
    const result = withLazyImages(html);
    const imgs = result.match(/<img[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
    }
  });
});

describe('withoutNewlineArtifacts (SS-228)', () => {
  it('collapses literal newline markers with surrounding whitespace', () => {
    expect(withoutNewlineArtifacts('جنس بدنه چرم \\nاین محصول')).toBe(
      'جنس بدنه چرم این محصول',
    );
    expect(withoutNewlineArtifacts('متن \\n \\n ادامه')).toBe('متن ادامه');
  });

  it('leaves clean html untouched', () => {
    expect(withoutNewlineArtifacts('<p>متن تمیز</p>')).toBe('<p>متن تمیز</p>');
  });
});
