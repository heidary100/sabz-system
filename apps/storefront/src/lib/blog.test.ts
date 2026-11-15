import { describe, expect, it } from 'vitest';
import { blogListPath, splitBlogTeaser } from './blog';

/** SS-238: blog list paths stay shareable and deterministic. */
describe('blogListPath', () => {
  it('builds the bare index path without a query', () => {
    expect(blogListPath()).toBe('/blog');
    expect(blogListPath({})).toBe('/blog');
  });

  it('builds page/limit/category queries', () => {
    expect(blogListPath({ page: 2, limit: 10 })).toBe('/blog?page=2&limit=10');
    expect(blogListPath({ category: 'guides' })).toBe('/blog?category=guides');
    expect(blogListPath({ page: 1, limit: 9, category: 'guides' })).toBe(
      '/blog?page=1&limit=9&category=guides',
    );
  });
});

describe('splitBlogTeaser', () => {
  it('hides the teaser for an empty blog', () => {
    expect(splitBlogTeaser([])).toBeNull();
  });

  it('uses a single story as the feature with no companions', () => {
    expect(splitBlogTeaser(['a'])).toEqual({
      feature: 'a',
      secondary: [],
    });
  });

  it('keeps one feature and at most two companions', () => {
    expect(splitBlogTeaser(['a', 'b', 'c', 'd'])).toEqual({
      feature: 'a',
      secondary: ['b', 'c'],
    });
  });
});
