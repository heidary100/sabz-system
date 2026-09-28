import { cache } from 'react';
import type {
  BlogCategoryDto,
  BlogPostDetailDto,
  BlogPostListResponse,
} from '@sabz/types';
import { ApiError, request } from '@/lib/api';
import {
  BLOG_CATEGORIES_TAG,
  BLOG_POSTS_TAG,
  blogPostTag,
} from '@/lib/cache-tags';

/**
 * Typed blog data access for server components (SS-238 contract).
 *
 * SS-217 caching: reads go through the Next.js Data Cache
 * (`cache: 'force-cache'` + revalidate window + tags); the API invalidates
 * the blog tags after committed mutations (see `app/api/revalidate`), so
 * the revalidate values below are only stale-while-invalidated safety
 * nets. Helpers are wrapped in React `cache()` so layout/page/metadata
 * call sites within one render pass share a single entry. Never throws
 * for collection reads gone stale-empty — sections hide instead.
 */

/** Data Cache revalidate windows (seconds) per resource. */
const REVALIDATE = {
  posts: 300,
  categories: 3600,
  detail: 300,
} as const;

interface BlogFetchInit {
  revalidate: number;
  tags: string[];
}

/**
 * Fetch options for a cached blog read. Assigned to a typed variable
 * (not an inline literal) so the Next-specific `next` key passes the
 * api-client's `RequestInit` parameter without excess-property errors.
 */
function cachedFetchInit({ revalidate, tags }: BlogFetchInit): RequestInit {
  const init: RequestInit & { next?: { revalidate: number; tags: string[] } } = {
    cache: 'force-cache',
    next: { revalidate, tags },
  };
  return init;
}

export interface BlogListQuery {
  page?: number;
  limit?: number;
  category?: string;
}

/** Public list path for published posts (page/limit/category). */
export function blogListPath(query: BlogListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.category) params.set('category', query.category);
  const qs = params.toString();
  return `/blog${qs ? `?${qs}` : ''}`;
}

/** Published posts, newest first (public, paginated). */
export const fetchBlogPosts = cache(
  async (query: BlogListQuery = {}): Promise<BlogPostListResponse> => {
    return request<BlogPostListResponse>(
      blogListPath(query),
      cachedFetchInit({ revalidate: REVALIDATE.posts, tags: [BLOG_POSTS_TAG] }),
    );
  },
);

/** Blog categories for the index filter (public, filing order). */
export const fetchBlogCategories = cache(
  async (): Promise<BlogCategoryDto[]> => {
    try {
      return await request<BlogCategoryDto[]>(
        '/blog/categories',
        cachedFetchInit({
          revalidate: REVALIDATE.categories,
          tags: [BLOG_CATEGORIES_TAG],
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
        return [];
      }
      return [];
    }
  },
);

/** Published article by slug; null when missing or still a draft. */
export const fetchBlogPostBySlug = cache(
  async (slug: string): Promise<BlogPostDetailDto | null> => {
    try {
      return await request<BlogPostDetailDto>(
        `/blog/${slug}`,
        cachedFetchInit({
          revalidate: REVALIDATE.detail,
          tags: [BLOG_POSTS_TAG, blogPostTag(slug)],
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },
);
