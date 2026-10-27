// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryQuickCreateDialog } from './category-quick-create-dialog'
import type { CategoryDetail, CategoryTreeNode } from '@sabz/types'

/**
 * SS-255 inline category creation: name + parent («(ریشه)» = parentId null,
 * real parent = its id, sortOrder appended for end-of-siblings placement);
 * success hands the returned CategoryDetail to onSuccess; failures keep the
 * dialog open with values intact.
 */
vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(),
  fetchCategoryTree: vi.fn(),
}))

import { createCategory, fetchCategoryTree } from '../../services/categories'
import { ApiError } from '../../services/api'

const tree: CategoryTreeNode[] = [
  {
    id: 'c1',
    name: 'کیبورد و ماوس',
    slug: 'kybvrd-v-mavs',
    parentId: null,
    sortOrder: 0,
    isVisible: true,
    productCount: 5,
    children: [],
  },
]

const createdCategory: CategoryDetail = {
  id: 'cat-new',
  name: 'دسته آزمونی',
  slug: 'daste-azmvny',
  parentId: null,
  sortOrder: 1,
  isVisible: true,
  children: [],
}

function renderDialog(onSuccess = vi.fn()) {
  render(
    <CategoryQuickCreateDialog open onClose={vi.fn()} onSuccess={onSuccess} />,
  )
  return onSuccess
}

describe('CategoryQuickCreateDialog', () => {
  beforeEach(() => {
    vi.mocked(fetchCategoryTree).mockResolvedValue(tree)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('creates a root category (parentId null + end-of-siblings sortOrder)', async () => {
    vi.mocked(createCategory).mockResolvedValue(createdCategory)
    const onSuccess = renderDialog()
    // Wait for the tree fetch to land so sortOrder math sees the siblings.
    await screen.findByText('کیبورد و ماوس')
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'دسته آزمونی' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(createdCategory))
    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'دسته آزمونی',
        parentId: null,
        slug: 'dsth-azmvny',
        sortOrder: 1,
      }),
    )
  })

  it('sends the selected parent id when a parent is chosen', async () => {
    vi.mocked(createCategory).mockResolvedValue({
      ...createdCategory,
      parentId: 'c1',
      sortOrder: 0,
    })
    renderDialog()
    await screen.findByText('کیبورد و ماوس')
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'زیردسته' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'دسته بندی والد' }), {
      target: { value: 'c1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(createCategory).toHaveBeenCalled())
    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'c1', sortOrder: 0 }),
    )
  })

  it('keeps the dialog open with the Persian conflict message on 409', async () => {
    vi.mocked(createCategory).mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        message: 'یک دسته بندی با این slug قبلاً وجود دارد.',
        error: 'Conflict',
      }),
    )
    renderDialog()
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'کیبورد و ماوس' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    expect(
      await screen.findAllByText('یک دسته بندی با این slug قبلاً وجود دارد.'),
    ).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'افزودن' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'نام' }) as HTMLInputElement).value).toBe(
      'کیبورد و ماوس',
    )
  })

  it('disables submit while the name is empty (no API call possible)', () => {
    renderDialog()
    const submit = screen.getByRole('button', { name: 'افزودن' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('warns when the slug collides with an existing tree node', async () => {
    renderDialog()
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'کیبورد و ماوس' },
    })
    expect(await screen.findByText(/این نشانی قبلاً استفاده شده است/)).toBeTruthy()
  })
})
