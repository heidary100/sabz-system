// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogGridBatchResponse, CatalogGridRow } from '@sabz/types'
import { CatalogGridPage } from './catalog-grid-page'

/**
 * SS-257 page behavior. The centerpiece is the zero-drift cancel oracle:
 * editing several cells and discarding must issue ZERO mutation requests —
 * cancel is a pure client-side draft reset (the committed SQL checksum probe
 * proves the same guarantee at the database level).
 */
vi.mock('../services/catalog-grid', () => ({
  listCatalogGrid: vi.fn(),
  batchUpdateCatalogGrid: vi.fn(),
}))

vi.mock('../hooks/use-category-options', () => ({
  useCategoryOptions: () => ({ categories: [] }),
}))
vi.mock('../hooks/use-brand-options', () => ({
  useBrandOptions: () => ({ brands: [] }),
}))

import { batchUpdateCatalogGrid, listCatalogGrid } from '../services/catalog-grid'

const mockList = vi.mocked(listCatalogGrid)
const mockBatch = vi.mocked(batchUpdateCatalogGrid)

const TOKEN_A = '2026-11-03T10:00:00.000Z'
const TOKEN_B = '2026-11-03T10:05:00.000Z'

function row(overrides: Partial<CatalogGridRow> = {}): CatalogGridRow {
  return {
    variantId: 'v1',
    productId: 'p1',
    productName: 'محصول شبکه',
    productSlug: 'prod-grid',
    sku: 'SKU-1',
    brandName: 'برند الف',
    categoryName: 'دسته الف',
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
  row({ variantId: 'v2', sku: 'SKU-2', price: '200000', stock: 3, expectedUpdatedAt: TOKEN_B }),
]

function renderPage() {
  return render(
    <MemoryRouter>
      <CatalogGridPage />
    </MemoryRouter>,
  )
}

async function renderAndLoad() {
  const view = renderPage()
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  await waitFor(() => expect(screen.getByDisplayValue('100,000')).toBeTruthy())
  return view
}

function priceInput(sku: string): HTMLInputElement {
  return screen.getByLabelText(`قیمت فروش — ${sku}`) as HTMLInputElement
}

function stockInput(sku: string): HTMLInputElement {
  return screen.getByLabelText(`موجودی — ${sku}`) as HTMLInputElement
}

beforeEach(() => {
  mockList.mockReset()
  mockBatch.mockReset()
  mockList.mockResolvedValue({ items: rows, total: rows.length, page: 1, limit: 50 })
  vi.stubGlobal('confirm', vi.fn(() => true))
  // jsdom has no ResizeObserver; the anchored Headless UI menu needs one.
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

describe('CatalogGridPage (SS-257)', () => {
  it('renders the required columns from server rows', async () => {
    await renderAndLoad()
    expect(screen.getByText('SKU-1')).toBeTruthy()
    expect(screen.getByText('SKU-2')).toBeTruthy()
    expect(screen.getAllByText('قیمت‌دار').length).toBe(2)
    expect(screen.getAllByText('برند الف').length).toBe(2)
    // Stock column shows the aggregate server value.
    expect(screen.getByDisplayValue('5')).toBeTruthy()
  })

  it('cancel/discard sends ZERO mutation requests and restores server values (zero-drift oracle)', async () => {
    await renderAndLoad()

    fireEvent.change(priceInput('SKU-1'), { target: { value: '150000' } })
    fireEvent.change(stockInput('SKU-2'), { target: { value: '42' } })
    expect(screen.getByText('2 ردیف تغییر ذخیرهنشده دارد')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'لغو تغییرات' }))

    await waitFor(() => expect(screen.getByDisplayValue('100,000')).toBeTruthy())
    expect(screen.getByDisplayValue('3')).toBeTruthy()
    // The oracle: not a single write reached the API.
    expect(mockBatch).not.toHaveBeenCalled()
    expect(screen.queryByText(/ردیف تغییر ذخیرهنشده دارد/)).toBeNull()
  })

  it('explicit save submits the draft with the loaded concurrency token and reconciles the row', async () => {
    await renderAndLoad()
    fireEvent.change(priceInput('SKU-1'), { target: { value: '150000' } })

    const newToken = '2026-11-03T11:00:00.000Z'
    mockBatch.mockResolvedValue({
      results: [
        {
          variantId: 'v1',
          outcome: 'SUCCESS',
          price: '150000',
          compareAtPrice: null,
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
      { variantId: 'v1', expectedUpdatedAt: TOKEN_A, price: '150000' },
    ])
    // The row reconciles to the server-confirmed value and new token.
    await waitFor(() => expect(screen.getByText('1 ردیف با موفقیت ذخیره شد')).toBeTruthy())
    expect(priceInput('SKU-1').value).toBe('150,000')
    // Untouched rows are not part of the request.
    expect(payload.rows.some((entry) => entry.variantId === 'v2')).toBe(false)
  })

  it('reports partial failure in Persian and keeps the failed draft editable', async () => {
    await renderAndLoad()
    fireEvent.change(priceInput('SKU-1'), { target: { value: '150000' } })
    fireEvent.change(
      screen.getByLabelText('قیمت فروش ویژه — SKU-2'),
      { target: { value: '100000' } },
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
    // The failed draft survives; the successful row was reconciled.
    expect(
      (screen.getByLabelText('قیمت فروش ویژه — SKU-2') as HTMLInputElement).value,
    ).toBe('100,000')
    expect(priceInput('SKU-1').value).toBe('150,000')
    expect(screen.getByText('1 ردیف تغییر ذخیرهنشده دارد')).toBeTruthy()
  })

  it('opens the conflict dialog on CONFLICT_CHANGED and lets the operator keep or drop the draft', async () => {
    await renderAndLoad()
    fireEvent.change(priceInput('SKU-1'), { target: { value: '150000' } })

    // The server moved ahead: refetch returns the newer authoritative row.
    mockBatch.mockResolvedValue({
      results: [{ variantId: 'v1', outcome: 'CONFLICT_CHANGED', message: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.' }],
      summary: { succeeded: 0, failed: 1 },
    } as CatalogGridBatchResponse)
    const refreshedRow = row({ variantId: 'v1', price: '300000', expectedUpdatedAt: '2026-11-03T12:00:00.000Z' })
    mockList.mockResolvedValueOnce({ items: [refreshedRow, rows[1]!], total: 2, page: 1, limit: 50 })

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    // The dialog appears after the authoritative refetch.
    await waitFor(() => expect(screen.getByText('این ردیف تغییر کرده است')).toBeTruthy())
    expect(screen.getByText('300,000')).toBeTruthy() // server price visible

    // Dropping the draft reverts the cell to the server value without a write.
    fireEvent.click(screen.getByRole('button', { name: 'نسخه سرور را بپذیرم (لغو تغییر من)' }))
    await waitFor(() => expect(screen.getByDisplayValue('300,000')).toBeTruthy())
    expect(mockBatch).toHaveBeenCalledTimes(1)

    // Second conflict round: the operator keeps their draft this time.
    fireEvent.change(priceInput('SKU-1'), { target: { value: '180000' } })
    mockBatch.mockResolvedValue({
      results: [{ variantId: 'v1', outcome: 'CONFLICT_CHANGED', message: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.' }],
      summary: { succeeded: 0, failed: 1 },
    } as CatalogGridBatchResponse)
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))
    await waitFor(() => expect(screen.getByText('این ردیف تغییر کرده است')).toBeTruthy())
    // The draft is not silently lost — the operator chooses.
    fireEvent.click(screen.getByRole('button', { name: 'تغییرات من را نگه دار' }))
    await waitFor(() => expect(screen.queryByText('این ردیف تغییر کرده است')).toBeNull())
    expect(priceInput('SKU-1').value).toBe('180,000')
    // Keeping the draft never wrote anything extra.
    expect(mockBatch).toHaveBeenCalledTimes(2)
  })

  it('persists column visibility toggles and always keeps the fixed columns', async () => {
    await renderAndLoad()
    expect(screen.getAllByText('برند').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'ستون‌ها' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'برند' }))
    await waitFor(() => expect(screen.queryByText('برند الف')).toBeNull())
    // The brand COLUMN header is gone; the brand filter label legitimately stays.
    expect(screen.queryByRole('columnheader', { name: 'برند' })).toBeNull()

    const stored = JSON.parse(localStorage.getItem('sabz-admin-catalog-grid-columns') ?? '[]') as string[]
    expect(stored).not.toContain('brand')
    expect(stored).toContain('sku') // fixed core persists implicitly
    expect(screen.getByRole('columnheader', { name: 'SKU' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'موجودی' })).toBeTruthy()
  })
})
