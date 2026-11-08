import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  request: api.request,
  ApiError: class ApiError extends Error {
    status: number;
    payload?: { message?: string };
    constructor(status: number, payload?: { message?: string }) {
      super('api');
      this.status = status;
      this.payload = payload;
    }
  },
  API_BASE_URL: 'http://api.internal/api/v1',
  MEDIA_BASE_URL: 'http://media.internal/api/v1',
}));

import {
  fetchCategoryCovers,
  toCategoryCoverMap,
} from './catalog';
import { CATALOG_PRODUCTS_TAG, CATALOG_TREE_TAG } from './cache-tags';

describe('category cover mapping', () => {
  it('maps relative media paths to optimizer-ready URLs and preserves nulls', () => {
    const map = toCategoryCoverMap([
      { slug: 'phones', imageUrl: '/api/v1/catalog/media/a/thumbnail', alt: 'x' },
      { slug: 'empty', imageUrl: null, alt: 'y' },
    ]);
    expect(map.phones).toBe(
      'http://media.internal/api/v1/catalog/media/a/thumbnail',
    );
    expect(map.empty).toBeNull();
    expect(map).not.toHaveProperty('missing');
  });

  it('ignores malformed cover rows instead of breaking navigation', () => {
    const map = toCategoryCoverMap([
      { slug: '', imageUrl: '/x', alt: 'empty slug' },
      { slug: 'ok', imageUrl: null, alt: 'ok' },
    ]);
    expect(map).toEqual({ ok: null });
  });
});

describe('fetchCategoryCovers', () => {
  it('deduplicates slugs, bounds the request and returns the mapped map', async () => {
    api.request.mockResolvedValueOnce([
      { slug: 'a', imageUrl: '/media/a', alt: 'a' },
      { slug: 'b', imageUrl: null, alt: 'b' },
    ]);

    const covers = await fetchCategoryCovers('a,b,a');
    expect(api.request).toHaveBeenCalledWith(
      '/catalog/categories/covers?slugs=a%2Cb',
      expect.objectContaining({ cache: 'force-cache' }),
    );
    const init = api.request.mock.calls[0]?.[1] as {
      next?: { tags?: string[] };
    };
    expect(init.next?.tags).toEqual([CATALOG_TREE_TAG, CATALOG_PRODUCTS_TAG]);
    expect(covers).toEqual({
      a: 'http://media.internal/media/a',
      b: null,
    });
  });

  it('degrades to an empty map when the optional endpoint fails', async () => {
    api.request.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchCategoryCovers('offline')).resolves.toEqual({});
  });

  it('does not call the API when no slugs are provided', async () => {
    api.request.mockClear();
    await expect(fetchCategoryCovers(', ,')).resolves.toEqual({});
    expect(api.request).not.toHaveBeenCalled();
  });
});
