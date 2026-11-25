import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Package, Percent, Save } from 'lucide-react'
import type {
  BulkPriceApplyResponse,
  BulkPriceOperation,
  BulkPricePreviewResponse,
  CatalogGridRow,
  PricingScope,
} from '@sabz/types'
import { useCatalogGrid } from '../hooks/use-catalog-grid'
import { useCatalogDrafts } from '../hooks/use-catalog-drafts'
import { applyBulkPricing, previewBulkPricing } from '../services/pricing'
import { translateApiError } from '../lib/error-messages'
import { storefrontProductUrl } from '../lib/storefront-url'
import { groupMoneyDigits } from '../lib/money-input'
import { EditableCell } from '../components/catalog/editable-cell'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { HorizontalScroll } from '../components/ui/horizontal-scroll'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'

const COLUMN_STORAGE_KEY = 'sabz-admin-en-pricing-columns'
const money = new Intl.NumberFormat('en-US')
const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatRial(value: string | null | undefined): string {
  const number = Number(value ?? 0)
  return `${money.format(Number.isFinite(number) ? number : 0)} IRR`
}

type OperationKind =
  | 'PERCENT_DISCOUNT'
  | 'FIXED_DISCOUNT'
  | 'CLEAR_DISCOUNT'
  | 'INCREASE_REGULAR'
  | 'DECREASE_REGULAR'
  | 'SET_OVERRIDE'
  | 'CLEAR_OVERRIDE'

const OPERATION_LABELS: Record<OperationKind, string> = {
  PERCENT_DISCOUNT: 'Apply percentage sale discount',
  FIXED_DISCOUNT: 'Apply fixed Rial sale discount',
  CLEAR_DISCOUNT: 'Clear sale price',
  INCREASE_REGULAR: 'Increase regular price (%)',
  DECREASE_REGULAR: 'Decrease regular price (%)',
  SET_OVERRIDE: 'Set absolute override price',
  CLEAR_OVERRIDE: 'Clear product override',
}

/**
 * English/LTR pricing workspace. Same APIs, permissions and design tokens as
 * the Persian Products workspace; used to exercise and verify the English LTR
 * direction end-to-end (selection → preview → atomic apply, inline batch save).
 */
export function EnglishProductsPage() {
  const grid = useCatalogGrid()
  const drafts = useCatalogDrafts()
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  const [operation, setOperation] = useState<OperationKind>('PERCENT_DISCOUNT')
  const [value, setValue] = useState('10')
  const [preview, setPreview] = useState<BulkPricePreviewResponse | null>(null)
  const [applied, setApplied] = useState<BulkPriceApplyResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCategory, setShowCategory] = useState(() => {
    try {
      return localStorage.getItem(COLUMN_STORAGE_KEY) !== 'minimal'
    } catch {
      return true
    }
  })
  const [showEffective, setShowEffective] = useState(true)

  const scope = useMemo<PricingScope>(
    () => ({ type: 'PRODUCTS', productIds: [...selected.keys()] }),
    [selected],
  )

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, showCategory ? 'full' : 'minimal')
    } catch {
      // display preference only
    }
  }, [showCategory])

  useEffect(() => {
    if (!drafts.hasDirty) return
    const guard = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [drafts.hasDirty])

  const visibleProducts = [
    ...new Map(grid.rows.map((row) => [row.productId, row])).values(),
  ]
  const allSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((row) => selected.has(row.productId))

  function toggleProduct(row: CatalogGridRow): void {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.productId)) next.delete(row.productId)
      else next.set(row.productId, row.productName)
      return next
    })
    setPreview(null)
  }

  function buildOperation(): BulkPriceOperation {
    switch (operation) {
      case 'CLEAR_DISCOUNT':
        return { kind: 'CLEAR_DISCOUNT' }
      case 'CLEAR_OVERRIDE':
        return { kind: 'CLEAR_OVERRIDE' }
      case 'SET_OVERRIDE':
        return { kind: 'SET_OVERRIDE', overridePrice: value }
      case 'INCREASE_REGULAR':
      case 'DECREASE_REGULAR':
        return {
          kind: 'ADJUST_REGULAR_PRICE',
          mode: 'PERCENT',
          direction: operation === 'INCREASE_REGULAR' ? 'INCREASE' : 'DECREASE',
          value,
        }
      case 'FIXED_DISCOUNT':
        return { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value }
      default:
        return { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value }
    }
  }

  async function runPreview(): Promise<void> {
    if (selected.size === 0) {
      setError('Select at least one product.')
      return
    }
    setBusy(true)
    setError(null)
    setApplied(null)
    try {
      setPreview(
        await previewBulkPricing({ scope, operation: buildOperation() }),
      )
    } catch (caught) {
      setPreview(null)
      setError(translateApiError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function runApply(): Promise<void> {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const result = await applyBulkPricing({
        scope,
        operation: buildOperation(),
        previewToken: preview.previewToken,
      })
      setApplied(result)
      if (result.applied) {
        setSelected(new Map())
        setPreview(null)
        await grid.refetch()
      }
    } catch (caught) {
      setError(translateApiError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function saveInline(): Promise<void> {
    setError(null)
    const outcome = await drafts.saveAll()
    if (outcome.requestError) {
      setError(translateApiError(outcome.requestError))
      return
    }
    const successes = outcome.results.filter((row) => row.outcome === 'SUCCESS')
    grid.applyRowPatches(
      successes.map((row) => ({
        variantId: row.variantId,
        regularPrice: row.regularPrice ?? '',
        discountedPrice: row.discountedPrice ?? null,
        partnerPrice: row.partnerPrice,
        priceUpdatedAt: row.priceUpdatedAt,
        effectivePrice: row.effectivePrice,
        expectedUpdatedAt: row.updatedAt ?? '',
        stock: row.stock,
        sku: row.sku,
        priceStatus: row.priceStatus,
        product: row.product,
      })),
    )
  }

  const serverValues = (row: CatalogGridRow) => ({
    variantId: row.variantId,
    expectedUpdatedAt: row.expectedUpdatedAt,
    sku: row.sku,
    barcode: row.barcode,
    variantName: row.variantName,
    price: row.regularPrice,
    discountedPrice: row.discountedPrice,
    discountStartsAt: row.discountStartsAt,
    discountEndsAt: row.discountEndsAt,
    partnerPrice: row.partnerPrice,
    aedPrice: row.aedPrice,
    usdPrice: row.usdPrice,
    stock: row.stock,
    priceStatus: row.priceStatus,
  })

  const cellValue = (row: CatalogGridRow, field: 'price' | 'discountedPrice' | 'stock'): string => {
    const draft = drafts.drafts[row.variantId]
    if (field === 'price') return groupMoneyDigits(draft?.price ?? row.regularPrice)
    if (field === 'discountedPrice') {
      const source =
        draft?.discountedPrice !== undefined ? draft.discountedPrice : row.discountedPrice
      return source === null ? '' : groupMoneyDigits(source)
    }
    return draft?.stock ?? String(row.stock)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Products & pricing</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Select products, preview every financial change, then apply atomically.
            Inline edits are saved as one validated batch with optimistic concurrency.
          </p>
        </div>
      </div>

      <section className="rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="min-w-64 flex-1">
            <Label htmlFor="en-search">Search</Label>
            <Input
              id="en-search"
              name="search"
              type="search"
              placeholder="Product, SKU, brand or category…"
              defaultValue={grid.filters.search}
              onBlur={(event) => grid.setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') grid.setSearch(event.currentTarget.value)
              }}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="show-category"
              checked={showCategory}
              onChange={(event) => setShowCategory(event.target.checked)}
            />
            Show category
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="show-effective"
              checked={showEffective}
              onChange={(event) => setShowEffective(event.target.checked)}
            />
            Show effective price
          </label>
          <span className="text-sm text-muted">
            {selected.size} selected · {grid.total} variants
          </span>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Percent className="size-4 text-primary" aria-hidden />
          Bulk pricing for selected products
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
          <Field>
            <Label htmlFor="en-operation">Operation</Label>
            <Select
              id="en-operation"
              value={operation}
              onChange={(event) => {
                setOperation(event.target.value as OperationKind)
                setPreview(null)
                setApplied(null)
              }}
            >
              {(Object.keys(OPERATION_LABELS) as OperationKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {OPERATION_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="en-value">
              {operation === 'SET_OVERRIDE'
                ? 'Final price (IRR)'
                : operation.includes('DISCOUNT') || operation.includes('REGULAR')
                  ? 'Percent / amount'
                  : '—'}
            </Label>
            <Input
              id="en-value"
              name="value"
              dir="ltr"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setPreview(null)
              }}
              disabled={operation === 'CLEAR_DISCOUNT' || operation === 'CLEAR_OVERRIDE'}
            />
          </Field>
          <Button outline onClick={() => void runPreview()} disabled={busy}>
            Preview
          </Button>
          <Button
            color="primary"
            onClick={() => void runApply()}
            disabled={busy || !preview || preview.failed > 0 || preview.affected === 0}
          >
            Apply atomically
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        {preview ? (
          <div className="mt-3 rounded-control border border-border p-3 text-sm">
            <p>
              Total {preview.total} · affected {preview.affected} · skipped{' '}
              {preview.skipped} · failed {preview.failed}
            </p>
            {preview.warnings.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-xs text-warning">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-strong">
                  <tr>
                    <th className="p-1.5 text-start">SKU</th>
                    <th className="p-1.5 text-start">Regular before</th>
                    <th className="p-1.5 text-start">Regular after</th>
                    <th className="p-1.5 text-start">Sale after</th>
                    <th className="p-1.5 text-start">Effective after</th>
                    <th className="p-1.5 text-start">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((row) => (
                    <tr key={row.variantId} className="border-t border-border">
                      <td className="p-1.5 font-mono">{row.sku}</td>
                      <td className="p-1.5">{formatRial(row.regularPriceBefore)}</td>
                      <td className="p-1.5">{formatRial(row.regularPriceAfter)}</td>
                      <td className="p-1.5">
                        {row.discountedPriceAfter ? formatRial(row.discountedPriceAfter) : '—'}
                      </td>
                      <td className="p-1.5">
                        {row.effectivePriceAfter ? formatRial(row.effectivePriceAfter) : '—'}
                      </td>
                      <td className="p-1.5">{row.outcome === 'AFFECTED' ? 'Will apply' : row.reason ?? row.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {applied ? (
          <p
            role="status"
            className={
              applied.applied
                ? 'mt-2 rounded-control bg-success/10 px-3 py-2 text-sm text-success'
                : 'mt-2 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger'
            }
          >
            {applied.applied
              ? `Applied to ${applied.summary.affected} rows; ${applied.summary.skipped} skipped.`
              : `Not applied: ${applied.summary.failed} rows have errors.`}
          </p>
        ) : null}
      </section>

      {drafts.hasDirty ? (
        <div className="sticky top-20 z-10 flex flex-wrap items-center gap-3 rounded-card border border-primary/40 bg-surface px-4 py-3 shadow-sm">
          <span className="text-sm font-medium">
            {drafts.dirtyCount} unpublished inline change(s)
          </span>
          {drafts.failedCount > 0 ? (
            <span className="text-sm text-danger">{drafts.failedCount} failed</span>
          ) : null}
          <div className="ms-auto flex gap-2">
            <Button outline onClick={drafts.discardAll} disabled={drafts.saving}>
              Discard
            </Button>
            <Button color="primary" onClick={() => void saveInline()} disabled={drafts.saving}>
              <Save className="size-4" aria-hidden />
              {drafts.saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : null}

      {grid.loading && grid.rows.length === 0 ? (
        <Loading label="Loading products…" />
      ) : grid.error ? (
        <ErrorState message={translateApiError(grid.error)} onRetry={() => void grid.refetch()} />
      ) : grid.rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-8 text-center">
          <Package className="mx-auto size-6 text-muted" aria-hidden />
          <p className="mt-2 text-sm text-muted">No products match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <HorizontalScroll ariaLabel="Horizontally scrollable table">
            <Table dense scrollContainer={false}>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label="Select all products on this page"
                      onChange={() =>
                        setSelected((current) => {
                          if (allSelected) {
                            const next = new Map(current)
                            for (const row of visibleProducts) next.delete(row.productId)
                            return next
                          }
                          const next = new Map(current)
                          for (const row of visibleProducts) next.set(row.productId, row.productName)
                          return next
                        })
                      }
                    />
                  </TableHeader>
                  <TableHeader>Product</TableHeader>
                  <TableHeader>SKU</TableHeader>
                  {showCategory ? <TableHeader>Category</TableHeader> : null}
                  <TableHeader>Stock</TableHeader>
                  <TableHeader>Regular price</TableHeader>
                  <TableHeader>Sale price</TableHeader>
                  {showEffective ? <TableHeader>Effective</TableHeader> : null}
                  <TableHeader>Price source</TableHeader>
                  <TableHeader>Updated</TableHeader>
                  <TableHeader>Storefront</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {grid.rows.map((row) => {
                  const status = drafts.statuses[row.variantId] ?? 'clean'
                  return (
                    <TableRow key={row.variantId}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(row.productId)}
                          onChange={() => toggleProduct(row)}
                          aria-label={`Select ${row.productName}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-medium">{row.productName}</TableCell>
                      <TableCell>
                        <EditableCell
                          kind="text"
                          value={row.sku}
                          status={status}
                          error={drafts.errors[row.variantId]?.sku}
                          ariaLabel={`SKU ${row.sku}`}
                          onChange={(value) => drafts.editCell(serverValues(row), 'sku', value)}
                        />
                      </TableCell>
                      {showCategory ? <TableCell className="text-muted">{row.categoryName}</TableCell> : null}
                      <TableCell>
                        {row.stockEditable ? (
                          <EditableCell
                            kind="stock"
                            value={cellValue(row, 'stock')}
                            status={status}
                            error={drafts.errors[row.variantId]?.stock}
                            ariaLabel={`Stock ${row.sku}`}
                            onChange={(value) => drafts.editCell(serverValues(row), 'stock', value)}
                          />
                        ) : (
                          row.stock
                        )}
                      </TableCell>
                      <TableCell>
                        <EditableCell
                          kind="price"
                          value={cellValue(row, 'price')}
                          status={status}
                          error={drafts.errors[row.variantId]?.price}
                          ariaLabel={`Regular price ${row.sku}`}
                          onChange={(value) => drafts.editCell(serverValues(row), 'price', value)}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell
                          kind="price"
                          value={cellValue(row, 'discountedPrice')}
                          status={status}
                          error={drafts.errors[row.variantId]?.discountedPrice}
                          ariaLabel={`Sale price ${row.sku}`}
                          onChange={(value) =>
                            drafts.editCell(serverValues(row), 'discountedPrice', value)
                          }
                        />
                      </TableCell>
                      {showEffective ? (
                        <TableCell className="tabular-nums">
                          {row.effectivePrice ? formatRial(row.effectivePrice) : '—'}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-xs text-muted">{row.priceSource ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted">
                        {row.priceUpdatedAt ? dateTime.format(new Date(row.priceUpdatedAt)) : '—'}
                      </TableCell>
                      <TableCell>
                        {row.productStatus === 'PUBLISHED' ? (
                          <a
                            href={storefrontProductUrl(row.productSlug)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Open
                            <ExternalLink className="size-3.5" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-xs text-muted">Not published</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </HorizontalScroll>
        </div>
      )}
    </div>
  )
}
