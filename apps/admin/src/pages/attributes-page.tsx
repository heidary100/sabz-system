import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Layers,
  Plus,
  Save,
  Tag,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import type {
  AttributeValueType,
  AttributeWithValuesDto,
  CategoryAttributeDto,
  CategoryTreeNode,
} from '@sabz/types'
import { fetchCategoryTree } from '../services/categories'
import {
  createAttribute,
  createAttributeValue,
  deleteAttribute,
  deleteAttributeValue,
  getCategoryAttributes,
  listAttributes,
  setCategoryAttributes,
  updateAttribute,
  type AttributePayload,
} from '../services/attributes'
import { translateApiError } from '../lib/error-messages'
import { Button } from '../components/catalyst/button'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
import { Textarea } from '../components/catalyst/textarea'
import { Field, Label } from '../components/catalyst/fieldset'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { StatusBadge } from '../components/ui/status-badge'

const VALUE_TYPES: Array<{ value: AttributeValueType; label: string }> = [
  { value: 'TEXT', label: 'متنی' },
  { value: 'NUMBER', label: 'عددی' },
  { value: 'BOOLEAN', label: 'بله/خیر' },
  { value: 'SELECT', label: 'انتخابی (تک)' },
  { value: 'MULTI_SELECT', label: 'انتخابی (چند)' },
]

interface FlatCategory {
  id: string
  name: string
  depth: number
}

function flatten(tree: CategoryTreeNode[], depth = 0): FlatCategory[] {
  return tree.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flatten(node.children, depth + 1),
  ])
}

/**
 * Category-aware attribute administration (SS-900): reusable definitions,
 * typed option values, and per-category assignment with parent inheritance.
 */
export function AttributesPage() {
  const [attributes, setAttributes] = useState<AttributeWithValuesDto[]>([])
  const [categories, setCategories] = useState<FlatCategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [assignments, setAssignments] = useState<CategoryAttributeDto[]>([])
  const [available, setAvailable] = useState<AttributeWithValuesDto[]>([])
  const [selectedAttributeId, setSelectedAttributeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)

  const selectedAttribute = useMemo(
    () => attributes.find((attribute) => attribute.id === selectedAttributeId) ?? null,
    [attributes, selectedAttributeId],
  )

  const reloadAttributes = useCallback(async () => {
    const result = await listAttributes()
    setAttributes(result.items)
    setSelectedAttributeId((current) => current || result.items[0]?.id || '')
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([listAttributes(), fetchCategoryTree()])
      .then(([attributeResult, tree]) => {
        if (cancelled) return
        setAttributes(attributeResult.items)
        setSelectedAttributeId(attributeResult.items[0]?.id ?? '')
        const flat = flatten(tree)
        setCategories(flat)
        setCategoryId((current) => current || flat[0]?.id || '')
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadCategory = useCallback(async (id: string) => {
    if (!id) return
    setCategoryLoading(true)
    setActionError(null)
    try {
      const result = await getCategoryAttributes(id)
      setAssignments(result.items)
      setAvailable(result.availableAttributes)
    } catch (loadError) {
      setActionError(translateApiError(loadError))
    } finally {
      setCategoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCategory(categoryId)
  }, [categoryId, loadCategory])

  function toggleAssignment(attribute: AttributeWithValuesDto, checked: boolean) {
    setNotice(null)
    setAssignments((current) => {
      if (!checked) {
        return current.filter((row) => row.attribute.id !== attribute.id)
      }
      if (current.some((row) => row.attribute.id === attribute.id)) {
        return current
      }
      return [
        ...current,
        {
          attribute,
          sortOrder: current.length,
          isRequired: false,
          isFilterable: true,
          isComparable: true,
          inheritedFromCategoryId: null,
          inheritedFromCategoryName: null,
        },
      ]
    })
  }

  function patchAssignment(attributeId: string, patch: Partial<CategoryAttributeDto>) {
    setNotice(null)
    setAssignments((current) =>
      current.map((row) =>
        row.attribute.id === attributeId
          ? {
              ...row,
              ...patch,
              // Editing an inherited row creates an explicit override on this
              // category so the saved configuration is authoritative.
              inheritedFromCategoryId: null,
              inheritedFromCategoryName: null,
            }
          : row,
      ),
    )
  }

  async function saveCategory() {
    if (!categoryId) return
    setSavingCategory(true)
    setActionError(null)
    setNotice(null)
    try {
      const result = await setCategoryAttributes(
        categoryId,
        assignments.map((row, index) => ({
          attributeId: row.attribute.id,
          sortOrder: index,
          isRequired: row.isRequired,
          isFilterable: row.isFilterable,
          isComparable: row.isComparable,
        })),
      )
      setAssignments(result.items)
      setNotice('ویژگی‌های دسته ذخیره شد.')
    } catch (saveError) {
      setActionError(translateApiError(saveError))
    } finally {
      setSavingCategory(false)
    }
  }

  async function handleDeleteAttribute(attribute: AttributeWithValuesDto) {
    if (!window.confirm(`ویژگی «${attribute.name}» حذف شود؟`)) return
    setActionError(null)
    try {
      await deleteAttribute(attribute.id)
      await reloadAttributes()
      setSelectedAttributeId('')
      await loadCategory(categoryId)
    } catch (deleteError) {
      setActionError(translateApiError(deleteError))
    }
  }

  if (loading) {
    return <Loading label="در حال بارگذاری ویژگی‌ها…" />
  }
  if (error) {
    return <ErrorState message={translateApiError(error)} onRetry={() => window.location.reload()} />
  }

  const assignedIds = new Set(assignments.map((row) => row.attribute.id))

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="ویژگی‌ها و مشخصات"
        subtitle="تعریف ویژگی‌های قابل استفاده مجدد، مقدارهای آن‌ها و اتصال به دسته‌بندی‌ها با ارث‌بری از والد."
      />

      {actionError && <InlineError message={actionError} />}
      {notice && (
        <p className="rounded-control bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="space-y-3" aria-label="کتابخانه ویژگی‌ها">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">کتابخانه ویژگی‌ها</h2>
            <Button outline onClick={() => setSelectedAttributeId('new')}>
              <Plus className="size-4" aria-hidden="true" />
              ویژگی جدید
            </Button>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pe-1">
            {attributes.map((attribute) => (
              <button
                key={attribute.id}
                type="button"
                onClick={() => setSelectedAttributeId(attribute.id)}
                aria-current={selectedAttributeId === attribute.id ? 'true' : undefined}
                className={clsx(
                  'w-full rounded-card border p-3 text-start transition-colors',
                  selectedAttributeId === attribute.id
                    ? 'border-primary bg-primary-subtle/60'
                    : 'border-border bg-surface hover:bg-surface-2/60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {attribute.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted" dir="ltr">
                      {attribute.slug}
                    </p>
                  </div>
                  <StatusBadge tone={attribute.type === 'SPEC' ? 'info' : 'neutral'}>
                    {attribute.type === 'SPEC' ? 'مشخصه' : 'تنوع'}
                  </StatusBadge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted">
                  <span className="rounded-pill bg-surface-2 px-1.5 py-0.5">
                    {VALUE_TYPES.find((row) => row.value === attribute.valueType)?.label}
                  </span>
                  {attribute.unit && <span>{attribute.unit}</span>}
                  {attribute.values.length > 0 && <span>{attribute.values.length} مقدار</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6" aria-label="ویرایش ویژگی و دسته‌بندی">
          {selectedAttributeId === 'new' ? (
            <AttributeForm
              key="new"
              onSaved={async (created) => {
                await reloadAttributes()
                setSelectedAttributeId(created.id)
                setNotice('ویژگی جدید ساخته شد.')
              }}
              onCancel={() => setSelectedAttributeId(attributes[0]?.id ?? '')}
            />
          ) : selectedAttribute ? (
            <AttributeForm
              key={selectedAttribute.id}
              attribute={selectedAttribute}
              onSaved={async (saved) => {
                await reloadAttributes()
                setSelectedAttributeId(saved.id)
                setNotice('ویژگی ذخیره شد.')
              }}
              onDelete={() => void handleDeleteAttribute(selectedAttribute)}
              onValuesChanged={async () => {
                await reloadAttributes()
                await loadCategory(categoryId)
              }}
            />
          ) : (
            <EmptyState title="ویژگی‌ای انتخاب نشده" description="از کتابخانه یک ویژگی انتخاب یا یکی بسازید." />
          )}

          <section className="rounded-card border border-border bg-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Layers className="size-4 text-primary" aria-hidden="true" />
                  اتصال به دسته‌بندی
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  دسته‌های فرزند ویژگی‌های والد را به ارث می‌برند؛ تنظیم صریح روی همین دسته، مقدار ارثی را override می‌کند.
                </p>
              </div>
              <Button onClick={() => void saveCategory()} disabled={savingCategory || !categoryId}>
                <Save className="size-4" aria-hidden="true" />
                {savingCategory ? 'در حال ذخیره…' : 'ذخیره اتصال‌ها'}
              </Button>
            </div>

            <Field className="mt-4 max-w-md">
              <Label htmlFor="attribute-category">دسته‌بندی</Label>
              <Select
                id="attribute-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {'\u00a0'.repeat(category.depth * 2)}
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            {categoryLoading ? (
              <Loading compact label="در حال بارگذاری ویژگی‌های دسته…" />
            ) : (
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  {assignments.map((row) => (
                    <div
                      key={row.attribute.id}
                      className="rounded-control border border-border bg-surface-2/40 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {row.attribute.name}
                            {row.inheritedFromCategoryName && (
                              <span className="ms-2 rounded-pill bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
                                ارثی از {row.inheritedFromCategoryName}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {VALUE_TYPES.find((v) => v.value === row.attribute.valueType)?.label}
                            {row.attribute.unit ? ` — ${row.attribute.unit}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAssignment(row.attribute, false)}
                          disabled={Boolean(row.inheritedFromCategoryId)}
                          title={
                            row.inheritedFromCategoryId
                              ? 'این ویژگی از دسته والد ارثی است؛ برای حذف، اتصال والد را تغییر دهید.'
                              : undefined
                          }
                          className="rounded-control p-1 text-muted hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={`حذف ${row.attribute.name} از دسته`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={row.isRequired}
                            onChange={(event) =>
                              patchAssignment(row.attribute.id, {
                                isRequired: event.target.checked,
                              })
                            }
                            className="size-4 accent-primary"
                          />
                          الزامی
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={row.isFilterable}
                            onChange={(event) =>
                              patchAssignment(row.attribute.id, {
                                isFilterable: event.target.checked,
                              })
                            }
                            className="size-4 accent-primary"
                          />
                          قابل فیلتر
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={row.isComparable}
                            onChange={(event) =>
                              patchAssignment(row.attribute.id, {
                                isComparable: event.target.checked,
                              })
                            }
                            className="size-4 accent-primary"
                          />
                          قابل مقایسه
                        </label>
                      </div>
                    </div>
                  ))}
                  {assignments.length === 0 && (
                    <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-muted">
                      هیچ ویژگی‌ای به این دسته متصل نیست.
                    </p>
                  )}
                </div>

                <details className="rounded-control border border-border bg-surface p-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                    <ChevronDown className="size-4" aria-hidden="true" />
                    افزودن ویژگی از کتابخانه
                  </summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {available
                      .filter((attribute) => !assignedIds.has(attribute.id))
                      .map((attribute) => (
                        <button
                          key={attribute.id}
                          type="button"
                          onClick={() => toggleAssignment(attribute, true)}
                          className="flex items-center justify-between gap-2 rounded-control border border-border px-3 py-2 text-start text-sm hover:border-primary hover:bg-primary-subtle/30"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Tag className="size-4 shrink-0 text-primary" aria-hidden="true" />
                            <span className="truncate">{attribute.name}</span>
                          </span>
                          <Plus className="size-4 shrink-0 text-muted" aria-hidden="true" />
                        </button>
                      ))}
                    {available.filter((attribute) => !assignedIds.has(attribute.id)).length === 0 && (
                      <p className="text-sm text-muted">همه ویژگی‌های قابل استفاده متصل شده‌اند.</p>
                    )}
                  </div>
                </details>
                {assignments.some((row) => row.inheritedFromCategoryId) && (
                  <p className="text-[11px] leading-5 text-muted">
                    ردیف‌های ارثی در والد تعریف شده‌اند. با ذخیره این دسته، فقط ردیف‌های صریح همین دسته بازنویسی می‌شوند.
                  </p>
                )}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  )
}

function AttributeForm({
  attribute,
  onSaved,
  onCancel,
  onDelete,
  onValuesChanged,
}: {
  attribute?: AttributeWithValuesDto
  onSaved: (attribute: AttributeWithValuesDto) => Promise<void> | void
  onCancel?: () => void
  onDelete?: () => void
  onValuesChanged?: () => Promise<void> | void
}) {
  const [name, setName] = useState(attribute?.name ?? '')
  const [slug, setSlug] = useState(attribute?.slug ?? '')
  const [type, setType] = useState<AttributePayload['type']>(
    attribute?.type ?? 'SPEC',
  )
  const [valueType, setValueType] = useState<AttributeValueType>(
    attribute?.valueType ?? 'TEXT',
  )
  const [unit, setUnit] = useState(attribute?.unit ?? '')
  const [group, setGroup] = useState(attribute?.group ?? '')
  const [description, setDescription] = useState(attribute?.description ?? '')
  const [isFilterable, setIsFilterable] = useState(attribute?.isFilterable ?? true)
  const [isComparable, setIsComparable] = useState(attribute?.isComparable ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newValue, setNewValue] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [valueBusy, setValueBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError('نام و slug معتبر (حروف کوچک انگلیسی، عدد و خط تیره) الزامی است.')
      return
    }
    setSaving(true)
    try {
      const payload: AttributePayload = {
        name: name.trim(),
        slug,
        type,
        valueType,
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        ...(group.trim() ? { group: group.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        isFilterable,
        isComparable,
      }
      const saved = attribute
        ? await updateAttribute(attribute.id, payload)
        : await createAttribute(payload)
      await onSaved(saved)
      if (!attribute) {
        setName('')
        setSlug('')
        setDescription('')
      }
    } catch (saveError) {
      setError(translateApiError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function addValue(event: React.FormEvent) {
    event.preventDefault()
    if (!attribute) return
    setError(null)
    setNotice(null)
    if (!newValue.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) {
      setError('متن مقدار و slug معتبر الزامی است.')
      return
    }
    setValueBusy(true)
    try {
      await createAttributeValue(attribute.id, {
        value: newValue.trim(),
        slug: newSlug,
      })
      setNewValue('')
      setNewSlug('')
      setNotice('مقدار افزوده شد.')
      await onValuesChanged?.()
    } catch (valueError) {
      setError(translateApiError(valueError))
    } finally {
      setValueBusy(false)
    }
  }

  async function deleteValue(id: string, label: string) {
    if (!window.confirm(`مقدار «${label}» حذف شود؟`)) return
    setError(null)
    try {
      await deleteAttributeValue(id)
      await onValuesChanged?.()
    } catch (deleteError) {
      setError(translateApiError(deleteError))
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">
          {attribute ? `ویرایش «${attribute.name}»` : 'ویژگی جدید'}
        </h2>
        <div className="flex gap-2">
          {onCancel && (
            <Button outline onClick={onCancel} type="button">
              انصراف
            </Button>
          )}
          {onDelete && (
            <Button outline onClick={onDelete} type="button">
              <Trash2 className="size-4" aria-hidden="true" />
              حذف
            </Button>
          )}
        </div>
      </div>

      {error && <div className="mt-3"><InlineError message={error} /></div>}
      {notice && <p className="mt-3 rounded-control bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="attr-name">نام</Label>
            <Input id="attr-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field>
            <Label htmlFor="attr-slug">slug</Label>
            <Input
              id="attr-slug"
              dir="ltr"
              value={slug}
              onChange={(event) => setSlug(event.target.value.trim().toLowerCase())}
              required
            />
          </Field>
          <Field>
            <Label htmlFor="attr-type">نوع</Label>
            <Select
              id="attr-type"
              value={type}
              onChange={(event) => setType(event.target.value as AttributePayload['type'])}
            >
              <option value="SPEC">مشخصه محصول</option>
              <option value="VARIANT_OPTION">گزینه تنوع</option>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="attr-value-type">نوع مقدار</Label>
            <Select
              id="attr-value-type"
              value={valueType}
              onChange={(event) => setValueType(event.target.value as AttributeValueType)}
            >
              {VALUE_TYPES.map((row) => (
                <option key={row.value} value={row.value}>{row.label}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="attr-unit">واحد (اختیاری)</Label>
            <Input id="attr-unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="attr-group">گروه (اختیاری)</Label>
            <Input id="attr-group" value={group} onChange={(event) => setGroup(event.target.value)} />
          </Field>
        </div>
        <Field>
          <Label htmlFor="attr-description">توضیح (اختیاری)</Label>
          <Textarea
            id="attr-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={isFilterable} onChange={(event) => setIsFilterable(event.target.checked)} className="size-4 accent-primary" />
            قابل فیلتر
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={isComparable} onChange={(event) => setIsComparable(event.target.checked)} className="size-4 accent-primary" />
            قابل مقایسه
          </label>
        </div>
        <Button type="submit" disabled={saving}>
          <Check className="size-4" aria-hidden="true" />
          {saving ? 'در حال ذخیره…' : 'ذخیره ویژگی'}
        </Button>
      </form>

      {attribute && (valueType === 'SELECT' || valueType === 'MULTI_SELECT') && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-foreground">مقدارهای انتخابی</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {attribute.values.map((value) => (
              <span
                key={value.id}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs ring-1 ring-inset',
                  value.isActive
                    ? 'bg-surface-2 text-foreground ring-border'
                    : 'bg-surface-2/40 text-muted ring-border',
                )}
              >
                {value.value}
                <button
                  type="button"
                  onClick={() => void deleteValue(value.id, value.value)}
                  className="ms-0.5 rounded-pill p-0.5 text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label={`حذف مقدار ${value.value}`}
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          {attribute.values.length === 0 && (
            <p className="mt-2 text-xs text-muted">هنوز مقداری تعریف نشده است.</p>
          )}
          <form onSubmit={addValue} className="mt-3 flex flex-wrap items-end gap-2">
            <Field className="min-w-40 flex-1">
              <Label htmlFor="new-value">مقدار جدید</Label>
              <Input id="new-value" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
            </Field>
            <Field className="min-w-40 flex-1">
              <Label htmlFor="new-value-slug">slug</Label>
              <Input id="new-value-slug" dir="ltr" value={newSlug} onChange={(event) => setNewSlug(event.target.value.trim().toLowerCase())} />
            </Field>
            <Button type="submit" outline disabled={valueBusy}>
              <Plus className="size-4" aria-hidden="true" />
              افزودن
            </Button>
          </form>
        </div>
      )}
    </section>
  )
}
