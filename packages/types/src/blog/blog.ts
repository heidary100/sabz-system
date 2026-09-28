/**
 * Blog CMS contract (SS-238, master plan §5.10).
 *
 * Operators manage articles (BlogPost, optionally filed under a
 * BlogCategory); the storefront reads PUBLISHED rows only. Bodies are
 * allowlist-sanitized HTML (same sanitizer as product descriptions) and
 * render through the storefront RichText component. The author byline is a
 * plain display string (`authorName`) — no User FK. No comments in this
 * ticket. Full admin UI arrives with SS-240; the API ships CRUD now.
 */

export type BlogStatus = 'DRAFT' | 'PUBLISHED';

export const BLOG_STATUS_FA: Record<BlogStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشر شده',
};

export interface BlogCategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface BlogPostCategoryRef {
  slug: string;
  name: string;
}

/** Card projection for the index + home teaser (never the body). */
export interface BlogPostCardDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  category: BlogPostCategoryRef | null;
  authorName: string | null;
  publishedAt: string | null;
}

/** Full article projection for `/blog/:slug`. */
export interface BlogPostDetailDto extends BlogPostCardDto {
  /** Sanitized HTML body. */
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: BlogStatus;
  statusFa: string;
}

export interface BlogPostListResponse {
  items: BlogPostCardDto[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateBlogCategoryInput {
  slug?: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateBlogCategoryInput {
  slug?: string;
  name?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface CreateBlogPostInput {
  slug?: string;
  categoryId?: string;
  title: string;
  excerpt?: string;
  content: string;
  coverImageUrl?: string;
  authorName?: string;
  metaTitle?: string;
  metaDescription?: string;
  /** Defaults to DRAFT. */
  status?: BlogStatus;
  /** ISO timestamp; set automatically on publish when omitted. */
  publishedAt?: string;
}

export interface UpdateBlogPostInput {
  slug?: string;
  categoryId?: string | null;
  title?: string;
  excerpt?: string | null;
  content?: string;
  coverImageUrl?: string | null;
  authorName?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status?: BlogStatus;
  publishedAt?: string | null;
}
