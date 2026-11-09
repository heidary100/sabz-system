// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminBlogPostListItemDto } from '@sabz/types'
import { HomepageBlogPickerDialog } from './homepage-blog-picker-dialog'
import { listAdminPosts } from '../../../services/blog'

vi.mock('../../../services/blog', () => ({ listAdminPosts: vi.fn() }))

const mockList = vi.mocked(listAdminPosts)

const post: AdminBlogPostListItemDto = {
  id: 'post-1',
  slug: 'post-1',
  title: 'مطلب منتشرشده',
  excerpt: null,
  coverImageUrl: null,
  category: { slug: 'news', name: 'اخبار' },
  authorName: null,
  publishedAt: '2026-11-09T10:00:00.000Z',
  status: 'PUBLISHED',
  statusFa: 'منتشر شده',
}

describe('HomepageBlogPickerDialog (SS-278)', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockList.mockResolvedValue({
      items: [post],
      total: 1,
      page: 1,
      limit: 20,
    })
  })

  afterEach(cleanup)

  it('uses published-status pagination without inventing search', async () => {
    const onPick = vi.fn()
    render(
      <HomepageBlogPickerDialog
        open
        selectedIds={[]}
        maxReached={false}
        onPick={onPick}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('مطلب منتشرشده')).toBeTruthy()
    expect(mockList).toHaveBeenCalledWith({
      status: 'PUBLISHED',
      page: 1,
      limit: 20,
    })
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByText(/جستجو یا فیلتر دسته‌بندی ندارد/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    expect(onPick).toHaveBeenCalledWith(post)
  })

  it('prevents duplicate and over-limit selections', async () => {
    const { rerender } = render(
      <HomepageBlogPickerDialog
        open
        selectedIds={[post.id]}
        maxReached={false}
        onPick={() => {}}
        onClose={() => {}}
      />,
    )
    expect(
      (
        await screen.findByRole('button', {
          name: 'افزوده‌شده',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    rerender(
      <HomepageBlogPickerDialog
        open
        selectedIds={[]}
        maxReached
        onPick={() => {}}
        onClose={() => {}}
      />,
    )
    expect(
      (
        await screen.findByRole('button', {
          name: 'محدودیت تکمیل است',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
