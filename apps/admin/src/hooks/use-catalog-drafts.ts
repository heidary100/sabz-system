import { useCallback, useMemo, useState } from 'react'
import type {
  CatalogGridBatchRowInput,
  CatalogGridRowResult,
  PriceStatus,
} from '@sabz/types'
import { batchUpdateCatalogGrid } from '../services/catalog-grid'

/**
 * Client editing model for the SS-257 products grid.
 *
 * Server-loaded values and unsaved drafts are strictly separate: a row only
 * has a draft when the operator touched an editable field, and the draft
 * records the `expectedUpdatedAt` token the row was loaded with (the batch
 * write is conditional on it). Cancel/discard is a pure client-side state
 * drop — no request is issued, so the server and database are provably
 * untouched. Saving is explicit and chunks drafts into ≤50-row requests;
 * every row keeps its own status so partial failures stay recoverable.
 *
 * SS-270 product-level fields (productName/brand/category): a product can
 * span several grid rows, so its edits live in a SEPARATE draft map keyed by
 * productId and displayed on EVERY row of that product. One row — the
 * "carrier", the last row the operator touched — carries the product fields
 * in the batch, guarded by the product's own `expectedProductUpdatedAt`
 * token; the server rejects a second concurrent carrier with a per-row
 * conflict, so the client never sends two.
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

export type CatalogEditableField =
  | 'price'
  | 'compareAtPrice'
  | 'stock'
  | 'sku'
  | 'barcode'
  | 'variantName'
  | 'priceStatus'

export type CatalogProductEditableField = 'productName' | 'brandId' | 'categoryId'

export interface CatalogRowDraft {
  /** Row version the edit started from — the batch write is conditional on it. */
  baseUpdatedAt: string
  price?: string
  /** `null` = the operator explicitly cleared the sale price. */
  compareAtPrice?: string | null
  /** Integer-as-string input state (empty string = invalid, reported on save). */
  stock?: string
  sku?: string
  /** `null` = explicitly cleared. */
  barcode?: string | null
  /** `null` = explicitly cleared. */
  variantName?: string | null
  priceStatus?: PriceStatus
}

export interface CatalogRowServerValues {
  sku: string
  barcode: string | null
  variantName: string | null
  price: string
  compareAtPrice: string | null
  stock: number
  priceStatus: PriceStatus
}

export interface CatalogProductServerValues {
  productId: string
  productName: string
  /** null = no brand assigned. */
  brandId: string | null
  categoryId: string
  /** The product's own concurrency token (SS-270). */
  productUpdatedAt: string
}

export interface CatalogProductDraft {
  productId: string
  /** The row that will carry the product fields in the batch. */
  carrierVariantId: string
  /** The carrier row's variant token, captured at edit time. Unused by the
   * server for product-only rows (the variant write is skipped) but still
   * required by the DTO. */
  carrierExpectedUpdatedAt: string
  baseProductUpdatedAt: string
  productName?: string
  /** `null` = explicitly cleared the brand. */
  brandId?: string | null
  categoryId?: string
}

export interface SaveOutcome {
  results: CatalogGridRowResult[]
  requestError: unknown | null
}

const GRID_PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/
const GRID_STOCK_PATTERN = /^\d+$/
const SKU_MAX = 64
const BARCODE_MAX = 64
const VARIANT_NAME_MAX = 255
const PRODUCT_NAME_MAX = 255
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

export const LOCAL_FIELD_ERRORS: Record<string, string> = {
  price: 'قالب قیمت معتبر نیست؛ حداکثر ۲ رقم اعشار.',
  compareAtPrice: 'قالب قیمت فروش ویژه معتبر نیست؛ حداکثر ۲ رقم اعشار.',
  stock: 'موجودی باید عدد صحیح نامنفی باشد.',
  sku: `شناسه کالا الزامی است و حداکثر ${SKU_MAX} کاراکتر است.`,
  barcode: `بارکد حداکثر ${BARCODE_MAX} کاراکتر است.`,
  variantName: `نام واریانت حداکثر ${VARIANT_NAME_MAX} کاراکتر است.`,
  productName: `نام محصول الزامی است و حداکثر ${PRODUCT_NAME_MAX} کاراکتر است.`,
  categoryId: 'دسته‌بندی الزامی است.',
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
  const [productDrafts, setProductDrafts] = useState<Record<string, CatalogProductDraft>>({})
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
      field: CatalogEditableField,
      rawValue: string,
    ): void => {
      let canonical: string | null | undefined
      if (field === 'price') {
        canonical = rawValue.replace(/[^\d.]/g, '')
      } else if (field === 'compareAtPrice') {
        const cleaned = rawValue.replace(/[^\d.]/g, '')
        canonical = cleaned === '' ? null : cleaned
      } else if (field === 'stock') {
        canonical = rawValue.replace(/[^\d]/g, '')
      } else if (field === 'sku') {
        canonical = rawValue.trim()
      } else if (field === 'barcode' || field === 'variantName') {
        const trimmed = rawValue.trim()
        canonical = trimmed === '' ? null : trimmed
      } else {
        canonical = rawValue === 'CALL_FOR_PRICE' || rawValue === 'PRICED' ? rawValue : undefined
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
        } else if (field === 'stock') {
          next.stock = canonical as string
        } else if (field === 'sku') {
          next.sku = canonical as string
        } else if (field === 'barcode') {
          next.barcode = canonical as string | null
        } else if (field === 'variantName') {
          next.variantName = canonical as string | null
        } else if (canonical !== undefined) {
          next.priceStatus = canonical as PriceStatus
        }

        // A draft exists only for values that differ from the server row:
        // reverting a cell to its loaded value drops it from the draft, and
        // a fully-reverted row becomes clean again (no no-op saves).
        if (next.price !== undefined && next.price === row.price) {
          delete next.price
        }
        if (next.compareAtPrice !== undefined) {
          const matchesServer =
            next.compareAtPrice === null
              ? row.compareAtPrice === null
              : row.compareAtPrice !== null && next.compareAtPrice === row.compareAtPrice
          if (matchesServer) {
            delete next.compareAtPrice
          }
        }
        if (next.stock !== undefined && next.stock === String(row.stock)) {
          delete next.stock
        }
        if (next.sku !== undefined && next.sku === row.sku) {
          delete next.sku
        }
        if (next.barcode !== undefined) {
          const matchesServer =
            next.barcode === null
              ? row.barcode === null
              : row.barcode !== null && next.barcode === row.barcode
          if (matchesServer) {
            delete next.barcode
          }
        }
        if (next.variantName !== undefined) {
          const matchesServer =
            next.variantName === null
              ? row.variantName === null
              : row.variantName !== null && next.variantName === row.variantName
          if (matchesServer) {
            delete next.variantName
          }
        }
        if (
          next.priceStatus !== undefined &&
          next.priceStatus === row.priceStatus
        ) {
          delete next.priceStatus
        }

        if (
          next.price === undefined &&
          next.compareAtPrice === undefined &&
          next.stock === undefined &&
          next.sku === undefined &&
          next.barcode === undefined &&
          next.variantName === undefined &&
          next.priceStatus === undefined
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

  const editProductCell = useCallback(
    (
      product: CatalogProductServerValues,
      carrierVariantId: string,
      carrierExpectedUpdatedAt: string,
      field: CatalogProductEditableField,
      rawValue: string,
    ): void => {
      // Per-field canonical values: productName/categoryId are required
      // (empty input stays '' and is reported locally on save); brand
      // nullable (empty string = explicit clear).
      const nextProductName = field === 'productName' ? rawValue.trim() : undefined
      const nextBrandId =
        field === 'brandId' ? (rawValue === '' ? null : rawValue) : undefined
      const nextCategoryId = field === 'categoryId' ? rawValue : undefined

      setProductDrafts((prev) => {
        const existing: CatalogProductDraft = prev[product.productId] ?? {
          productId: product.productId,
          carrierVariantId,
          carrierExpectedUpdatedAt,
          baseProductUpdatedAt: product.productUpdatedAt,
        }
        const next: CatalogProductDraft = {
          ...existing,
          // The carrier is the last row the operator touched — it carries
          // the product fields in the batch (the server rejects two).
          carrierVariantId,
          carrierExpectedUpdatedAt,
          baseProductUpdatedAt: product.productUpdatedAt,
        }
        if (nextProductName !== undefined) {
          next.productName = nextProductName
        }
        if (nextBrandId !== undefined) {
          next.brandId = nextBrandId
        }
        if (nextCategoryId !== undefined) {
          next.categoryId = nextCategoryId
        }

        // Symmetric revert: a value equal to the loaded product drops out.
        if (next.productName !== undefined && next.productName === product.productName) {
          delete next.productName
        }
        if (next.brandId !== undefined) {
          const matchesServer =
            next.brandId === null ? product.brandId === null : next.brandId === product.brandId
          if (matchesServer) {
            delete next.brandId
          }
        }
        if (next.categoryId !== undefined && next.categoryId === product.categoryId) {
          delete next.categoryId
        }

        if (
          next.productName === undefined &&
          next.brandId === undefined &&
          next.categoryId === undefined
        ) {
          const nextDrafts = { ...prev }
          delete nextDrafts[product.productId]
          return nextDrafts
        }
        return { ...prev, [product.productId]: next }
      })

      setStatus(carrierVariantId, 'dirty')
      setErrors((prev) => {
        const next = { ...prev }
        delete next[carrierVariantId]
        return next
      })
    },
    [setStatus],
  )

  const discardAll = useCallback((): void => {
    // Zero-drift cancel: pure client-side reset, nothing is sent anywhere.
    setDrafts({})
    setProductDrafts({})
    setStatuses({})
    setErrors({})
  }, [])

  const discardRow = useCallback(
    (variantId: string) => {
      // Dropping a row also drops its product draft when it is that row's
      // carrier — the product fields lived on it in the batch.
      setProductDrafts((prev) => {
        const next = { ...prev }
        for (const [productId, draft] of Object.entries(prev)) {
          if (draft.carrierVariantId === variantId) {
            delete next[productId]
          }
        }
        return next
      })
      dropRow(variantId)
    },
    [dropRow],
  )

  const resolveConflictRow = useCallback(
    (variantId: string, mode: 'keep' | 'drop'): void => {
      if (mode === 'drop') {
        discardRow(variantId)
        return
      }
      setStatus(variantId, 'dirty')
    },
    [discardRow, setStatus],
  )

  const buildRowInput = useCallback(
    (
      variantId: string,
      draft: CatalogRowDraft | undefined,
      productDraft: CatalogProductDraft | undefined,
    ): { input: CatalogGridBatchRowInput } | { invalid: Record<string, string> } => {
      const input: CatalogGridBatchRowInput = {
        variantId,
        expectedUpdatedAt: draft?.baseUpdatedAt ?? productDraft?.carrierExpectedUpdatedAt ?? '',
      }
      const invalid: Record<string, string> = {}
      if (draft !== undefined) {
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
        if (draft.sku !== undefined) {
          const trimmed = draft.sku.trim()
          if (trimmed.length > 0 && trimmed.length <= SKU_MAX) {
            input.sku = trimmed
          } else {
            invalid.sku = LOCAL_FIELD_ERRORS.sku!
          }
        }
        if (draft.barcode !== undefined) {
          if (draft.barcode === null || draft.barcode.length <= BARCODE_MAX) {
            input.barcode = draft.barcode
          } else {
            invalid.barcode = LOCAL_FIELD_ERRORS.barcode!
          }
        }
        if (draft.variantName !== undefined) {
          if (draft.variantName === null || draft.variantName.length <= VARIANT_NAME_MAX) {
            input.variantName = draft.variantName
          } else {
            invalid.variantName = LOCAL_FIELD_ERRORS.variantName!
          }
        }
        if (draft.priceStatus !== undefined) {
          input.priceStatus = draft.priceStatus
        }
      }
      if (productDraft !== undefined) {
        if (productDraft.productName !== undefined) {
          const trimmed = productDraft.productName.trim()
          if (trimmed.length > 0 && trimmed.length <= PRODUCT_NAME_MAX) {
            input.productName = trimmed
          } else {
            invalid.productName = LOCAL_FIELD_ERRORS.productName!
          }
        }
        if (productDraft.brandId !== undefined) {
          input.brandId = productDraft.brandId
        }
        if (productDraft.categoryId !== undefined) {
          if (productDraft.categoryId.length > 0) {
            input.categoryId = productDraft.categoryId
          } else {
            invalid.categoryId = LOCAL_FIELD_ERRORS.categoryId!
          }
        }
        input.expectedProductUpdatedAt = productDraft.baseProductUpdatedAt
      }
      if (Object.keys(invalid).length > 0) {
        return { invalid }
      }
      // A row whose only content was reverted (nothing left to send) still
      // produces a structurally valid, field-less request row — the API
      // accepts it as a no-op success. Product-only rows (no variant draft)
      // are likewise valid: the server skips the variant write.
      return { input }
    },
    [],
  )

  const applyResults = useCallback(
    (results: CatalogGridRowResult[]): void => {
      for (const result of results) {
        if (result.outcome === 'SUCCESS') {
          dropRow(result.variantId)
          // A successful carrier drops its product draft — the reconciled
          // product values arrive via `applyRowPatches` on the page side.
          setProductDrafts((prev) => {
            const next = { ...prev }
            for (const [productId, draft] of Object.entries(prev)) {
              if (draft.carrierVariantId === result.variantId) {
                delete next[productId]
              }
            }
            return next
          })
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

      // Carrier rows (product drafts) submit even without a variant draft:
      // their row input carries only the product fields.
      const ids = [...variantIds]
      for (const draft of Object.values(productDrafts)) {
        if (!ids.includes(draft.carrierVariantId)) {
          ids.push(draft.carrierVariantId)
        }
      }

      for (const id of ids) {
        const built = buildRowInput(id, drafts[id], productDraftFor(productDrafts, id))
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
    [applyResults, buildRowInput, drafts, productDrafts, setStatus],
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
    const dirtyCount = Object.keys(drafts).length + Object.keys(productDrafts).length
    const savingCount = values.filter((status) => status === 'saving').length
    const failedCount = values.filter(
      (status) => FAILED.includes(status as CatalogRowStatus),
    ).length
    const succeededCount = values.filter((status) => status === 'saved').length
    return { dirtyCount, savingCount, failedCount, succeededCount }
  }, [drafts, productDrafts, statuses])

  return {
    drafts,
    productDrafts,
    statuses,
    errors,
    saving,
    ...stats,
    hasDirty: stats.dirtyCount > 0,
    editCell,
    editProductCell,
    discardAll,
    discardRow,
    resolveConflictRow,
    saveRows,
    saveAll,
  }
}

/** The product draft a given variant row carries, if any. */
function productDraftFor(
  productDrafts: Record<string, CatalogProductDraft>,
  variantId: string,
): CatalogProductDraft | undefined {
  return Object.values(productDrafts).find(
    (draft) => draft.carrierVariantId === variantId,
  )
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
