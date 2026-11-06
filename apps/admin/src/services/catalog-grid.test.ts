import { describe, expect, it } from 'vitest'
import { buildListQuery } from './catalog-grid'

/**
 * Pins the admin→API query contract for the SS-257 grid list. Every field
 * the hook offers must survive serialization with the DTO's exact param
 * names — this is the boundary the v2 rework silently broke (sort and the
 * advanced filters existed in the hook but never reached the HTTP query).
 */
describe('catalog-grid list query serialization (SS-257)', () => {
  it('serializes every supported filter with the DTO param names', () => {
    const qs = buildListQuery({
      search: 'انکر',
      sku: 'SKU-1',
      statuses: ['PUBLISHED', 'DRAFT'],
      categoryIds: ['c1', 'c2'],
      brandIds: ['b1'],
      priceStatus: 'PRICED',
      condition: 'NEW',
      minPrice: '100000',
      maxPrice: '900000',
      stockStatus: 'IN_STOCK',
      sortBy: 'price',
      sortDir: 'desc',
      page: 2,
      limit: 20,
    })
    const params = new URLSearchParams(qs.replace('/admin/catalog-grid?', ''))
    expect(params.get('search')).toBe('انکر')
    expect(params.get('sku')).toBe('SKU-1')
    expect(params.get('statuses')).toBe('PUBLISHED,DRAFT')
    expect(params.get('categoryIds')).toBe('c1,c2')
    expect(params.get('brandIds')).toBe('b1')
    expect(params.get('priceStatus')).toBe('PRICED')
    expect(params.get('condition')).toBe('NEW')
    expect(params.get('minPrice')).toBe('100000')
    expect(params.get('maxPrice')).toBe('900000')
    expect(params.get('stockStatus')).toBe('IN_STOCK')
    expect(params.get('sortBy')).toBe('price')
    expect(params.get('sortDir')).toBe('desc')
    expect(params.get('page')).toBe('2')
    expect(params.get('limit')).toBe('20')
  })

  it('omits empty filters and keeps the bare path when nothing is set', () => {
    expect(buildListQuery({})).toBe('/admin/catalog-grid')
    expect(buildListQuery({ statuses: [], brandIds: [], minPrice: '' })).toBe(
      '/admin/catalog-grid',
    )
  })

  it('keeps legacy single-value params working', () => {
    const qs = buildListQuery({ status: 'PUBLISHED', categoryId: 'c1', brandId: 'b1' })
    const params = new URLSearchParams(qs.replace('/admin/catalog-grid?', ''))
    expect(params.get('status')).toBe('PUBLISHED')
    expect(params.get('categoryId')).toBe('c1')
    expect(params.get('brandId')).toBe('b1')
  })
})
