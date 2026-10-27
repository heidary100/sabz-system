// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrandQuickCreateDialog } from './brand-quick-create-dialog'
import type { BrandSummary } from '@sabz/types'

/**
 * SS-255 inline brand creation: valid create hands the returned BrandSummary
 * to onSuccess (parent refreshes/selects/closes); failures keep the dialog
 * open with values intact; the slug is sent only when non-empty; nameEn
 * passes through when provided.
 */
vi.mock('../../services/brands', () => ({
  createBrand: vi.fn(),
  listBrands: vi.fn(),
}))

import { createBrand, listBrands } from '../../services/brands'
import { ApiError } from '../../services/api'

const createdBrand: BrandSummary = {
  id: 'brand-new',
  name: 'برند آزمونی',
  slug: 'brand-azmvny',
  description: null,
  isFeatured: false,
  nameEn: null,
}

const existingBrands = {
  items: [{ id: 'b1', name: 'پرودو', slug: 'porodo', description: null, isFeatured: false, nameEn: 'Porodo' }],
  total: 1,
  page: 1,
  limit: 100,
}

function renderDialog(onSuccess = vi.fn()) {
  render(
    <BrandQuickCreateDialog open onClose={vi.fn()} onSuccess={onSuccess} />,
  )
  return onSuccess
}

function fill(name: string, nameEn = '', slug = '') {
  fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
    target: { value: name },
  })
  if (nameEn) {
    fireEvent.input(screen.getByRole('textbox', { name: 'نام انگلیسی (اختیاری)' }), {
      target: { value: nameEn },
    })
  }
  if (slug) {
    fireEvent.input(screen.getByRole('textbox', { name: 'نشانی (Slug)' }), {
      target: { value: slug },
    })
  }
}

describe('BrandQuickCreateDialog', () => {
  beforeEach(() => {
    vi.mocked(listBrands).mockResolvedValue(existingBrands)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('creates a brand and hands the returned entity to onSuccess', async () => {
    vi.mocked(createBrand).mockResolvedValue(createdBrand)
    const onSuccess = renderDialog()
    fill('برند آزمونی', 'Test Brand')
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(createdBrand))
    expect(createBrand).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'برند آزمونی', nameEn: 'Test Brand' }),
    )
  })

  it('sends the auto suggestion as slug and omits the nameEn key when empty', async () => {
    vi.mocked(createBrand).mockResolvedValue(createdBrand)
    renderDialog()
    fill('برند آزمونی')
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(createBrand).toHaveBeenCalled())
    expect(createBrand).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'برند آزمونی', slug: 'brnd-azmvny' }),
    )
    const payload = vi.mocked(createBrand).mock.calls[0]![0] as unknown as Record<string, unknown>
    expect('nameEn' in payload).toBe(false)
  })

  it('keeps the dialog open with a Persian error on 409 and shows the conflict line', async () => {
    vi.mocked(createBrand).mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        message: 'یک برند با این slug قبلاً وجود دارد.',
        error: 'Conflict',
      }),
    )
    renderDialog()
    fill('پرودو')
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    // The message renders twice by design: the conflict line under the slug
    // field and the dialog-level ErrorMessage.
    expect(
      await screen.findAllByText('یک برند با این slug قبلاً وجود دارد.'),
    ).toHaveLength(2)
    // Dialog still open (submit button present) and the entered name survived.
    expect(screen.getByRole('button', { name: 'افزودن' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'نام' }) as HTMLInputElement).value).toBe('پرودو')
  })

  it('renders the 400 validator message inside the dialog', async () => {
    vi.mocked(createBrand).mockRejectedValue(
      new ApiError(400, {
        statusCode: 400,
        // Runtime shape: class-validator arrays (ApiErrorPayload types it as
        // string; translateApiError handles both).
        message: ['name الزامی است.'] as unknown as string,
        error: 'Bad Request',
      }),
    )
    renderDialog()
    fill('نام آزمونی')
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(screen.getByText('name الزامی است.')).toBeTruthy())
    expect((screen.getByRole('textbox', { name: 'نام' }) as HTMLInputElement).value).toBe('نام آزمونی')
  })

  it('disables submit while the name is empty (no API call possible)', () => {
    renderDialog()
    const submit = screen.getByRole('button', { name: 'افزودن' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    expect(createBrand).not.toHaveBeenCalled()
  })

  it('warns on a slug collision against the fetched dataset', async () => {
    renderDialog()
    fill('پرودو') // slug suggestion 'prvdv'... use manual slug for determinism
    fireEvent.input(screen.getByRole('textbox', { name: 'نشانی (Slug)' }), {
      target: { value: 'porodo' },
    })
    expect(await screen.findByText(/این نشانی قبلاً استفاده شده است/)).toBeTruthy()
  })
})
