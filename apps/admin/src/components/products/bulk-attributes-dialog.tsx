import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import { AlertTriangle, CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import type {
  AttributeWithValuesDto,
  BulkAttributeApplyResponse,
  BulkAttributeOperation,
  BulkAttributePreviewResponse,
} from '@sabz/types'
import {
  applyBulkAttributes,
  listAttributes,
  previewBulkAttributes,
} from '../../services/attributes'
import { translateApiError } from '../../lib/error-messages'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Field, Label } from '../catalyst/fieldset'
import { InlineError } from '../ui/inline-error'

interface SelectedProduct {
  id: string
  name: string
  updatedAt: string
}

interface DraftOperation {
  key: string
  attributeId: string
  mode: 'SET' | 'CLEAR'
  optionId?: string
  valueText?: string
  valueNumber?: string
  valueBoolean?: boolean
}

/**
 * Bulk attribute editor (SS-900): explicit preview → confirm → per-product
 * outcome report. Never edits silently; the preview token binds the confirmed
 * change set to the baseline the operator reviewed.
 */
export function BulkAttributesDialog({
  open,
  products,
  onClose,
  onApplied,
}: {
  open: boolean
  products: SelectedProduct[]
  onClose: () => void
  onApplied: () => void
}) {
  const [attributes, setAttributes] = useState<AttributeWithValuesDto[]>([])
  const [operations, setOperations] = useState<DraftOperation[]>([])
  const [attributeId, setAttributeId] = useState('')
  const [mode, setMode] = useState<'SET' | 'CLEAR'>('SET')
  const [optionId, setOptionId] = useState('')
  const [valueText, setValueText] = useState('')
  const [valueNumber, setValueNumber] = useState('')
  const [valueBoolean, setValueBoolean] = useState(false)
  const [preview, setPreview] = useState<BulkAttributePreviewResponse | null>(null)
  const [outcome, setOutcome] = useState<BulkAttributeApplyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setOutcome(null)
    setError(null)
    setNotice(null)
    setOperations([])
    setLoading(true)
    listAttributes()
      .then((result) => {
        const specs = result.items.filter((row) => row.type === 'SPEC')
        setAttributes(specs)
        setAttributeId(specs[0]?.id ?? '')
      })
      .catch((loadError) => setError(translateApiError(loadError)))
      .finally(() => setLoading(false))
  }, [open])

  const selectedAttribute = useMemo(
    () => attributes.find((row) => row.id === attributeId) ?? null,
    [attributes, attributeId],
  )

  function resetPreview() {
    setPreview(null)
    setOutcome(null)
    setNotice(null)
    setError(null)
  }

  function addOperation() {
    if (!selectedAttribute) return
    if (mode === 'SET') {
      if (selectedAttribute.valueType === 'SELECT' && !optionId) {
        setError('یک گزینه انتخاب کنید.')
        return
      }
      if (selectedAttribute.valueType === 'NUMBER' && !valueNumber.trim()) {
        setError('مقدار عددی را وارد کنید.')
        return
      }
      if (selectedAttribute.valueType === 'TEXT' && !valueText.trim()) {
        setError('مقدار متنی را وارد کنید.')
        return
      }
      if (selectedAttribute.valueType === 'MULTI_SELECT') {
        setError('ویرایش گروهی چندمقداری پشتیبانی نمی‌شود؛ از ویرایش محصول استفاده کنید.')
        return
      }
    }
    const operation: DraftOperation = {
      key: crypto.randomUUID(),
      attributeId: selectedAttribute.id,
      mode,
      ...(mode === 'SET' && selectedAttribute.valueType === 'SELECT'
        ? { optionId }
        : {}),
      ...(mode === 'SET' && selectedAttribute.valueType === 'TEXT'
        ? { valueText: valueText.trim() }
        : {}),
      ...(mode === 'SET' && selectedAttribute.valueType === 'NUMBER'
        ? { valueNumber: valueNumber.trim() }
        : {}),
      ...(mode === 'SET' && selectedAttribute.valueType === 'BOOLEAN'
        ? { valueBoolean }
        : {}),
    }
    setOperations((current) => [...current, operation])
    resetPreview()
    setMode('SET')
    setOptionId('')
    setValueText('')
    setValueNumber('')
    setValueBoolean(false)
  }

  function operationsPayload(): BulkAttributeOperation[] {
    return operations.map((operation) => {
      if (operation.mode === 'CLEAR') {
        return { kind: 'CLEAR', attributeId: operation.attributeId }
      }
      return {
        kind: 'SET',
        attributeId: operation.attributeId,
        ...(operation.optionId ? { optionId: operation.optionId } : {}),
        ...(operation.valueText ? { valueText: operation.valueText } : {}),
        ...(operation.valueNumber ? { valueNumber: operation.valueNumber } : {}),
        ...(operation.valueBoolean !== undefined
          ? { valueBoolean: operation.valueBoolean }
          : {}),
      }
    })
  }

  async function runPreview() {
    setError(null)
    setOutcome(null)
    if (operations.length === 0) {
      setError('حداقل یک عملیات اضافه کنید.')
      return
    }
    setLoading(true)
    try {
      const result = await previewBulkAttributes({
        products: products.map((product) => ({
          id: product.id,
          updatedAt: product.updatedAt,
        })),
        operations: operationsPayload(),
      })
      setPreview(result)
    } catch (previewError) {
      setError(translateApiError(previewError))
    } finally {
      setLoading(false)
    }
  }

  async function apply() {
    if (!preview) return
    setApplying(true)
    setError(null)
    try {
      const result = await applyBulkAttributes({
        products: products.map((product) => ({
          id: product.id,
          updatedAt: product.updatedAt,
        })),
        operations: operationsPayload(),
        previewToken: preview.previewToken,
      })
      setOutcome(result)
      setPreview(null)
      setNotice(
        `${result.applied} محصول اعمال شد؛ ${result.skipped} رد شد؛ ${result.failed} ناموفق.`,
      )
      onApplied()
    } catch (applyError) {
      setError(translateApiError(applyError))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[80]">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <DialogPanel className="mx-auto w-full max-w-4xl rounded-card border border-border bg-surface-strong shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                ویرایش گروهی ویژگی‌ها
              </DialogTitle>
              <p className="mt-1 text-xs text-muted">
                {products.length} محصول انتخاب شده است. تغییرات ابتدا پیش‌نمایش و سپس با تأیید اعمال می‌شوند.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-control p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="بستن"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
            {error && <InlineError message={error} />}
            {notice && (
              <p className="rounded-control bg-success/10 px-3 py-2 text-sm text-success" role="status">
                {notice}
              </p>
            )}

            <section className="rounded-card border border-border bg-surface p-4">
              <h3 className="text-sm font-bold text-foreground">افزودن عملیات</h3>
              {loading && attributes.length === 0 ? (
                <p className="mt-2 text-sm text-muted">در حال بارگذاری ویژگی‌ها…</p>
              ) : (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field>
                      <Label htmlFor="bulk-attribute">ویژگی</Label>
                      <Select
                        id="bulk-attribute"
                        value={attributeId}
                        onChange={(event) => {
                          setAttributeId(event.target.value)
                          setMode('SET')
                          setOptionId('')
                          setValueText('')
                          setValueNumber('')
                          setValueBoolean(false)
                        }}
                      >
                        {attributes.map((attribute) => (
                          <option key={attribute.id} value={attribute.id}>
                            {attribute.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="bulk-mode">عملیات</Label>
                      <Select
                        id="bulk-mode"
                        value={mode}
                        onChange={(event) => setMode(event.target.value as 'SET' | 'CLEAR')}
                      >
                        <option value="SET">تنظیم / جایگزینی مقدار</option>
                        <option value="CLEAR">پاک کردن مقدار</option>
                      </Select>
                    </Field>
                    <div className="flex items-end">
                      <Button type="button" outline onClick={addOperation} className="w-full">
                        <Plus className="size-4" aria-hidden="true" />
                        افزودن
                      </Button>
                    </div>
                  </div>

                  {mode === 'SET' && selectedAttribute && (
                    <div className="mt-3">
                      {selectedAttribute.valueType === 'SELECT' && (
                        <Field>
                          <Label htmlFor="bulk-option">مقدار</Label>
                          <Select
                            id="bulk-option"
                            value={optionId}
                            onChange={(event) => setOptionId(event.target.value)}
                          >
                            <option value="">انتخاب کنید…</option>
                            {selectedAttribute.values
                              .filter((value) => value.isActive)
                              .map((value) => (
                                <option key={value.id} value={value.id}>
                                  {value.value}
                                </option>
                              ))}
                          </Select>
                        </Field>
                      )}
                      {selectedAttribute.valueType === 'TEXT' && (
                        <Field>
                          <Label htmlFor="bulk-text">مقدار متنی</Label>
                          <Input
                            id="bulk-text"
                            value={valueText}
                            maxLength={255}
                            onChange={(event) => setValueText(event.target.value)}
                          />
                        </Field>
                      )}
                      {selectedAttribute.valueType === 'NUMBER' && (
                        <Field>
                          <Label htmlFor="bulk-number">مقدار عددی</Label>
                          <Input
                            id="bulk-number"
                            dir="ltr"
                            inputMode="decimal"
                            value={valueNumber}
                            onChange={(event) => setValueNumber(event.target.value)}
                          />
                        </Field>
                      )}
                      {selectedAttribute.valueType === 'BOOLEAN' && (
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={valueBoolean}
                            onChange={(event) => setValueBoolean(event.target.checked)}
                            className="size-4 accent-primary"
                          />
                          مقدار «بله»
                        </label>
                      )}
                      {selectedAttribute.valueType === 'MULTI_SELECT' && (
                        <p className="text-xs text-muted">
                          ویرایش گروهی چندمقداری پشتیبانی نمی‌شود.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="rounded-card border border-border bg-surface p-4">
              <h3 className="text-sm font-bold text-foreground">عملیات انتخاب‌شده</h3>
              {operations.length === 0 ? (
                <p className="mt-2 text-sm text-muted">هنوز عملیاتی اضافه نشده است.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {operations.map((operation) => {
                    const attribute = attributes.find((row) => row.id === operation.attributeId)
                    return (
                      <li key={operation.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          <strong>{attribute?.name}</strong>
                          {' — '}
                          {operation.mode === 'CLEAR'
                            ? 'پاک کردن'
                            : operation.optionId
                              ? attribute?.values.find((value) => value.id === operation.optionId)?.value
                              : operation.valueText ?? operation.valueNumber ?? (operation.valueBoolean ? 'بله' : 'خیر')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOperations((current) =>
                              current.filter((row) => row.key !== operation.key),
                            )
                            resetPreview()
                          }}
                          className="rounded-control p-1 text-muted hover:bg-danger/10 hover:text-danger"
                          aria-label="حذف عملیات"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" outline onClick={() => void runPreview()} disabled={loading || operations.length === 0}>
                  پیش‌نمایش تغییرات
                </Button>
                {preview && (
                  <Button type="button" onClick={() => void apply()} disabled={applying}>
                    {applying ? 'در حال اعمال…' : `تأیید و اعمال برای ${preview.affectedProducts} محصول`}
                  </Button>
                )}
              </div>
            </section>

            {preview && (
              <section className="rounded-card border border-primary/30 bg-primary-subtle/30 p-4">
                <h3 className="text-sm font-bold text-foreground">نتیجه پیش‌نمایش</h3>
                <p className="mt-1 text-sm text-foreground">
                  {preview.affectedProducts} محصول تغییر می‌کند؛ {preview.unchangedProducts} محصول بدون تغییر است.
                </p>
                {preview.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-warning">
                    {preview.warnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {warning}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="text-start text-muted">
                        <th className="px-2 py-1 text-start">محصول</th>
                        <th className="px-2 py-1 text-start">ویژگی</th>
                        <th className="px-2 py-1 text-start">قبل</th>
                        <th className="px-2 py-1 text-start">بعد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.changes
                        .filter((change) => change.action !== 'UNCHANGED')
                        .slice(0, 100)
                        .map((change) => (
                          <tr key={`${change.productId}-${change.attributeName}`} className="border-t border-border">
                            <td className="px-2 py-1">{change.productName}</td>
                            <td className="px-2 py-1">{change.attributeName}</td>
                            <td className="px-2 py-1 text-muted">{change.before ?? '—'}</td>
                            <td className="px-2 py-1 font-medium">{change.after ?? '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {outcome && (
              <section className="rounded-card border border-border bg-surface p-4">
                <h3 className="text-sm font-bold text-foreground">گزارش اعمال</h3>
                <p className="mt-1 text-sm text-foreground">
                  {outcome.applied} اعمال‌شده، {outcome.skipped} ردشده، {outcome.failed} ناموفق.
                </p>
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                  {outcome.outcomes.map((row) => (
                    <li key={row.productId} className="flex items-start gap-1.5">
                      {row.status === 'APPLIED' ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                      )}
                      <span>
                        <strong>{row.productName}</strong> — {row.status}
                        {row.message ? `: ${row.message}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button outline onClick={onClose}>
              بستن
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
