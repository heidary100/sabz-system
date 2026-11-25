import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Info, Loader2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type {
  CategoryAttributeDto,
  ProductAttributeValueInput,
  ProductAttributesResponse,
} from '@sabz/types'
import {
  getCategoryAttributes,
  getProductAttributes,
} from '../../services/attributes'
import { translateApiError } from '../../lib/error-messages'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Field, Label } from '../catalyst/fieldset'
import { InlineError } from '../ui/inline-error'

export interface AttributeDraft {
  attributeId: string
  valueType: CategoryAttributeDto['attribute']['valueType']
  optionId?: string
  optionIds?: string[]
  valueText?: string
  valueNumber?: string
  valueBoolean?: boolean
}

export interface AttributeSectionState {
  values: ProductAttributeValueInput[]
  clearIncompatible: boolean
  valid: boolean
}

/**
 * Category-aware product attribute editor (SS-900).
 *
 * New products load assignments for the selected category; edits load the
 * product's real values and flag values retained from a previous category as
 * incompatible. Nothing is silently discarded: clearing them is an explicit
 * checkbox.
 */
export function ProductAttributesSection({
  productId,
  categoryId,
  disabled,
  onChange,
}: {
  productId?: string
  categoryId: string
  disabled?: boolean
  onChange: (state: AttributeSectionState) => void
}) {
  const [assignments, setAssignments] = useState<CategoryAttributeDto[]>([])
  const [incompatible, setIncompatible] = useState<ProductAttributesResponse['incompatible']>([])
  const [draft, setDraft] = useState<Record<string, AttributeDraft>>({})
  const [clearIncompatible, setClearIncompatible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const requestSeq = useRef(0)
  const lastEmitted = useRef('')

  const load = useCallback(async () => {
    if (!categoryId) {
      setAssignments([])
      setDraft({})
      setIncompatible([])
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      if (productId) {
        const response = await getProductAttributes(productId)
        if (seq !== requestSeq.current) return
        if (response.categoryId === categoryId) {
          setAssignments(response.applicable)
          setIncompatible(response.incompatible)
          setDraft(draftFromValues(response))
        } else {
          // The admin selected a different category in the unsaved form:
          // show the NEW category's applicable attributes while retaining all
          // current values as explicit incompatible data (never silent loss).
          const next = await getCategoryAttributes(categoryId)
          if (seq !== requestSeq.current) return
          setAssignments(next.items)
          setIncompatible([...response.incompatible, ...response.values])
          setDraft(draftFromValues(response))
        }
      } else {
        const response = await getCategoryAttributes(categoryId)
        if (seq !== requestSeq.current) return
        setAssignments(response.items)
        setIncompatible([])
        setDraft({})
      }
    } catch (loadError) {
      if (seq === requestSeq.current) {
        setError(translateApiError(loadError))
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [categoryId, productId])

  useEffect(() => {
    void load()
  }, [load])

  const missingRequired = useMemo(
    () =>
      assignments.filter((assignment) => {
        if (!assignment.isRequired) return false
        const value = draft[assignment.attribute.id]
        return !hasValue(value)
      }),
    [assignments, draft],
  )

  const values = useMemo(() => toPayload(assignments, draft), [assignments, draft])
  const valid = missingRequired.length === 0

  useEffect(() => {
    const signature = JSON.stringify({ values, clearIncompatible, valid })
    if (signature === lastEmitted.current) {
      return
    }
    lastEmitted.current = signature
    onChange({ values, clearIncompatible, valid })
  }, [values, clearIncompatible, valid, onChange])

  function update(attributeId: string, patch: Partial<AttributeDraft>) {
    setTouched(true)
    setDraft((current) => {
      const valueType =
        current[attributeId]?.valueType ??
        assignments.find((row) => row.attribute.id === attributeId)?.attribute
          .valueType ??
        'TEXT'
      return {
        ...current,
        [attributeId]: {
          ...(current[attributeId] ?? { attributeId, valueType }),
          ...patch,
        },
      }
    })
  }

  if (!categoryId) {
    return (
      <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-muted">
        ابتدا دسته‌بندی محصول را انتخاب کنید تا ویژگی‌های آن نمایش داده شود.
      </p>
    )
  }

  if (loading && assignments.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        در حال بارگذاری ویژگی‌های دسته…
      </p>
    )
  }

  if (error) {
    return <InlineError message={error} />
  }

  if (assignments.length === 0 && incompatible.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        برای این دسته ویژگی مشخصات تعریف نشده است. مدیر می‌تواند از صفحه «ویژگی‌ها» آن را اضافه کند.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {assignments.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {assignments.map((assignment) => {
            const attribute = assignment.attribute
            const current = draft[attribute.id]
            const missing = assignment.isRequired && !hasValue(current)
            return (
              <Field key={attribute.id} className="min-w-0">
                <Label>
                  {attribute.name}
                  {attribute.unit ? (
                    <span className="ms-1 text-xs font-normal text-muted">({attribute.unit})</span>
                  ) : null}
                  {assignment.isRequired ? (
                    <span className="ms-1 text-danger" aria-hidden="true">*</span>
                  ) : null}
                  {assignment.inheritedFromCategoryName ? (
                    <span className="ms-2 rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      ارثی از {assignment.inheritedFromCategoryName}
                    </span>
                  ) : null}
                </Label>
                <AttributeControl
                  assignment={assignment}
                  value={current}
                  disabled={disabled}
                  invalid={missing && touched}
                  onChange={(patch) => update(attribute.id, patch)}
                />
                {missing && touched ? (
                  <p className="mt-1 text-xs text-danger">مقدار این ویژگی الزامی است.</p>
                ) : null}
                {attribute.description ? (
                  <p className="mt-1 text-[11px] leading-5 text-muted">{attribute.description}</p>
                ) : null}
              </Field>
            )
          })}
        </div>
      )}

      {incompatible.length > 0 && (
        <div className="rounded-control border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {incompatible.length} مقدار از دسته قبلی باقی مانده است
          </p>
          <p className="mt-1 ps-6 text-xs leading-5 text-muted">
            این مقادیر حذف نشده‌اند. برای حذف صریح آن‌ها گزینه زیر را فعال کنید.
          </p>
          <ul className="mt-2 space-y-1 ps-6 text-xs text-muted">
            {incompatible.slice(0, 8).map((row) => (
              <li key={row.id}>
                {row.attribute.name}: {row.option?.value ?? row.valueText ?? row.valueNumber ?? (row.valueBoolean ? 'بله' : 'خیر')}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 ps-6 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={clearIncompatible}
              onChange={(event) => setClearIncompatible(event.target.checked)}
              className="size-4 accent-danger"
              disabled={disabled}
            />
            پاک کردن مقادیر ناسازگار با دسته فعلی
          </label>
        </div>
      )}

      {assignments.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Sparkles className="size-3.5" aria-hidden="true" />
          این ویژگی‌ها برای فیلتر و مقایسه در فروشگاه استفاده می‌شوند.
        </p>
      )}
    </div>
  )
}

function AttributeControl({
  assignment,
  value,
  disabled,
  invalid,
  onChange,
}: {
  assignment: CategoryAttributeDto
  value: AttributeDraft | undefined
  disabled?: boolean
  invalid: boolean
  onChange: (patch: Partial<AttributeDraft>) => void
}) {
  const attribute = assignment.attribute
  const inputClass = clsx(invalid && 'ring-danger')
  const placeholder = assignment.isRequired ? 'الزامی' : 'اختیاری'

  if (attribute.valueType === 'SELECT') {
    return (
      <Select
        value={value?.optionId ?? ''}
        onChange={(event) =>
          onChange({ optionId: event.target.value || undefined })
        }
        disabled={disabled}
        className={inputClass}
        aria-invalid={invalid}
      >
        <option value="">{placeholder}</option>
        {attribute.values
          .filter((option) => option.isActive)
          .map((option) => (
            <option key={option.id} value={option.id}>
              {option.value}
            </option>
          ))}
      </Select>
    )
  }

  if (attribute.valueType === 'MULTI_SELECT') {
    const selected = new Set(value?.optionIds ?? [])
    return (
      <div
        className="flex flex-wrap gap-1.5 rounded-control bg-surface-strong p-2 ring-1 ring-inset ring-border-control"
        role="group"
        aria-invalid={invalid}
      >
        {attribute.values
          .filter((option) => option.isActive)
          .map((option) => {
            const checked = selected.has(option.id)
            return (
              <label
                key={option.id}
                className={clsx(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  checked
                    ? 'bg-primary text-on-primary ring-primary'
                    : 'bg-surface text-muted ring-border hover:text-foreground',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const next = new Set(selected)
                    if (checked) next.delete(option.id)
                    else next.add(option.id)
                    onChange({ optionIds: [...next] })
                  }}
                  className="sr-only"
                />
                {option.value}
              </label>
            )
          })}
      </div>
    )
  }

  if (attribute.valueType === 'BOOLEAN') {
    return (
      <label className="inline-flex items-center gap-2 rounded-control bg-surface-strong px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-border-control">
        <input
          type="checkbox"
          checked={value?.valueBoolean === true}
          disabled={disabled}
          onChange={(event) => onChange({ valueBoolean: event.target.checked })}
          className="size-4 accent-primary"
        />
        {value?.valueBoolean ? 'بله' : 'خیر'}
      </label>
    )
  }

  if (attribute.valueType === 'NUMBER') {
    return (
      <Input
        dir="ltr"
        inputMode="decimal"
        value={value?.valueNumber ?? ''}
        onChange={(event) => onChange({ valueNumber: event.target.value })}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClass}
        aria-invalid={invalid}
      />
    )
  }

  return (
    <Input
      value={value?.valueText ?? ''}
      onChange={(event) => onChange({ valueText: event.target.value })}
      placeholder={placeholder}
      maxLength={255}
      disabled={disabled}
      className={inputClass}
      aria-invalid={invalid}
    />
  )
}

function draftFromValues(response: ProductAttributesResponse): Record<string, AttributeDraft> {
  const draft: Record<string, AttributeDraft> = {}
  for (const value of response.values) {
    const attributeId = value.attribute.id
    const current = draft[attributeId] ?? {
      attributeId,
      valueType: value.attribute.valueType,
    }
    if (value.option) {
      if (value.attribute.valueType === 'MULTI_SELECT') {
        current.optionIds = [...(current.optionIds ?? []), value.option.id]
      } else {
        current.optionId = value.option.id
      }
    }
    if (value.valueText !== null) current.valueText = value.valueText
    if (value.valueNumber !== null) current.valueNumber = value.valueNumber
    if (value.valueBoolean !== null) current.valueBoolean = value.valueBoolean
    draft[attributeId] = current
  }
  return draft
}

function toPayload(
  assignments: CategoryAttributeDto[],
  draft: Record<string, AttributeDraft>,
): ProductAttributeValueInput[] {
  const values: ProductAttributeValueInput[] = []
  for (const assignment of assignments) {
    const value = draft[assignment.attribute.id]
    if (!value) continue
    if (value.valueType === 'MULTI_SELECT') {
      if (value.optionIds && value.optionIds.length > 0) {
        values.push({ attributeId: value.attributeId, optionIds: value.optionIds })
      }
      continue
    }
    if (value.valueType === 'SELECT') {
      if (value.optionId) {
        values.push({ attributeId: value.attributeId, optionId: value.optionId })
      }
      continue
    }
    if (value.valueType === 'NUMBER') {
      if (value.valueNumber !== undefined && value.valueNumber !== '') {
        values.push({ attributeId: value.attributeId, valueNumber: value.valueNumber })
      }
      continue
    }
    if (value.valueType === 'BOOLEAN') {
      if (value.valueBoolean !== undefined) {
        values.push({ attributeId: value.attributeId, valueBoolean: value.valueBoolean })
      }
      continue
    }
    if (value.valueText?.trim()) {
      values.push({ attributeId: value.attributeId, valueText: value.valueText.trim() })
    }
  }
  return values
}

function hasValue(value: AttributeDraft | undefined): boolean {
  if (!value) return false
  if (value.valueType === 'MULTI_SELECT') return (value.optionIds?.length ?? 0) > 0
  if (value.valueType === 'SELECT') return Boolean(value.optionId)
  if (value.valueType === 'NUMBER') return Boolean(value.valueNumber?.trim())
  if (value.valueType === 'BOOLEAN') return value.valueBoolean !== undefined
  return Boolean(value.valueText?.trim())
}
