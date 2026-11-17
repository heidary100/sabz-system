// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BrandSummary,
  CategoryTreeNode,
  MerchMediaListResponse,
  MerchMediaSummaryDto,
  PaginatedResult,
  ProductSummary,
} from '@sabz/types'
import { CampaignProductPickerDialog } from './campaign-product-picker-dialog'
import { CampaignCategoryPickerDialog } from './campaign-category-picker-dialog'
import { CampaignBrandPickerDialog } from './campaign-brand-picker-dialog'
import { CampaignMediaPickerDialog } from './campaign-media-picker-dialog'
import { listProducts } from '../../../services/products'
import { fetchCategoryTree } from '../../../services/categories'
import { listBrands } from '../../../services/brands'
import { listMerchMedia } from '../../../services/merchandising'

vi.mock('../../../services/products', () => ({ listProducts: vi.fn() }))
vi.mock('../../../services/categories', () => ({ fetchCategoryTree: vi.fn() }))
vi.mock('../../../services/brands', () => ({ listBrands: vi.fn() }))
vi.mock('../../../services/merchandising', () => ({ listMerchMedia: vi.fn() }))
vi.mock('../merch-media-thumbnail', () => ({
  MerchMediaThumbnail: () => <div data-testid="media-thumbnail" />,
}))

const mockProducts = vi.mocked(listProducts)
const mockTree = vi.mocked(fetchCategoryTree)
const mockBrands = vi.mocked(listBrands)
const mockMedia = vi.mocked(listMerchMedia)

const product: ProductSummary = {
  id: 'product-1',
  name: 'محصول آزمایشی',
  slug: 'test-product',
  condition: 'NEW',
  status: 'PUBLISHED',
  brand: {
    id: 'brand-1',
    name: 'برند آزمایشی',
    slug: 'test-brand',
    description: null,
    isFeatured: false,
    nameEn: null,
  },
  category: {
    id: 'category-1',
    name: 'دسته آزمایشی',
    slug: 'test-category',
    parentId: null,
    sortOrder: 0,
    isVisible: true,
  },
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

const categoryTree: CategoryTreeNode[] = [
  {
    id: 'category-parent',
    name: 'دسته مادر',
    slug: 'parent',
    parentId: null,
    sortOrder: 0,
    isVisible: true,
    productCount: 2,
    children: [
      {
        id: 'category-child',
        name: 'زیردسته',
        slug: 'child',
        parentId: 'category-parent',
        sortOrder: 0,
        isVisible: true,
        productCount: 1,
        children: [],
      },
    ],
  },
  {
    id: 'category-hidden',
    name: 'دسته پنهان',
    slug: 'hidden',
    parentId: null,
    sortOrder: 1,
    isVisible: false,
    productCount: 0,
    children: [],
  },
]

const brand: BrandSummary = {
  id: 'brand-1',
  name: 'برند آزمایشی',
  slug: 'test-brand',
  description: null,
  isFeatured: false,
  nameEn: null,
}

const media: MerchMediaSummaryDto = {
  id: 'media-1',
  originalName: 'hero.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  width: 1200,
  height: 800,
  altFa: null,
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

function page<T>(items: T[]): PaginatedResult<T> {
  return { items, total: items.length, page: 1, limit: 20 }
}

describe('campaign entity pickers (SS-275)', () => {
  beforeEach(() => {
    mockProducts.mockReset()
    mockTree.mockReset()
    mockBrands.mockReset()
    mockMedia.mockReset()
    mockProducts.mockResolvedValue(page([product]))
    mockTree.mockResolvedValue(categoryTree)
    mockBrands.mockResolvedValue(page([brand]))
    mockMedia.mockResolvedValue(page([media]) as MerchMediaListResponse)
  })

  afterEach(cleanup)

  it('searches PUBLISHED products and adds a selected product', async () => {
    const onPick = vi.fn()
    render(
      <CampaignProductPickerDialog
        open
        selectedIds={[]}
        maxReached={false}
        onPick={onPick}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('محصول آزمایشی')).toBeTruthy()
    expect(mockProducts).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
      status: 'PUBLISHED',
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    expect(onPick).toHaveBeenCalledWith(product)

    fireEvent.change(screen.getByLabelText('جستجوی محصول'), {
      target: { value: 'تست' },
    })
    await waitFor(() =>
      expect(mockProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'تست', status: 'PUBLISHED' }),
      ),
    )
  })

  it('disables adding products when the association limit is reached', async () => {
    render(
      <CampaignProductPickerDialog
        open
        selectedIds={[]}
        maxReached
        onPick={() => {}}
        onClose={() => {}}
      />,
    )

    const button = await screen.findByRole('button', {
      name: 'محدودیت تکمیل است',
    })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('preserves category hierarchy and blocks invisible categories', async () => {
    const onPick = vi.fn()
    render(
      <CampaignCategoryPickerDialog
        open
        selectedIds={[]}
        maxReached={false}
        onPick={onPick}
        onClose={() => {}}
      />,
    )

    const parentRow = (await screen.findByText('دسته مادر')).closest('li')!
    const childRow = screen.getByText('زیردسته').closest('li')!
    const rows = screen.getAllByRole('listitem')
    expect(rows.indexOf(parentRow)).toBeLessThan(rows.indexOf(childRow))
    fireEvent.click(within(parentRow).getByRole('button', { name: 'افزودن' }))
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'category-parent' }),
    )

    const hiddenRow = screen.getByText('دسته پنهان').closest('li')!
    expect(
      (
        within(hiddenRow).getByRole('button', {
          name: 'غیرقابل انتخاب',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('paginates brands without inventing a search field', async () => {
    const onPick = vi.fn()
    render(
      <CampaignBrandPickerDialog
        open
        selectedIds={[]}
        maxReached={false}
        onPick={onPick}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('برند آزمایشی')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(mockBrands).toHaveBeenCalledWith({ page: 1, limit: 20 })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    expect(onPick).toHaveBeenCalledWith(brand)
  })

  it('shows all media statuses for assignment and picks authenticated media', async () => {
    const onPick = vi.fn()
    render(
      <CampaignMediaPickerDialog
        open
        maxReached={false}
        onPick={onPick}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('hero.png')).toBeTruthy()
    expect(screen.getByText('منتشرنشده')).toBeTruthy()
    expect(mockMedia).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: undefined,
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    expect(onPick).toHaveBeenCalledWith(media)
  })
})
