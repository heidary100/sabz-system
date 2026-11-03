import { useCallback, useMemo, useState } from 'react'
import type {
  CatalogGridBatchRowInput,
  CatalogGridRowResult,
  PriceStatus,
} from '@sabz/types'
import { batchUpdateCatalogGrid } from '../services/catalog-grid'

/**
 * Client editing model for the SS-257 catalog grid.
 *
 * Server-loaded values and unsaved drafts are strictly separate: a row only
 * has a draft when the operator touched an editable field, and the draft
 * records the `expectedUpdatedAt` token the row was loaded with (the batch
 * write is conditional on it). Cancel/discard is a pure client-side state
 * drop — no request is issued, so the server and database are provably
 * untouched. Saving is explicit and chunks drafts into ≤50-row requests;
 * every row keeps its own status so partial failures stay recoverable.
 */

export type CatalogRowStatus =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'validation-error'
  | 'conflict-changed'
  | 'conflict-locked'
  | 'not-found'

export interface CatalogRowDraft {
  /** Row version the edit started from — the batch write is conditional on it. */
  baseUpdatedAt: string
  price?: string
  /** `null` = the operator explicitly cleared the sale price. */
  compareAtPrice?: string | null
  /** Integer-as-string input state (empty string = invalid, reported on save). */
  stock?: string
}

export interface CatalogRowServerValues {
  price: string
  compareAtPrice: string | null
  stock: number
  priceStatus: PriceStatus
}

export interface SaveOutcome {
  results: CatalogGridRowResult[]
  requestError: unknown | null
}

const GRID_PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/
const GRID_STOCK_PATTERN = /^\d+$/
const BATCH_CHUNK_SIZE = 50

/** Rows that an explicit «ذخیره» submits: touched or locally-corrected rows. */
const SUBMITTABLE: readonly CatalogRowStatus[] = ['dirty', 'validation-error']

/** Rows that failed and need per-row resolution (dialog/retry), not blind resubmit. */
const FAILED: readonly CatalogRowStatus[] = [
  'validation-error',
  'conflict-changed',
  'conflict-locked',
  'not-found',
]

const LOCAL_FIELD_ERRORS: Record<string, string> = {
  price: 'قالب قیمت معتبر نیست؛ حداکثر ۲ رقم اعشار.',
  compareAtPrice: 'قالب قیمت فروش ویژه معتبر نیست؛ حداکثر ۲ رقم اعشار.',
  stock: 'موجودی باید عدد صحیح نامنفی باشد.',
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function useCatalogDrafts() {
  const [drafts, setDrafts] = useState<Record<string, CatalogRowDraft>>({})
  const [statuses, setStatuses] = useState<Record<string, CatalogRowStatus>>({})
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState(false)

  const setStatus = useCallback((variantId: string, status: CatalogRowStatus) => {
    setStatuses((prev) => ({ ...prev, [variantId]: status }))
  }, [])

  const dropRow = useCallback((variantId: string) => {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[variantId]
      return next
    })
    setStatuses((prev) => {
      const next = { ...prev }
      delete next[variantId]
      return next
    })
    setErrors((prev) => {
      const next = { ...prev }
      delete next[variantId]
      return next
    })
  }, [])

  const editCell = useCallback(
    (
      row: CatalogRowServerValues & { variantId: string; expectedUpdatedAt: string },
      field: 'price' | 'compareAtPrice' | 'stock',
      rawValue: string,
    ): void => {
      let canonical: string | null | undefined
      if (field === 'price') {
        canonical = rawValue.replace(/[^\d.]/g, '')
      } else if (field === 'compareAtPrice') {
        const cleaned = rawValue.replace(/[^\d.]/g, '')
        canonical = cleaned === '' ? null : cleaned
      } else {
        canonical = rawValue.replace(/[^\d]/g, '')
      }

      setDrafts((prev) => {
        const existing: CatalogRowDraft = prev[row.variantId] ?? {
          baseUpdatedAt: row.expectedUpdatedAt,
        }
        const next: CatalogRowDraft = { ...existing, baseUpdatedAt: row.expectedUpdatedAt }
        if (field === 'price') {
          next.price = canonical as string
        } else if (field === 'compareAtPrice') {
          next.compareAtPrice = canonical as string | null
        } else {
          next.stock = canonical as string
        }

        // A draft exists only for values that differ from the server row:
        // reverting a cell to its loaded value drops it from the draft, and
        // a fully-reverted row becomes clean again (no no-op saves).
        const serverPrice = row.price
        const serverCompareAt = row.compareAtPrice
        const serverStock = String(row.stock)
        if (next.price !== undefined && next.price === serverPrice) {
          delete next.price
        }
        if (next.compareAtPrice !== undefined) {
          const matchesServer =
            next.compareAtPrice === null
              ? serverCompareAt === null
              : serverCompareAt !== null && next.compareAtPrice === serverCompareAt
          if (matchesServer) {
            delete next.compareAtPrice
          }
        }
        if (next.stock !== undefined && next.stock === serverStock) {
          delete next.stock
        }
        if (
          next.price === undefined &&
          next.compareAtPrice === undefined &&
          next.stock === undefined
        ) {
          const nextDrafts = { ...prev }
          delete nextDrafts[row.variantId]
          return nextDrafts
        }
        return { ...prev, [row.variantId]: next }
      })

      setStatus(row.variantId, 'dirty')
      setErrors((prev) => {
        const next = { ...prev }
        delete next[row.variantId]
        return next
      })
    },
    [setStatus],
  )

  const discardAll = useCallback((): void => {
    // Zero-drift cancel: pure client-side reset, nothing is sent anywhere.
    setDrafts({})
    setStatuses({})
    setErrors({})
  }, [])

  const discardRow = useCallback(dropRow, [dropRow])

  const resolveConflictRow = useCallback(
    (variantId: string, mode: 'keep' | 'drop'): void => {
      if (mode === 'drop') {
        dropRow(variantId)
        return
      }
      setStatus(variantId, 'dirty')
    },
    [dropRow, setStatus],
  )

  const buildRowInput = useCallback(
    (
      variantId: string,
      draft: CatalogRowDraft,
    ): { input: CatalogGridBatchRowInput } | { invalid: Record<string, string> } => {
      const input: CatalogGridBatchRowInput = {
        variantId,
        expectedUpdatedAt: draft.baseUpdatedAt,
      }
      const invalid: Record<string, string> = {}
      if (draft.price !== undefined) {
        if (GRID_PRICE_PATTERN.test(draft.price)) {
          input.price = draft.price
        } else {
          invalid.price = LOCAL_FIELD_ERRORS.price!
        }
      }
      if (draft.compareAtPrice !== undefined) {
        if (draft.compareAtPrice === null || GRID_PRICE_PATTERN.test(draft.compareAtPrice)) {
          input.compareAtPrice = draft.compareAtPrice
        } else {
          invalid.compareAtPrice = LOCAL_FIELD_ERRORS.compareAtPrice!
        }
      }
      if (draft.stock !== undefined) {
        if (GRID_STOCK_PATTERN.test(draft.stock)) {
          input.stock = Number(draft.stock)
        } else {
          invalid.stock = LOCAL_FIELD_ERRORS.stock!
        }
      }
      if (Object.keys(invalid).length > 0) {
        return { invalid }
      }
      // A row whose only content was reverted (nothing left to send) still
      // produces a structurally valid, field-less request row — the API
      // accepts it as a no-op success.
      return { input }
    },
    [],
  )

  const applyResults = useCallback(
    (results: CatalogGridRowResult[]): void => {
      for (const result of results) {
        if (result.outcome === 'SUCCESS') {
          dropRow(result.variantId)
          setStatuses((prev) => ({ ...prev, [result.variantId]: 'saved' }))
          continue
        }
        setStatuses((prev) => ({ ...prev, [result.variantId]: statusOf(result.outcome) }))
        if (result.fieldErrors !== undefined || result.message !== undefined) {
          setErrors((prev) => ({
            ...prev,
            [result.variantId]: result.fieldErrors ?? { _: result.message ?? '' },
          }))
        }
      }
    },
    [dropRow, setStatuses],
  )

  const saveRows = useCallback(
    async (variantIds: string[]): Promise<SaveOutcome> => {
      const results: CatalogGridRowResult[] = []
      const invalidErrors: Record<string, Record<string, string>> = {}
      const validInputs: CatalogGridBatchRowInput[] = []

      for (const id of variantIds) {
        const draft = drafts[id]
        if (!draft) {
          continue
        }
        const built = buildRowInput(id, draft)
        if ('invalid' in built) {
          invalidErrors[id] = built.invalid
          continue
        }
        validInputs.push(built.input)
      }

      const invalidIds = Object.keys(invalidErrors)
      setSaving(true)
      for (const id of [...validInputs.map((row) => row.variantId), ...invalidIds]) {
        setStatus(id, 'saving')
      }
      if (invalidIds.length > 0) {
        // Locally-invalid rows never reach the API: their drafts and errors
        // stay in place so the operator can correct the exact field.
        setErrors((prev) => ({ ...prev, ...invalidErrors }))
        for (const id of invalidIds) {
          setStatus(id, 'validation-error')
        }
        results.push(
          ...invalidIds.map((variantId) => ({
            variantId,
            outcome: 'VALIDATION_ERROR' as const,
            fieldErrors: invalidErrors[variantId],
          })),
        )
      }

      let requestError: unknown = null
      const inFlight: string[] = []
      try {
        for (const requestChunk of chunk(validInputs, BATCH_CHUNK_SIZE)) {
          for (const row of requestChunk) {
            setStatus(row.variantId, 'saving')
          }
          inFlight.push(...requestChunk.map((row) => row.variantId))
          const response = await batchUpdateCatalogGrid({ rows: requestChunk })
          applyResults(response.results)
          results.push(...response.results)
        }
      } catch (caught) {
        // Request-level failure (network/400/401/…): the rows still holding a
        // `saving` status belong to the rejected in-flight request — return
        // them to dirty with their drafts intact.
        requestError = caught
        for (const id of inFlight) {
          setStatus(id, 'dirty')
        }
      } finally {
        setSaving(false)
      }
      return { results, requestError }
    },
    [applyResults, buildRowInput, drafts, setStatus],
  )

  const saveAll = useCallback((): Promise<SaveOutcome> => {
    // Explicit save submits touched + locally-invalid rows; failed rows that
    // need per-row resolution (conflict/locked/not-found) are excluded —
    // they resolve through the conflict dialog or the retry action.
    const submittableIds = Object.keys(drafts).filter((id) =>
      SUBMITTABLE.includes(statuses[id] ?? 'dirty'),
    )
    return saveRows(submittableIds)
  }, [drafts, saveRows, statuses])

  const stats = useMemo(() => {
    const values = Object.values(statuses)
    const dirtyCount = Object.keys(drafts).length
    const savingCount = values.filter((status) => status === 'saving').length
    const failedCount = values.filter(
      (status) => FAILED.includes(status as CatalogRowStatus),
    ).length
    const succeededCount = values.filter((status) => status === 'saved').length
    return { dirtyCount, savingCount, failedCount, succeededCount }
  }, [drafts, statuses])

  return {
    drafts,
    statuses,
    errors,
    saving,
    ...stats,
    hasDirty: stats.dirtyCount > 0,
    editCell,
    discardAll,
    discardRow,
    resolveConflictRow,
    saveRows,
    saveAll,
  }
}

function statusOf(outcome: CatalogGridRowResult['outcome']): CatalogRowStatus {
  switch (outcome) {
    case 'SUCCESS':
      return 'saved'
    case 'VALIDATION_ERROR':
      return 'validation-error'
    case 'CONFLICT_CHANGED':
      return 'conflict-changed'
    case 'CONFLICT_LOCKED':
      return 'conflict-locked'
    case 'NOT_FOUND':
      return 'not-found'
  }
}
