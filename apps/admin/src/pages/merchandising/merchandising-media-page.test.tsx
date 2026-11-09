// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { MerchMediaSummaryDto } from '@sabz/types'
import { MerchandisingMediaPage } from './merchandising-media-page'

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../hooks/use-merch-media-list', () => ({
  useMerchMediaList: () => hook.value,
}))

vi.mock('../../components/merchandising/merch-media-thumbnail', () => ({
  MerchMediaThumbnail: ({ alt }: { alt: string }) => (
    <div data-testid="media-thumbnail">{alt}</div>
  ),
}))

function media(
  id: string,
  status: 'DRAFT' | 'PUBLISHED',
): MerchMediaSummaryDto {
  return {
    id,
    originalName: `${id}.png`,
    mimeType: 'image/png',
    sizeBytes: 2048,
    width: 1200,
    height: 800,
    altFa: `متن ${id}`,
    status,
    publishedAt:
      status === 'PUBLISHED' ? '2026-11-09T10:00:00.000Z' : null,
    createdAt: '2026-11-09T10:00:00.000Z',
    updatedAt: '2026-11-09T10:00:00.000Z',
  }
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    search: '',
    isPublished: '',
    page: 1,
    limit: 20,
    result: null,
    loading: false,
    error: null,
    setSearch: vi.fn(),
    setPublished: vi.fn(),
    setPage: vi.fn(),
    setLimit: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/merchandising/media']}>
      <MerchandisingMediaPage />
    </MemoryRouter>,
  )
}

describe('MerchandisingMediaPage (SS-274)', () => {
  beforeEach(() => {
    hook.value = state()
  })

  afterEach(cleanup)

  it('renders the loading state', () => {
    hook.value = state({ loading: true, result: null })
    renderPage()

    expect(screen.getByText('در حال بارگذاری رسانه‌ها…')).toBeTruthy()
  })

  it('renders the error state and retries', () => {
    const refetch = vi.fn()
    hook.value = state({ error: new Error('network'), refetch })
    renderPage()

    expect(screen.getByRole('alert').textContent).toContain(
      'خطایی رخ داد. دوباره تلاش کنید.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('shows the empty-library CTA and opens upload', () => {
    hook.value = state({ result: { items: [], total: 0, page: 1, limit: 20 } })
    renderPage()

    expect(screen.getByText('کتابخانه رسانه خالی است')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'بارگذاری نخستین رسانه' }),
    )
    expect(screen.getByText('بارگذاری رسانه بازاریابی')).toBeTruthy()
    expect(
      screen.getByText(/تا انتشار صفحه اصلی در فروشگاه دیده نمی‌شود/),
    ).toBeTruthy()
  })

  it('shows a filtered-empty state and clears filters', () => {
    const setSearch = vi.fn()
    const setPublished = vi.fn()
    hook.value = state({
      search: 'hero',
      isPublished: 'false',
      setSearch,
      setPublished,
      result: { items: [], total: 0, page: 1, limit: 20 },
    })
    renderPage()

    expect(screen.getByText('رسانه‌ای با این فیلتر پیدا نشد')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'پاک کردن فیلترها' }))
    expect(setSearch).toHaveBeenCalledWith('')
    expect(setPublished).toHaveBeenCalledWith('')
  })

  it('renders draft/published cards and forwards search/filter changes', () => {
    const setSearch = vi.fn()
    const setPublished = vi.fn()
    hook.value = state({
      setSearch,
      setPublished,
      result: {
        items: [media('draft', 'DRAFT'), media('published', 'PUBLISHED')],
        total: 2,
        page: 1,
        limit: 20,
      },
    })
    renderPage()

    expect(screen.getByText('draft.png')).toBeTruthy()
    expect(screen.getByText('published.png')).toBeTruthy()
    const cards = screen.getAllByRole('article')
    expect(within(cards[0]!).getByText('منتشرنشده')).toBeTruthy()
    expect(within(cards[1]!).getByText('منتشرشده')).toBeTruthy()
    expect(
      within(cards[0]!).getAllByText('متن draft').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('۲ رسانه')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('جستجو'), {
      target: { value: 'hero' },
    })
    fireEvent.change(screen.getByLabelText('وضعیت انتشار'), {
      target: { value: 'false' },
    })
    expect(setSearch).toHaveBeenCalledWith('hero')
    expect(setPublished).toHaveBeenCalledWith('false')
  })
})
