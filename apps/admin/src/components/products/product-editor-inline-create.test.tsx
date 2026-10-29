// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProductEditor } from './product-editor'
import { ApiError } from '../../services/api'
import type { BrandSummary, CategoryDetail, CategoryTreeNode } from '@sabz/types'

/**
 * SS-255 revision: the product form embeds the REAL category manager
 * (compact) and an interactive BrandSection. This suite proves the two core
 * correctness properties: (1) the embedded components work — assignment via
 * row click, creation via the manager's own editor dialog, brand search/
 * select/create; (2) no interaction disturbs unrelated unsaved product
 * fields.
 */
vi.mock('../../services/brands', () => ({
  createBrand: vi.fn(),
  listBrands: vi.fn(),
}))
vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(),
  fetchCategoryTree: vi.fn(),
  reorderCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listCategories: vi.fn(),
}))
vi.mock('../../services/variants', () => ({
  deleteVariant: vi.fn(),
}))
vi.mock('./product-description-editor', () => ({
  ProductDescriptionEditor: () => <div data-testid="description-editor-stub" />,
}))

import { createBrand, listBrands } from '../../services/brands'
import { createCategory, fetchCategoryTree } from '../../services/categories'

const tree: CategoryTreeNode[] = [
  {
    id: 'c1',
    name: 'کیبورد و ماوس',
    slug: 'kybvrd-v-mavs',
    parentId: null,
    sortOrder: 0,
    isVisible: true,
    productCount: 5,
    children: [
      {
        id: 'c1-1',
        name: 'کیبورد مکانیکال',
        slug: 'kybvrd-mkanykal',
        parentId: 'c1',
        sortOrder: 0,
        isVisible: true,
        productCount: 2,
        children: [],
      },
    ],
  },
]

const brandsList = {
  items: [
    { id: 'b1', name: 'پرودو', slug: 'porodo', description: null, isFeatured: false, nameEn: 'Porodo' },
  ],
  total: 1,
  page: 1,
  limit: 100,
}
const newBrand: BrandSummary = {
  id: 'brand-new', name: 'برند تازه', slug: 'brnd-tazh', description: null, isFeatured: false, nameEn: null,
}
const newCategory: CategoryDetail = {
  id: 'cat-new', name: 'دسته تازه', slug: 'dsth-tazh', parentId: null, sortOrder: 1, isVisible: true, children: [],
}

function renderEditor() {
  return render(
    <MemoryRouter>
      <ProductEditor product={null} onSaved={vi.fn()} onCancel={vi.fn()} />
    </MemoryRouter>,
  )
}

async function fillProductBasics() {
  // The embedded tree loads asynchronously — wait for real content first.
  await screen.findByRole('treeitem', { name: /کیبورد و ماوس/ })
  fireEvent.input(screen.getByRole('textbox', { name: 'نام محصول' }), {
    target: { value: 'محصول آزمونی SS255' },
  })
  fireEvent.input(screen.getByRole('textbox', { name: 'گارانتی' }), {
    target: { value: '۲۴ ماهه' },
  })
}

function expectUnrelatedFieldsPreserved() {
  expect((screen.getByRole('textbox', { name: 'نام محصول' }) as HTMLInputElement).value).toBe(
    'محصول آزمونی SS255',
  )
  expect((screen.getByRole('textbox', { name: 'گارانتی' }) as HTMLInputElement).value).toBe('۲۴ ماهه')
}

describe('ProductEditor embedded category + brand sections (SS-255 revision)', () => {
  beforeEach(() => {
    vi.mocked(fetchCategoryTree).mockResolvedValue(tree)
    vi.mocked(listBrands).mockResolvedValue(brandsList)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('assigns a category by clicking its tree row, with a visible assignment banner', async () => {
    renderEditor()
    await fillProductBasics()
    fireEvent.click(screen.getByRole('treeitem', { name: /کیبورد و ماوس/ }))
    await waitFor(() => expect(screen.getByText(/دسته منتخب:/)).toBeTruthy())
    expectUnrelatedFieldsPreserved()
  })

  it('creates a category through the manager editor and adopts it for the product', async () => {
    // Stateful mocks: the flag flips BEFORE onSuccess so the manager's
    // refetch sees the tree containing the created node (server truth).
    let categoryCreated = false
    vi.mocked(createCategory).mockImplementation(async () => {
      categoryCreated = true
      return newCategory
    })
    vi.mocked(fetchCategoryTree).mockImplementation(async () =>
      categoryCreated
        ? [
            ...tree,
            {
              id: 'cat-new', name: 'دسته تازه', slug: 'dsth-tazh', parentId: null,
              sortOrder: 1, isVisible: true, productCount: 0, children: [],
            },
          ]
        : tree,
    )
    renderEditor()
    await fillProductBasics()

    // Open the manager's own create dialog and submit a valid category.
    fireEvent.click(screen.getByRole('button', { name: /افزودن دسته بندی/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'دسته تازه' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(createCategory).toHaveBeenCalled())

    // The created category is assigned to the product and visible in the tree.
    await waitFor(() => expect(screen.getAllByText(/دسته منتخب:/).length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getAllByText('دسته تازه').length).toBeGreaterThan(0))
    expectUnrelatedFieldsPreserved()
  })

  it('searches brands, selects by click, and preserves the form', async () => {
    renderEditor()
    await fillProductBasics()
    const search = screen.getByRole('textbox', { name: 'جستجوی برند' })
    fireEvent.input(search, { target: { value: 'پرودو' } })
    fireEvent.click(screen.getByRole('option', { name: /پرودو/ }))
    await waitFor(() => expect(screen.getByText('برند منتخب')).toBeTruthy())
    expectUnrelatedFieldsPreserved()
  })

  it('creates a brand inline and selects it immediately, preserving the form', async () => {
    let brandCreated = false
    vi.mocked(createBrand).mockImplementation(async () => {
      brandCreated = true
      return newBrand
    })
    vi.mocked(listBrands).mockImplementation(async () =>
      brandCreated
        ? { ...brandsList, items: [...brandsList.items, newBrand] }
        : brandsList,
    )
    renderEditor()
    await fillProductBasics()

    fireEvent.click(screen.getByRole('button', { name: /برند جدید/ }))
    const nameBoxes = screen.getAllByRole('textbox', { name: 'نام' })
    // The inline creation form's name field is the last one rendered.
    fireEvent.input(nameBoxes[nameBoxes.length - 1]!, {
      target: { value: 'برند تازه' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره برند' }))
    await waitFor(() => expect(createBrand).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('برند منتخب')).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /برند تازه/ }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    )
    expectUnrelatedFieldsPreserved()
  })

  it('keeps the brand creation form open with the Persian 409 message and intact input', async () => {
    vi.mocked(createBrand).mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        message: 'یک برند با این slug قبلاً وجود دارد.',
        error: 'Conflict',
      }),
    )
    renderEditor()
    await fillProductBasics()
    fireEvent.click(screen.getByRole('button', { name: /برند جدید/ }))
    // Scope to the inline creation form (the product form has its own slug field).
    const form = within(screen.getByTestId('brand-create-form'))
    fireEvent.input(form.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'پرودو' },
    })
    fireEvent.input(form.getByRole('textbox', { name: 'نشانی (Slug)' }), {
      target: { value: 'porodo' },
    })
    fireEvent.click(form.getByRole('button', { name: 'ذخیره برند' }))
    // Message renders twice by design (conflict line + form ErrorMessage).
    expect(
      await screen.findAllByText('یک برند با این slug قبلاً وجود دارد.'),
    ).toHaveLength(2)
    // Inline form still open with values intact; retry possible.
    expect(form.getByRole('button', { name: 'ذخیره برند' })).toBeTruthy()
    expect((form.getByRole('textbox', { name: 'نام' }) as HTMLInputElement).value).toBe('پرودو')
    expectUnrelatedFieldsPreserved()
  })
})
