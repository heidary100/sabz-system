import { describe, expect, it } from 'vitest'
import { gridOutcomeMessage } from './grid-messages'
import type { CatalogGridRowResult } from '@sabz/types'

describe('catalog grid outcome messages (SS-257)', () => {
  it('prefers the API Persian message when present', () => {
    const result: CatalogGridRowResult = {
      variantId: 'v1',
      outcome: 'VALIDATION_ERROR',
      message: 'قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.',
    }
    expect(gridOutcomeMessage(result)).toBe(
      'قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.',
    )
  })

  it('gives a locked row a distinct message from a stale-version conflict', () => {
    const locked = gridOutcomeMessage({ variantId: 'v1', outcome: 'CONFLICT_LOCKED' })
    const changed = gridOutcomeMessage({ variantId: 'v1', outcome: 'CONFLICT_CHANGED' })
    expect(locked).toContain('قفل')
    expect(changed).not.toContain('قفل')
    expect(changed).toContain('تغییر کرده است')
  })

  it('covers every outcome with a non-empty fallback', () => {
    for (const outcome of ['SUCCESS', 'VALIDATION_ERROR', 'CONFLICT_CHANGED', 'CONFLICT_LOCKED', 'NOT_FOUND'] as const) {
      expect(gridOutcomeMessage({ variantId: 'v1', outcome }).length).toBeGreaterThan(0)
    }
  })
})
