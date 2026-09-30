import type {
  AdminBlogPostListResponse,
  BlogCategoryDto,
  BlogPostDetailDto,
  BlogStatus,
  CreateBlogCategoryInput,
  CreateBlogPostInput,
  UpdateBlogCategoryInput,
  UpdateBlogPostInput,
} from '@sabz/types'
import { request } from './api'

export interface BlogListQuery {
  status?: BlogStatus | ''
  page?: number
  limit?: number
}

function buildListQuery(query: BlogListQuery): string {
  const params = new URLSearchParams()
  if (query.status) {
    params.set('status', query.status)
  }
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return qs ? `/admin/blog/posts?${qs}` : '/admin/blog/posts'
}

/**
 * Blog CMS client (SS-240E). Reads go through the unscoped admin queue
 * (`/admin/blog/posts*`, DRAFT + PUBLISHED); writes reuse the SS-238
 * operator routes (`/blog*`) directly — the same non-admin-prefix shape as
 * the RFQ (`/rfq/*`) and review moderation (`/reviews/*`) clients.
 */
export function listAdminPosts(
  query: BlogListQuery,
): Promise<AdminBlogPostListResponse> {
  return request<AdminBlogPostListResponse>(buildListQuery(query))
}

export function getAdminPost(postId: string): Promise<BlogPostDetailDto> {
  return request<BlogPostDetailDto>(`/admin/blog/posts/${postId}`)
}

export function createPost(input: CreateBlogPostInput): Promise<BlogPostDetailDto> {
  return request<BlogPostDetailDto>('/blog', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePost(
  postId: string,
  input: UpdateBlogPostInput,
): Promise<BlogPostDetailDto> {
  return request<BlogPostDetailDto>(`/blog/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** Archive = DELETE → DRAFT (the row stays for the queue). */
export function archivePost(postId: string): Promise<BlogPostDetailDto> {
  return request<BlogPostDetailDto>(`/blog/${postId}`, {
    method: 'DELETE',
  })
}

export function listCategories(): Promise<BlogCategoryDto[]> {
  return request<BlogCategoryDto[]>('/blog/categories')
}

export function createCategory(
  input: CreateBlogCategoryInput,
): Promise<BlogCategoryDto> {
  return request<BlogCategoryDto>('/blog/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateCategory(
  categoryId: string,
  input: UpdateBlogCategoryInput,
): Promise<BlogCategoryDto> {
  return request<BlogCategoryDto>(`/blog/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** Refused with 409 while posts still reference the category. */
export function deleteCategory(categoryId: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/blog/categories/${categoryId}`, {
    method: 'DELETE',
  })
}
