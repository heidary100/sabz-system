import { describe, expect, it } from 'vitest'
import {
  STOREFRONT_URL,
  storefrontContextUrl,
  storefrontProductUrl,
} from './storefront-url'

describe('admin storefront links (SS-900 Part II)', () => {
  it('builds canonical product links from the configured origin', () => {
    expect(storefrontProductUrl('patriot-p220-1tb-ssd')).toBe(
      `${STOREFRONT_URL}/products/patriot-p220-1tb-ssd`,
    )
  })

  it('accepts only configured-origin http(s) context links', () => {
    expect(
      storefrontContextUrl(`${STOREFRONT_URL}/products/a?variant=v-1`),
    ).toBe(`${STOREFRONT_URL}/products/a?variant=v-1`)
    expect(storefrontContextUrl('https://evil.example/products/a')).toBeNull()
    expect(storefrontContextUrl('javascript:alert(1)')).toBeNull()
    expect(storefrontContextUrl(null)).toBeNull()
  })
})
