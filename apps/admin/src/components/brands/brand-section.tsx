import { useEffect, useMemo, useState } from 'react'
import type { BrandSummary } from '@sabz/types'
import { Check, ChevronDown, ChevronUp, Search, Tag } from 'lucide-react'
import { Button } from '../catalyst/button'
import { Field, Label } from '../catalyst/fieldset'
import { Input, InputGroup } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { findSlugCollision } from '../../lib/slug-collision'
import { slugify } from '../../lib/slug'
import { SlugField } from '../ui/slug-field'
import { createBrand, listBrands } from '../../services/brands'

const BRAND_DATASET_LIMIT = 100

/**
 * The product form's Brand section (SS-255 revision): an intentional,
 * interactive part of the product workflow — current selection, searchable
 * brand list, and a compact inline creation form — reusing the exact brand
 * CRUD and validation of the Brand Management page (same services, same
 * fields: name + optional nameEn, SS-254 slug helpers).
 *
 * Selection identity is the stable brand id; creation refreshes the list and
 * selects the returned entity; failures keep everything entered intact.
 */
export function BrandSection({
  selectedId,
  onSelect,
  disabled,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}) {
  const [brands, setBrands] = useState<BrandSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [slug, setSlug] = useState('')
  const [slugMode, setSlugMode] = useState<'auto' | 'manual'>('auto')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugConflict, setSlugConflict] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    try {
      const page = await listBrands({ page: 1, limit: BRAND_DATASET_LIMIT })
      setBrands(page.items)
      setLoadError(null)
    } catch (loadFailure) {
      setLoadError(translateApiError(loadFailure))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (!brands) {
      return []
    }
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return brands
    }
    return brands.filter(
      (brand) =>
        brand.name.toLowerCase().includes(needle) ||
        (brand.nameEn ?? '').toLowerCase().includes(needle) ||
        brand.slug.toLowerCase().includes(needle),
    )
  }, [brands, query])

  const selected = useMemo(
    () => brands?.find((brand) => brand.id === selectedId) ?? null,
    [brands, selectedId],
  )

  const effectiveSlug = slugMode === 'auto' ? slugify(name) : slug
  const collision = findSlugCollision(brands ?? [], effectiveSlug) !== null
  const canSubmit = name.trim().length > 0 && !submitting

  const resetCreateForm = (): void => {
    setCreating(false)
    setName('')
    setNameEn('')
    setSlug('')
    setSlugMode('auto')
    setError(null)
    setSlugConflict(null)
  }

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام برند الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    setSlugConflict(null)
    try {
      const created = await createBrand({
        name: name.trim(),
        ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
        ...(effectiveSlug.trim() ? { slug: effectiveSlug.trim() } : {}),
      })
      await load()
      onSelect(created.id)
      resetCreateForm()
    } catch (submitError) {
      setError(translateApiError(submitError))
      if (isConflictError(submitError)) {
        setSlugConflict(translateApiError(submitError))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary-border bg-primary-subtle/50 px-3 py-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong shadow-sm">
            <Tag className="size-4 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm/6 font-medium text-foreground">
              {selected.name}
              {selected.nameEn && (
                <span className="ms-2 text-xs font-normal text-muted" dir="ltr">
                  {selected.nameEn}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted" dir="ltr">
              {selected.slug}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-primary">برند منتخب</span>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted">
          برندی انتخاب نشده؛ از فهرست زیر انتخاب کنید یا برند جدید بسازید.
        </p>
      )}

      <InputGroup className="w-full">
        <Search data-slot="icon" aria-hidden="true" />
        <Input
          type="text"
          inputMode="search"
          placeholder="جستجوی برند…"
          aria-label="جستجوی برند"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled || brands === null}
        />
      </InputGroup>

      {loadError !== null && brands === null ? (
        <div className="danger-box flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm/6">
          <span>{loadError}</span>
          <Button color="red" onClick={() => void load()}>
            تلاش مجدد
          </Button>
        </div>
      ) : brands === null ? (
        <p className="px-1 py-2 text-sm text-muted">در حال بارگذاری برندها…</p>
      ) : (
        <div
          role="listbox"
          aria-label="فهرست برندها"
          className="max-h-56 overflow-y-auto rounded-xl border border-border bg-surface/60 p-1"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted">
              برندی با این عبارت یافت نشد.
            </p>
          ) : (
            filtered.map((brand) => {
              const isSelected = brand.id === selectedId
              return (
                <button
                  key={brand.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelect(brand.id)}
                  disabled={disabled}
                  className={
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm/6 transition duration-100 ' +
                    (isSelected
                      ? 'bg-primary-subtle/80 text-primary'
                      : 'text-foreground hover:bg-primary-subtle/40')
                  }
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {brand.name}
                    {brand.nameEn && (
                      <span className="ms-2 text-xs font-normal text-muted" dir="ltr">
                        {brand.nameEn}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted" dir="ltr">
                    {brand.slug}
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              )
            })
          )}
        </div>
      )}

      <div>
        <Button
          type="button"
          outline
          onClick={() => (creating ? resetCreateForm() : setCreating(true))}
          disabled={disabled}
          aria-expanded={creating}
        >
          {creating ? <ChevronUp data-slot="icon" /> : <ChevronDown data-slot="icon" />}
          {creating ? 'بستن فرم ایجاد' : 'برند جدید'}
        </Button>
      </div>

      {creating && (
        <div className="space-y-4 rounded-xl border border-border bg-surface/60 p-4" data-testid="brand-create-form">
          <Field>
            <Label>نام</Label>
            <Input
              name="name"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>نام انگلیسی (اختیاری)</Label>
            <Input
              name="nameEn"
              dir="ltr"
              value={nameEn}
              maxLength={255}
              placeholder="مثلاً Dell"
              onChange={(event) => setNameEn(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <SlugField
            name={name}
            slug={slug}
            mode={slugMode}
            onInput={(value) => {
              setSlug(value)
              setSlugMode('manual')
            }}
            onRegenerate={() => setSlugMode('auto')}
            collisionHint={collision ? 'این نشانی قبلاً استفاده شده است.' : null}
            conflictMessage={slugConflict}
            disabled={submitting}
          />

          {error && (
            <div className="danger-box rounded-lg px-3 py-2 text-sm/6" role="alert">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              color="primary"
              onClick={() => void handleCreate()}
              disabled={!canSubmit}
            >
              {submitting ? 'در حال ذخیره…' : 'ذخیره برند'}
            </Button>
            <Button outline onClick={resetCreateForm} disabled={submitting}>
              انصراف
            </Button>
          </div>
          <Text className="text-xs text-muted">
            برند جدید بلافاصله انتخاب و برای همین محصول استفاده میشود.
          </Text>
        </div>
      )}
    </div>
  )
}
