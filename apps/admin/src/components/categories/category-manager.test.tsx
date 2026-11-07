// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryManager } from './category-manager'
import type { CategoryDetail, CategoryTreeNode } from '@sabz/types'

/**
 * SS-255 revision: CategoryManager is the single canonical category
 * experience. These tests pin the reuse contract: page variant keeps the
 * standalone page's behaviour (header, toolbar, tree), compact variant keeps
 * every interaction while driving a host-controlled selection, and creation
 * flows through the SAME editor dialog with the result reported to the host.
 */
vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(),
  fetchCategoryTree: vi.fn(),
  reorderCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))
vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { createCategory, fetchCategoryTree } from '../../services/categories'

const tree: CategoryTreeNode[] = [
  {
    id: 'c1',
    name: 'کیبورد و ماوس',
    slug: 'kybvrd-v-mavs',
    parentId: null,
    sortOrder: 0,
    isVisible: true,
    productCount: 3,
    children: [],
  },
  {
    id: 'c2',
    name: 'ابزارآلات',
    slug: 'abzaralat',
    parentId: null,
    sortOrder: 1,
    isVisible: true,
    productCount: 1,
    children: [],
  },
]

const created: CategoryDetail = {
  id: 'cat-new', name: 'دسته تازه', slug: 'dsth-tazh', parentId: null, sortOrder: 2, isVisible: true, children: [],
}

describe('CategoryManager (SS-255 revision)', () => {
  beforeEach(() => {
    vi.mocked(fetchCategoryTree).mockResolvedValue(tree)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('page variant renders the standalone page framing (header + toolbar + tree)', async () => {
    render(<MemoryRouter><CategoryManager variant="page" /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'دسته بندیها' })).toBeTruthy()
    expect(screen.getByRole('tree', { name: 'درخت دسته بندیها' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'جستجوی دسته بندی' })).toBeTruthy()
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)
  })

  it('compact variant keeps the full toolbar and tree without the page header', async () => {
    render(<CategoryManager variant="compact" />)
    await screen.findByRole('tree')
    expect(screen.queryByRole('heading', { name: 'دسته بندیها' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'جستجوی دسته بندی' })).toBeTruthy()
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)
  })

  it('drives the host selection from row clicks (stable node ids)', async () => {
    const onSelect = vi.fn()
    render(<CategoryManager variant="compact" selectedId={null} onSelect={onSelect} />)
    await screen.findByRole('treeitem', { name: /کیبورد و ماوس/ })
    fireEvent.click(screen.getByRole('treeitem', { name: /کیبورد و ماوس/ }))
    expect(onSelect).toHaveBeenCalledWith('c1')
    fireEvent.click(screen.getByRole('treeitem', { name: /ابزارآلات/ }))
    expect(onSelect).toHaveBeenCalledWith('c2')
  })

  it('highlights the controlled selection (assignment survives tree refetches)', async () => {
    const { rerender } = render(
      <CategoryManager variant="compact" selectedId="c2" onSelect={vi.fn()} />,
    )
    const row = await screen.findByRole('treeitem', { name: /ابزارآلات/ })
    expect(row.getAttribute('aria-selected')).toBe('true')
    // A refetch that reorders/must not clear the selection (id-based).
    vi.mocked(fetchCategoryTree).mockResolvedValue([...tree].reverse())
    rerender(<CategoryManager variant="compact" selectedId="c2" onSelect={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /ابزارآلات/ }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    )
  })

  it('creates through the SAME editor dialog and reports the created entity', async () => {
    vi.mocked(createCategory).mockResolvedValue(created)
    const onCreated = vi.fn()
    render(<CategoryManager variant="compact" selectedId={null} onSelect={vi.fn()} onCreated={onCreated} />)
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: /افزودن دسته بندی/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    fireEvent.input(screen.getByRole('textbox', { name: 'نام' }), {
      target: { value: 'دسته تازه' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    await waitFor(() => expect(createCategory).toHaveBeenCalled())
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })
})
