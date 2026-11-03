// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogGridRowResult } from '@sabz/types'
import { useCatalogDrafts } from './use-catalog-drafts'
import type { SaveOutcome } from './use-catalog-drafts'
import type { CatalogGridBatchResponse } from '@sabz/types'

/**
 * SS-257 client editing model: drafts are separate from server values, the
 * explicit save chunks into ≤50-row requests, per-row outcomes drive the row
 * status, and discard is a pure client-side reset that never calls the API.
 */
vi.mock('../services/catalog-grid', () => ({
  listCatalogGrid: vi.fn(),
  batchUpdateCatalogGrid: vi.fn(),
}))

import { batchUpdateCatalogGrid } from '../services/catalog-grid'

const mockBatch = vi.mocked(batchUpdateCatalogGrid)

const BASE_TOKEN = '2026-11-03T10:00:00.000Z'

const serverRow = {
  variantId: 'v1',
  expectedUpdatedAt: BASE_TOKEN,
  price: '100000',
  compareAtPrice: null as string | null,
  stock: 5,
  priceStatus: 'PRICED' as const,
}

beforeEach(() => {
  mockBatch.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

type DraftsHook = ReturnType<typeof useCatalogDrafts>
type DraftsHookRender = { result: { current: DraftsHook } }

function edit(hook: DraftsHookRender, overrides: Partial<typeof serverRow> = {}) {
  const row = { ...serverRow, ...overrides }
  return {
    price: (value: string) =>
      act(() => hook.result.current.editCell(row, 'price', value)),
    compareAt: (value: string) =>
      act(() => hook.result.current.editCell(row, 'compareAtPrice', value)),
    stock: (value: string) =>
      act(() => hook.result.current.editCell(row, 'stock', value)),
  }
}

describe('useCatalogDrafts', () => {
  it('creates a draft on edit and drops it when the value reverts to the server value', () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cells = edit(hook)

    cells.price('150000')
    expect(hook.result.current.drafts['v1']).toMatchObject({ price: '150000', baseUpdatedAt: BASE_TOKEN })
    expect(hook.result.current.hasDirty).toBe(true)

    // Reverting to the loaded value removes the draft entirely — no no-op saves.
    cells.price('100000')
    expect(hook.result.current.drafts['v1']).toBeUndefined()
    expect(hook.result.current.hasDirty).toBe(false)
  })

  it('treats an emptied compareAt cell as an explicit clear (null) draft', () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cells = edit(hook, { compareAtPrice: '120000' })

    cells.compareAt('')
    expect(hook.result.current.drafts['v1']?.compareAtPrice).toBeNull()
  })

  it('keeps separate baseUpdatedAt per row for optimistic concurrency', () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cellsA = edit(hook, { variantId: 'v1' })
    const cellsB = edit(hook, {
      variantId: 'v2',
      expectedUpdatedAt: '2026-11-03T09:00:00.000Z',
    })
    cellsA.price('111111')
    cellsB.price('222222')
    expect(hook.result.current.drafts['v1']?.baseUpdatedAt).toBe(BASE_TOKEN)
    expect(hook.result.current.drafts['v2']?.baseUpdatedAt).toBe('2026-11-03T09:00:00.000Z')
  })

  it('reports locally-invalid rows without calling the API', async () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cells = edit(hook)
    cells.stock('7')
    // Force an invalid shape: price with 3 decimals is filtered at input, so
    // simulate by editing then checking the local validation path directly.
    act(() => {
      hook.result.current.editCell({ ...serverRow, stock: 5 }, 'stock', '')
    })

    let outcome!: SaveOutcome
    await act(async () => {
      outcome = await hook.result.current.saveAll()
    })

    expect(mockBatch).not.toHaveBeenCalled()
    expect(outcome.results[0]!.outcome).toBe('VALIDATION_ERROR')
    expect(hook.result.current.statuses['v1']).toBe('validation-error')
    expect(hook.result.current.failedCount).toBe(1)
  })

  it('chunks more than 50 dirty rows into ≤50-row requests', async () => {
    const hook = renderHook(() => useCatalogDrafts())
    for (let index = 0; index < 60; index += 1) {
      const id = `row-${index}`
      act(() => {
        hook.result.current.editCell(
          { variantId: id, expectedUpdatedAt: BASE_TOKEN, price: '100000', compareAtPrice: null, stock: 5, priceStatus: 'PRICED' },
          'price',
          `${200000 + index}`,
        )
      })
    }
    mockBatch.mockResolvedValue({
      results: [],
      summary: { succeeded: 0, failed: 0 },
    } as CatalogGridBatchResponse)

    await act(async () => {
      await hook.result.current.saveAll()
    })

    expect(mockBatch).toHaveBeenCalledTimes(2)
    const firstCall = mockBatch.mock.calls[0]![0]!
    const secondCall = mockBatch.mock.calls[1]![0]!
    expect(firstCall.rows.length).toBe(50)
    expect(secondCall.rows.length).toBe(10)
    // Each row echoes the token it was loaded with.
    expect(firstCall.rows[0]!.expectedUpdatedAt).toBe(BASE_TOKEN)
  })

  it('reconciles SUCCESS rows (draft cleared) and keeps failed drafts recoverable', async () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cellsA = edit(hook, { variantId: 'v1' })
    const cellsB = edit(hook, { variantId: 'v2' })
    cellsA.price('150000')
    cellsB.price('999999')

    const newToken = '2026-11-03T11:00:00.000Z'
    const results: CatalogGridRowResult[] = [
      {
        variantId: 'v1',
        outcome: 'SUCCESS',
        price: '150000',
        compareAtPrice: null,
        updatedAt: newToken,
        stock: 5,
      },
      {
        variantId: 'v2',
        outcome: 'VALIDATION_ERROR',
        message: 'قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.',
        fieldErrors: { compareAtPrice: 'قیمت فروش ویژه باید بیشتر از قیمت فروش باشد.' },
      },
    ]
    mockBatch.mockResolvedValue({ results, summary: { succeeded: 1, failed: 1 } } as CatalogGridBatchResponse)

    await act(async () => {
      await hook.result.current.saveAll()
    })

    expect(hook.result.current.statuses['v1']).toBe('saved')
    expect(hook.result.current.drafts['v1']).toBeUndefined()
    // Failed draft survives for correction — never silently lost.
    expect(hook.result.current.drafts['v2']).toMatchObject({ price: '999999' })
    expect(hook.result.current.statuses['v2']).toBe('validation-error')
    expect(hook.result.current.errors['v2']?.compareAtPrice).toContain('بیشتر')
    // A successful row is not resubmitted on the next save.
    await act(async () => {
      await hook.result.current.saveAll()
    })
    expect(mockBatch).toHaveBeenCalledTimes(2)
    const retryRows = mockBatch.mock.calls[1]![0]!.rows
    expect(retryRows.some((row) => row.variantId === 'v1')).toBe(false)
    expect(retryRows.some((row) => row.variantId === 'v2')).toBe(true)
  })

  it('keeps conflict rows out of blind resubmission and lets the operator resolve them', async () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cells = edit(hook)
    cells.price('150000')
    mockBatch.mockResolvedValue({
      results: [{ variantId: 'v1', outcome: 'CONFLICT_CHANGED', message: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.' }],
      summary: { succeeded: 0, failed: 1 },
    } as CatalogGridBatchResponse)

    await act(async () => {
      await hook.result.current.saveAll()
    })
    expect(hook.result.current.statuses['v1']).toBe('conflict-changed')

    // Explicit save does not resubmit conflict rows…
    await act(async () => {
      await hook.result.current.saveAll()
    })
    expect(mockBatch).toHaveBeenCalledTimes(1)

    // …the operator explicitly drops the draft instead.
    act(() => {
      hook.result.current.resolveConflictRow('v1', 'drop')
    })
    expect(hook.result.current.drafts['v1']).toBeUndefined()
    expect(hook.result.current.statuses['v1']).toBeUndefined()
  })

  it('discardAll is a pure client-side reset: zero API calls, state fully cleared', async () => {
    const hook = renderHook(() => useCatalogDrafts())
    const cells = edit(hook)
    cells.price('150000')
    cells.stock('42')
    expect(hook.result.current.hasDirty).toBe(true)

    act(() => {
      hook.result.current.discardAll()
    })

    expect(hook.result.current.drafts).toEqual({})
    expect(hook.result.current.statuses).toEqual({})
    expect(hook.result.current.errors).toEqual({})
    expect(hook.result.current.hasDirty).toBe(false)
    expect(mockBatch).not.toHaveBeenCalled()
  })
})
