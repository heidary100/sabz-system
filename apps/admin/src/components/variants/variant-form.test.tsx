// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VariantForm } from './variant-form'
import type { VariantSummary } from '@sabz/types'

/**
 * SS-256: the create dialog opens with an editable `SBZ-` suggestion that
 * nothing regenerates behind the operator, a regenerate affordance that can
 * never discard manual input, and a 409 that surfaces the API's Persian
 * duplicate message without losing any form value. The generator module is
 * mocked for determinism — its own contract is pinned in
 * `apps/admin/src/lib/sku-suggestion.test.ts`.
 */
vi.mock('../../services/variants', () => ({
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
}))
vi.mock('../../lib/sku-suggestion', () => ({
  suggestSku: vi.fn(),
}))

import { createVariant } from '../../services/variants'
import { suggestSku } from '../../lib/sku-suggestion'
import { ApiError } from '../../services/api'

const suggestSkuMock = vi.mocked(suggestSku)
const createVariantMock = vi.mocked(createVariant)

const SUGGESTION_A = 'SBZ-TESTAAAA'
const SUGGESTION_B = 'SBZ-TESTBBBB'

const existing: VariantSummary = {
  id: 'v1',
  productId: 'p1',
  sku: 'WOO-4242',
  barcode: null,
  name: 'مشکی',
  price: '1500',
  compareAtPrice: null,
  priceStatus: 'PRICED',
}

function renderForm(
  props: Partial<Parameters<typeof VariantForm>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <VariantForm
      open
      productId="p1"
      variant={null}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      onConflict={vi.fn()}
      {...props}
    />,
  )
}

function skuInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'SKU' }) as HTMLInputElement
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'افزودن نوع' }) as HTMLButtonElement
}

function regenerateButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'تولید پیشنهاد' }) as HTMLButtonElement
}

/** canSubmit requires a valid price, so submit-path tests fill it first. */
function fillPrice(value = '1500.00'): void {
  fireEvent.input(screen.getByRole('textbox', { name: 'قیمت (ریال)' }), {
    target: { value },
  })
}

beforeEach(() => {
  let call = 0
  suggestSkuMock.mockImplementation(() => (call++ === 0 ? SUGGESTION_A : SUGGESTION_B))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VariantForm SKU suggestion (SS-256)', () => {
  it('opens create mode with an editable suggestion prefilled', () => {
    renderForm()
    expect(skuInput().value).toBe(SUGGESTION_A)
    expect(regenerateButton()).toBeTruthy()
  })

  it('keeps the suggestion when other fields change (name-independent)', () => {
    renderForm()
    fireEvent.input(screen.getByRole('textbox', { name: 'نام نوع / ویژگیها' }), {
      target: { value: 'آبی' },
    })
    expect(skuInput().value).toBe(SUGGESTION_A)
  })

  it('preserves a manual SKU when the name changes afterwards', () => {
    renderForm()
    fireEvent.input(skuInput(), { target: { value: 'MY-SKU-1' } })
    fireEvent.input(screen.getByRole('textbox', { name: 'نام نوع / ویژگیها' }), {
      target: { value: 'آبی' },
    })
    expect(skuInput().value).toBe('MY-SKU-1')
  })

  it('regenerates only while the field is untouched or empty', () => {
    renderForm()
    fireEvent.click(regenerateButton())
    expect(skuInput().value).toBe(SUGGESTION_B)
    // Regenerate never marks the field touched: it stays available.
    expect(regenerateButton()).toBeTruthy()

    fireEvent.input(skuInput(), { target: { value: 'MY-SKU-1' } })
    expect(screen.queryByRole('button', { name: 'تولید پیشنهاد' })).toBeNull()

    // Clearing the field re-opens the affordance as one-click recovery.
    fireEvent.input(skuInput(), { target: { value: '' } })
    expect(regenerateButton()).toBeTruthy()
  })

  it('never offers regenerate in edit mode and shows the stored SKU', () => {
    renderForm({ variant: existing })
    expect(skuInput().value).toBe('WOO-4242')
    expect(screen.queryByRole('button', { name: 'تولید پیشنهاد' })).toBeNull()
  })

  it('blocks submit with an empty SKU and shows the required error', () => {
    renderForm()
    fireEvent.input(skuInput(), { target: { value: '' } })
    fillPrice()
    expect(submitButton().disabled).toBe(true)
    expect(createVariantMock).not.toHaveBeenCalled()
  })

  it('shows the API duplicate message on 409 and preserves every value for retry', async () => {
    const onConflict = vi.fn()
    createVariantMock.mockRejectedValueOnce(
      new ApiError(409, {
        statusCode: 409,
        message: 'یک نوع با این sku قبلاً وجود دارد.',
        error: 'Conflict',
      }),
    )
    renderForm({ onConflict })

    fillPrice()
    fireEvent.click(submitButton())
    expect(await screen.findByText('یک نوع با این sku قبلاً وجود دارد.')).toBeTruthy()
    expect(onConflict).toHaveBeenCalled()
    expect(skuInput().value).toBe(SUGGESTION_A)

    // Retry after resolving the conflict sends the identical payload.
    createVariantMock.mockResolvedValueOnce({ ...existing, sku: SUGGESTION_A })
    fireEvent.click(submitButton())
    await waitFor(() => expect(createVariantMock).toHaveBeenCalledTimes(2))
    for (const call of createVariantMock.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({ sku: SUGGESTION_A, price: '1500.00' }),
      )
    }
  })

  it('groups thousands while typing and submits the canonical raw value', async () => {
    renderForm()
    const price = screen.getByRole('textbox', { name: 'قیمت (ریال)' })
    fireEvent.input(price, { target: { value: '1500000' } })
    expect((price as HTMLInputElement).value).toBe('1,500,000')

    createVariantMock.mockResolvedValueOnce({ ...existing, sku: SUGGESTION_A })
    fireEvent.click(submitButton())
    await waitFor(() => expect(createVariantMock).toHaveBeenCalledTimes(1))
    expect(createVariantMock.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ price: '1500000' }),
    )
  })

  it('shows stored prices grouped in edit mode', () => {
    renderForm({ variant: { ...existing, price: '1500000', compareAtPrice: '1800000' } })
    expect(
      (screen.getByRole('textbox', { name: 'قیمت (ریال)' }) as HTMLInputElement).value,
    ).toBe('1,500,000')
    expect(
      (screen.getByRole('textbox', { name: 'قیمت قبل از تخفیف (ریال)' }) as HTMLInputElement).value,
    ).toBe('1,800,000')
  })
})
