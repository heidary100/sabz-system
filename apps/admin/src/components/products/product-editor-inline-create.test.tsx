// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProductEditor } from './product-editor'
import { ApiError } from '../../services/api'
import type { BrandSummary, CategorySummary } from '@sabz/types'

/**
 * SS-255 core correctness: opening/cancelling/failing/succeeding in the
 * inline entity dialogs must never disturb the unsaved product form. The
 * new entity is selected only after a successful create + options refetch,
 * and the dialog closes only then.
 */
vi.mock('../../services/brands', () => ({
  createBrand: vi.fn(),
  listBrands: vi.fn(),
}))
vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(),
  fetchCategoryTree: vi.fn(),
  listCategories: vi.fn(),
}))
vi.mock('../../services/variants', () => ({
  deleteVariant: vi.fn(),
}))
// The lazy rich-text editor pulls TipTap into jsdom; the form test stubs it.
vi.mock('./product-description-editor', () => ({
  ProductDescriptionEditor: () => <div data-testid="description-editor-stub" />,
}))

import { createBrand, listBrands } from '../../services/brands'
import { createCategory, fetchCategoryTree, listCategories } from '../../services/categories'
import type { CategoryTreeNode, PaginatedResult } from '@sabz/types'

const existingBrands: PaginatedResult<BrandSummary> = {
  items: [
    { id: 'b1', name: 'پرودو', slug: 'porodo', description: null, isFeatured: false, nameEn: 'Porodo' },
  ],
  total: 1,
  page: 1,
  limit: 100,
}
const existingCategories: PaginatedResult<CategorySummary> = {
  items: [
    { id: 'c1', name: 'کیبورد و ماوس', slug: 'kybvrd-v-mavs', parentId: null, sortOrder: 0, isVisible: true },
  ],
  total: 1,
  page: 1,
  limit: 100,
}
const tree: CategoryTreeNode[] = [
  { ...existingCategories.items[0]!, productCount: 5, children: [] },
]
const newBrand: BrandSummary = {
  id: 'brand-new', name: 'برند تازه', slug: 'brnd-tazh', description: null, isFeatured: false, nameEn: null,
}
const newCategory: CategorySummary & { children: [] } = {
  id: 'cat-new', name: 'دسته تازه', slug: 'dsth-tazh', parentId: null, sortOrder: 1, isVisible: true, children: [],
}

async function fillProductBasics() {
  // Options load asynchronously — wait for them or the change events coerce to ''.
  await screen.findByText('پرودو')
  await screen.findByText('کیبورد و ماوس')
  fireEvent.input(screen.getByRole('textbox', { name: 'نام محصول' }), {
    target: { value: 'محصول آزمونی SS255' },
  })
  fireEvent.input(screen.getByRole('textbox', { name: 'گارانتی' }), {
    target: { value: '۲۴ ماهه' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'برند' }), {
    target: { value: 'b1' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'دسته بندی' }), {
    target: { value: 'c1' },
  })
}

function expectProductBasicsPreserved() {
  // Only fields NO dialog can legitimately touch; each test asserts both
  // selects explicitly (exactly one may change, on success alone).
  expect((screen.getByRole('textbox', { name: 'نام محصول' }) as HTMLInputElement).value).toBe(
    'محصول آزمونی SS255',
  )
  expect((screen.getByRole('textbox', { name: 'گارانتی' }) as HTMLInputElement).value).toBe('۲۴ ماهه')
}

function expectCategorySelected(value: string) {
  expect((screen.getByRole('combobox', { name: 'دسته بندی' }) as HTMLSelectElement).value).toBe(value)
}

function expectBrandSelected(value: string) {
  expect((screen.getByRole('combobox', { name: 'برند' }) as HTMLSelectElement).value).toBe(value)
}

describe('ProductEditor inline entity creation (SS-255)', () => {
  beforeEach(() => {
    vi.mocked(listBrands).mockResolvedValue(existingBrands)
    vi.mocked(listCategories).mockResolvedValue(existingCategories)
    vi.mocked(fetchCategoryTree).mockResolvedValue(tree)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('creates a brand inline, refetches options, selects it, and preserves every other field', async () => {
    // Stateful mocks: after createBrand, the refreshed options include the new brand.
    let brandCreated = false
    vi.mocked(createBrand).mockImplementation(async () => {
      brandCreated = true
      return newBrand
    })
    vi.mocked(listBrands).mockImplementation(async () =>
      brandCreated
        ? { ...existingBrands, items: [...existingBrands.items, newBrand] }
        : existingBrands,
    )
    render(<MemoryRouter><ProductEditor product={null} onSaved={vi.fn()} onCancel={vi.fn()} /></MemoryRouter>)
    await fillProductBasics()

    fireEvent.click(screen.getByRole('button', { name: '+ برند جدید' }))
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'برند تازه' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'افزودن' })[0]!)
    await waitFor(() => expect(createBrand).toHaveBeenCalled())
    // listBrands: options-hook mount + the dialog's own collision dataset + the refetch.
    await waitFor(() => expect(listBrands).toHaveBeenCalledTimes(3))

    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'برند' }) as HTMLSelectElement).value).toBe(
        'brand-new',
      ),
    )
    expectBrandSelected('brand-new') // the ONLY intended change
    expectCategorySelected('c1') // untouched
    expectProductBasicsPreserved()
    // Dialog closes after selection; Headless UI keeps it mounted during the
    // leave transition, so wait for removal rather than asserting sync.
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'نام انگلیسی (اختیاری)' })).toBeNull(),
    )
  })

  it('cancelling the brand dialog preserves the form and creates nothing', async () => {
    render(<MemoryRouter><ProductEditor product={null} onSaved={vi.fn()} onCancel={vi.fn()} /></MemoryRouter>)
    await fillProductBasics()
    fireEvent.click(screen.getByRole('button', { name: '+ برند جدید' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'انصراف' })[0]!)
    expect(createBrand).not.toHaveBeenCalled()
    expectBrandSelected('b1') // untouched
    expectCategorySelected('c1') // untouched
    expectProductBasicsPreserved()
  })

  it('a 409 keeps the dialog open with the message while the form stays intact', async () => {
    vi.mocked(createBrand).mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        message: 'یک برند با این slug قبلاً وجود دارد.',
        error: 'Conflict',
      }),
    )
    render(<MemoryRouter><ProductEditor product={null} onSaved={vi.fn()} onCancel={vi.fn()} /></MemoryRouter>)
    await fillProductBasics()
    fireEvent.click(screen.getByRole('button', { name: '+ برند جدید' }))
    fireEvent.input(screen.getAllByRole('textbox', { name: 'نام' })[0]!, {
      target: { value: 'پرودو' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'افزودن' })[0]!)
    // Message renders twice by design (conflict line + dialog ErrorMessage).
    expect(
      await screen.findAllByText('یک برند با این slug قبلاً وجود دارد.'),
    ).toHaveLength(2)
    // The dialog stayed open (Headless UI aria-hides the background, so
    // cancel first), then the form must be intact and untouched.
    fireEvent.click(screen.getAllByRole('button', { name: 'انصراف' })[0]!)
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).toBeNull(),
    )
    expectBrandSelected('b1') // untouched
    expectCategorySelected('c1') // untouched
    expectProductBasicsPreserved()
  })

  it('creates a category inline and selects it, preserving the form', async () => {
    // Stateful mock: after createCategory the refreshed options include it.
    let categoryCreated = false
    vi.mocked(createCategory).mockImplementation(async () => {
      categoryCreated = true
      return newCategory
    })
    vi.mocked(listCategories).mockImplementation(async () =>
      categoryCreated
        ? { ...existingCategories, items: [...existingCategories.items, newCategory] }
        : existingCategories,
    )
    render(<MemoryRouter><ProductEditor product={null} onSaved={vi.fn()} onCancel={vi.fn()} /></MemoryRouter>)
    await fillProductBasics()

    fireEvent.click(screen.getByRole('button', { name: '+ دسته\u200Cبندی جدید' }))
    await screen.findByText('کیبورد و ماوس') // tree loaded into the parent select
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'دسته تازه' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'افزودن' })[0]!)
    await waitFor(() => expect(createCategory).toHaveBeenCalled())
    await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(2)) // mount + refetch

    // The dialog closes after selection; wait out the leave transition before
    // role queries against the (now-unhidden) form.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'دسته بندی' }) as HTMLSelectElement).value).toBe(
        'cat-new',
      ),
    )
    expectBrandSelected('b1') // untouched by the category dialog
    expectCategorySelected('cat-new') // the ONLY intended change (asserted after the leave transition above)
    expectProductBasicsPreserved()
  })
})
