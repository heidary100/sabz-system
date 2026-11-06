// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogGridBatchResponse, CatalogGridListResponse, CatalogGridRow } from '@sabz/types'
import { ProductsPage } from './products-page'

/**
 * SS-257 rework: the products page IS the editable catalog grid. The
 * centerpiece remains the zero-drift cancel oracle (editing then discarding
 * issues ZERO mutation requests); the rework adds URL-driven advanced
 * filters, checkbox column visibility, sortable headers, inline variant
 * fields (SKU/barcode/name/priceStatus) and row actions with variant delete.
 * SS-266: editable cells are click-to-edit — tests click the resting cell
 * button, then change the mounted input by the same aria-label.
 */
vi.mock('../services/catalog-grid', () => ({
  listCatalogGrid: vi.fn(),
  batchUpdateCatalogGrid: vi.fn(),
}))

vi.mock('../services/variants', () => ({
  deleteVariant: vi.fn(),
}))

vi.mock('../hooks/use-category-options', () => ({
  useCategoryOptions: () => ({
    categories: [
      { id: 'cat-1', name: 'هندزفری' },
      { id: 'cat-2', name: 'پاوربانک' },
    ],
  }),
}))
vi.mock('../hooks/use-brand-options', () => ({
  useBrandOptions: () => ({
    brands: [
      { id: 'brand-1', name: 'انکر' },
      { id: 'brand-2', name: 'پرودو' },
    ],
  }),
}))

import { batchUpdateCatalogGrid, listCatalogGrid } from '../services/catalog-grid'
import { deleteVariant } from '../services/variants'

const mockList = vi.mocked(listCatalogGrid)
const mockBatch = vi.mocked(batchUpdateCatalogGrid)
const mockDelete = vi.mocked(deleteVariant)

const TOKEN_A = '2026-11-03T10:00:00.000Z'
const TOKEN_B = '2026-11-03T10:05:00.000Z'

function row(overrides: Partial<CatalogGridRow> = {}): CatalogGridRow {
  return {
    variantId: 'v1',
    productId: 'p1',
    productName: 'محصول شبکه',
    productSlug: 'prod-grid',
    productStatus: 'PUBLISHED',
    condition: 'NEW',
    createdAt: '2026-11-01T08:00:00.000Z',
    sku: 'SKU-1',
    barcode: 'BC-1',
    variantName: 'واریانت یک',
    brandName: 'انکر',
    categoryName: 'هندزفری',
    thumbnailUrl: null,
    priceStatus: 'PRICED',
    price: '100000',
    compareAtPrice: null,
    stock: 5,
    stockEditable: true,
    expectedUpdatedAt: TOKEN_A,
    ...overrides,
  }
}

const rows: CatalogGridRow[] = [
  row({ variantId: 'v1', sku: 'SKU-1', price: '100000', stock: 5, expectedUpdatedAt: TOKEN_A }),
  row({
    variantId: 'v2',
    productId: 'p2',
    productName: 'محصول دوم',
    sku: 'SKU-2',
    price: '200000',
    stock: 3,
    expectedUpdatedAt: TOKEN_B,
  }),
]

function renderPage(initialEntry = '/products') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProductsPage />
    </MemoryRouter>,
  )
}

async function renderAndLoad(initialEntry = '/products') {
  const view = renderPage(initialEntry)
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  await waitFor(() => expect(cellText('قیمت فروش — SKU-1')).toBe('100,000'))
  return view
}

/**
 * SS-266 click-to-edit: at rest an editable cell is a text button (same
 * aria-label); clicking it mounts the real input. Editing = click, then
 * change the mounted input by the same label.
 */
function cellButton(label: string): HTMLButtonElement {
  return screen.getByLabelText(label) as HTMLButtonElement
}

function cellText(label: string): string {
  return cellButton(label).textContent ?? ''
}

function editCell(label: string, value: string): void {
  fireEvent.click(cellButton(label))
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  // Blur ends the editing session (as a click-away does in the browser),
  // returning the cell to its resting text presentation.
  fireEvent.blur(screen.getByLabelText(label))
}

beforeEach(() => {
  mockList.mockReset()
  mockBatch.mockReset()
  mockDelete.mockReset()
  mockList.mockResolvedValue({ items: rows, total: rows.length, page: 1, limit: 50 })
  vi.stubGlobal('confirm', vi.fn(() => true))
  // jsdom has no ResizeObserver; the anchored Headless UI components need one.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ProductsPage — the editable catalog grid (SS-257 rework)', () => {
  it('renders the required columns from server rows', async () => {
    await renderAndLoad()
    expect(cellText('شناسه کالا (SKU) — SKU-1')).toBe('SKU-1')
    expect(cellText('شناسه کالا (SKU) — SKU-2')).toBe('SKU-2')
    expect(screen.getAllByText('انکر').length).toBeGreaterThanOrEqual(2)
    // Product status ships hidden in the lean defaults; its chip reveals it.
    expect(screen.queryByText('منتشرشده')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ستون وضعیت محصول' }))
    await waitFor(() =>
      expect(screen.getAllByText('منتشرشده').length).toBeGreaterThanOrEqual(2),
    )
    // Stock column shows the aggregate server value.
    expect(cellText('موجودی — SKU-1')).toBe('5')
  })

  it('cancel/discard sends ZERO mutation requests and restores server values (zero-drift oracle)', async () => {
    await renderAndLoad()

    editCell('قیمت فروش — SKU-1', '150000')
    editCell('موجودی — SKU-2', '42')
    expect(screen.getByText('2 ردیف تغییر ذخیرهنشده دارد')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'لغو تغییرات' }))

    await waitFor(() => expect(cellText('قیمت فروش — SKU-1')).toBe('100,000'))
    expect(cellText('موجودی — SKU-2')).toBe('3')
    // The oracle: not a single write reached the API.
    expect(mockBatch).not.toHaveBeenCalled()
    expect(screen.queryByText(/ردیف تغییر ذخیرهنشده دارد/)).toBeNull()
  })

  it('explicit save submits the draft with the loaded token and reconciles the row', async () => {
    await renderAndLoad()
    editCell('قیمت فروش — SKU-1', '150000')
    editCell('شناسه کالا (SKU) — SKU-1', 'SKU-1B')

    const newToken = '2026-11-03T11:00:00.000Z'
    mockBatch.mockResolvedValue({
      results: [
        {
          variantId: 'v1',
          outcome: 'SUCCESS',
          price: '150000',
          compareAtPrice: null,
          sku: 'SKU-1B',
          barcode: 'BC-1',
          variantName: 'واریانت یک',
          priceStatus: 'PRICED',
          updatedAt: newToken,
          stock: 5,
        },
      ],
      summary: { succeeded: 1, failed: 0 },
    } as CatalogGridBatchResponse)

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    await waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1))
    const payload = mockBatch.mock.calls[0]![0]!
    expect(payload.rows).toEqual([
      { variantId: 'v1', expectedUpdatedAt: TOKEN_A, price: '150000', sku: 'SKU-1B' },
    ])
    await waitFor(() => expect(screen.getByText('1 ردیف با موفقیت ذخیره شد')).toBeTruthy())
    // The row reconciles to the server-confirmed values and new token —
    // including the NEW sku, which the labels are keyed by.
    expect(cellText('قیمت فروش — SKU-1B')).toBe('150,000')
    expect(cellText('شناسه کالا (SKU) — SKU-1B')).toBe('SKU-1B')
    // Untouched rows are not part of the request.
    expect(payload.rows.some((entry) => entry.variantId === 'v2')).toBe(false)
  })

  it('reports partial failure in Persian and keeps the failed draft editable', async () => {
    await renderAndLoad()
    editCell('قیمت فروش — SKU-1', '150000')
    editCell(
      'قیمت فروش ویژه — SKU-2',
      '100000',
    )

    mockBatch.mockResolvedValue({
      results: [
        { variantId: 'v1', outcome: 'SUCCESS', price: '150000', compareAtPrice: null, updatedAt: '2026-11-03T11:00:00.000Z', stock: 5 },
        {
          variantId: 'v2',
          outcome: 'VALIDATION_ERROR',
          message: 'قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.',
          fieldErrors: { compareAtPrice: 'قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.' },
        },
      ],
      summary: { succeeded: 1, failed: 1 },
    } as CatalogGridBatchResponse)

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    await waitFor(() => expect(screen.getByText('1 ردیف ذخیره نشد')).toBeTruthy())
    // Row-level, field-level Persian error on the exact cell.
    expect(screen.getByText('قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.')).toBeTruthy()
    expect(cellText('قیمت فروش ویژه — SKU-2')).toBe('100,000')
    expect(cellText('قیمت فروش — SKU-1')).toBe('150,000')
    expect(screen.getByText('1 ردیف تغییر ذخیرهنشده دارد')).toBeTruthy()
  })

  it('opens the conflict dialog on CONFLICT_CHANGED and lets the operator keep or drop the draft', async () => {
    await renderAndLoad()
    editCell('قیمت فروش — SKU-1', '150000')

    mockBatch.mockResolvedValue({
      results: [{ variantId: 'v1', outcome: 'CONFLICT_CHANGED', message: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.' }],
      summary: { succeeded: 0, failed: 1 },
    } as CatalogGridBatchResponse)
    const refreshedRow = row({ variantId: 'v1', price: '300000', expectedUpdatedAt: '2026-11-03T12:00:00.000Z' })
    mockList.mockResolvedValueOnce({ items: [refreshedRow, rows[1]!], total: 2, page: 1, limit: 50 })

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    await waitFor(() => expect(screen.getByText('این ردیف تغییر کرده است')).toBeTruthy())
    expect(screen.getByText('300,000')).toBeTruthy() // server price visible

    // Dropping the draft reverts the cell to the server value without a write.
    fireEvent.click(screen.getByRole('button', { name: 'نسخه سرور را بپذیرم (لغو تغییر من)' }))
    await waitFor(() => expect(cellText('قیمت فروش — SKU-1')).toBe('300,000'))
    expect(mockBatch).toHaveBeenCalledTimes(1)

    // Second conflict round: the operator keeps their draft this time.
    editCell('قیمت فروش — SKU-1', '180000')
    mockBatch.mockResolvedValue({
      results: [{ variantId: 'v1', outcome: 'CONFLICT_CHANGED', message: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.' }],
      summary: { succeeded: 0, failed: 1 },
    } as CatalogGridBatchResponse)
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))
    await waitFor(() => expect(screen.getByText('این ردیف تغییر کرده است')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'تغییرات من را نگه دار' }))
    await waitFor(() => expect(screen.queryByText('این ردیف تغییر کرده است')).toBeNull())
    expect(cellText('قیمت فروش — SKU-1')).toBe('180,000')
    expect(mockBatch).toHaveBeenCalledTimes(2)
  })

  it('column chips toggle visibility in place and persist (fixed core always visible)', async () => {
    await renderAndLoad()
    expect(screen.getAllByText('انکر').length).toBeGreaterThanOrEqual(2)

    // Chips render as a row of aria-pressed toggles.
    const brandChip = screen.getByRole('button', { name: 'ستون برند' })
    expect(brandChip.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(brandChip)
    // The brand COLUMN disappears; the brand filter options legitimately stay.
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'برند' })).toBeNull())
    expect(screen.getByRole('button', { name: 'ستون برند' }).getAttribute('aria-pressed')).toBe('false')

    const stored = JSON.parse(localStorage.getItem('sabz-admin-catalog-grid-columns') ?? '[]') as string[]
    expect(stored).not.toContain('brand')
    expect(stored).toContain('sku') // fixed core persists implicitly
    expect(screen.getByRole('button', { name: 'شناسه کالا (SKU)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'موجودی' })).toBeTruthy()

    // Toggling back restores the column.
    fireEvent.click(screen.getByRole('button', { name: 'ستون برند' }))
    await waitFor(() => expect(screen.getAllByText('انکر').length).toBeGreaterThanOrEqual(2))
  })

  it('selects the page size and jumps to a page number', async () => {
    mockList.mockResolvedValue({
      items: rows,
      total: 120,
      page: 1,
      limit: 20,
    } as CatalogGridListResponse)
    await renderAndLoad()

    fireEvent.change(screen.getByLabelText('تعداد در هر صفحه'), {
      target: { value: '20' },
    })
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.limit).toBe(20)
      expect(last.page).toBe(1)
    })

    // Go-to-page clamps to the range and refetches.
    fireEvent.change(screen.getByLabelText('شماره صفحه'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'برو' }))
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.page).toBe(6) // ceil(120/20) = 6 pages
    })
  })

  it('writes advanced filters to the URL and the API query (multi-select + stock + price)', async () => {
    await renderAndLoad()

    // Multi-select brand via checkboxes.
    fireEvent.click(screen.getByRole('button', { name: 'برند' }))
    fireEvent.click(screen.getByRole('option', { name: /انکر/ }))
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.brandIds).toEqual(['brand-1'])
    })

    // Stock bucket + price range go server-side too.
    fireEvent.change(screen.getByLabelText('موجودی'), {
      target: { value: 'OUT_OF_STOCK' },
    })
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.stockStatus).toBe('OUT_OF_STOCK')
    })
    fireEvent.change(screen.getByPlaceholderText('از'), { target: { value: '50000' } })
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.minPrice).toBe('50000')
    })
    // Active-filter chips appear with a clear-all affordance.
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'حذف فیلترها' }))
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.stockStatus).toBeUndefined()
      expect(last.brandIds).toBeUndefined()
      expect(last.minPrice).toBeUndefined()
    })
  })

  it('sorts via the header control (URL sort/dir) and exposes row actions with variant delete', async () => {
    await renderAndLoad()

    // Sortable header → server-side sort param.
    fireEvent.click(screen.getByRole('button', { name: 'قیمت فروش' }))
    await waitFor(() => {
      const last = mockList.mock.calls[mockList.mock.calls.length - 1]![0]!
      expect(last.sortBy).toBe('price')
      expect(last.sortDir).toBe('asc')
    })

    // Row actions: detail / edit links + delete → confirm dialog → API.
    expect(screen.getByLabelText('مشاهده محصول شبکه')).toBeTruthy()
    expect(screen.getByLabelText('ویرایش محصول شبکه')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('حذف واریانت SKU-1'))
    await waitFor(() =>
      expect(screen.getAllByText('حذف واریانت').length).toBeGreaterThan(0),
    )
    fireEvent.click(screen.getByRole('button', { name: 'حذف واریانت' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('v1'))
    // The grid refetches after the delete.
    await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
