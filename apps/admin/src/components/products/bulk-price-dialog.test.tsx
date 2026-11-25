// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BulkPriceApplyResponse,
  BulkPricePreviewResponse,
} from '@sabz/types'
import { BulkPriceDialog } from './bulk-price-dialog'

vi.mock('../../services/pricing', () => ({
  previewBulkPricing: vi.fn(),
  applyBulkPricing: vi.fn(),
}))

import { applyBulkPricing, previewBulkPricing } from '../../services/pricing'

const mockPreview = vi.mocked(previewBulkPricing)
const mockApply = vi.mocked(applyBulkPricing)

const preview: BulkPricePreviewResponse = {
  previewToken: 'token-1',
  operation: { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value: '10' },
  scope: { type: 'PRODUCTS', productIds: ['p1'] },
  total: 1,
  affected: 1,
  skipped: 0,
  failed: 0,
  warnings: [],
  rows: [
    {
      variantId: 'v1',
      productId: 'p1',
      productName: 'هدفون',
      sku: 'SKU-1',
      categoryId: 'c1',
      categoryName: 'صدا',
      priceStatus: 'PRICED',
      regularPriceBefore: '10000000',
      regularPriceAfter: '10000000',
      discountedPriceBefore: null,
      discountedPriceAfter: '9000000',
      effectivePriceBefore: '10000000',
      effectivePriceAfter: '9000000',
      expectedUpdatedAt: '2026-11-01T00:00:00.000Z',
      outcome: 'AFFECTED',
    },
  ],
}

const applied: BulkPriceApplyResponse = {
  applied: true,
  summary: { requested: 1, affected: 1, skipped: 0, failed: 0 },
  results: [
    {
      variantId: 'v1',
      productId: 'p1',
      productName: 'هدفون',
      sku: 'SKU-1',
      outcome: 'AFFECTED',
    },
  ],
  warnings: [],
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  mockPreview.mockReset()
  mockApply.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BulkPriceDialog', () => {
  it('requires a preview and applies only the previewed token', async () => {
    mockPreview.mockResolvedValue(preview)
    mockApply.mockResolvedValue(applied)
    const onApplied = vi.fn()
    render(
      <BulkPriceDialog
        open
        mode="discount"
        scope={{ type: 'PRODUCTS', productIds: ['p1'] }}
        selectionCount={1}
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش' }))
    await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1))
    expect(mockPreview.mock.calls[0]![0]).toMatchObject({
      scope: { type: 'PRODUCTS', productIds: ['p1'] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value: '10' },
    })
    expect(await screen.findByText(/قابل اعمال: ۱/)).toBeTruthy()
    expect(screen.getAllByText(/۹٬۰۰۰٬۰۰۰/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'تأیید و ثبت' }))
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1))
    expect(mockApply.mock.calls[0]![0]).toMatchObject({
      previewToken: 'token-1',
      operation: { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value: '10' },
    })
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
  })

  it('blocks apply when the preview reports failures', async () => {
    mockPreview.mockResolvedValue({
      ...preview,
      affected: 0,
      failed: 1,
      rows: [{ ...preview.rows[0]!, outcome: 'FAILED', reason: 'تخفیف نامعتبر' }],
    })
    render(
      <BulkPriceDialog
        open
        mode="discount"
        scope={{ type: 'PRODUCTS', productIds: ['p1'] }}
        selectionCount={1}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش' }))
    await waitFor(() => expect(mockPreview).toHaveBeenCalled())
    const apply = screen.getByRole('button', { name: 'تأیید و ثبت' }) as HTMLButtonElement
    await waitFor(() => expect(apply.disabled).toBe(true))
    expect(mockApply).not.toHaveBeenCalled()
  })
})
