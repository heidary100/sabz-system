import { useEffect, useState } from 'react'
import type { BrandSummary, CreateBrandInput, UpdateBrandInput } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { findSlugCollision } from '../../lib/slug-collision'
import { slugify } from '../../lib/slug'
import { SlugField } from '../ui/slug-field'
import { createBrand, listBrands, updateBrand } from '../../services/brands'

const COLLISION_DATASET_LIMIT = 100

export function BrandForm({
  open,
  brand,
  onClose,
  onSuccess,
}: {
  open: boolean
  brand: BrandSummary | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = brand !== null

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugMode, setSlugMode] = useState<'auto' | 'manual'>('auto')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugConflict, setSlugConflict] = useState<string | null>(null)
  const [knownBrands, setKnownBrands] = useState<BrandSummary[]>([])

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? '')
      setSlug(brand?.slug ?? '')
      // A persisted slug is a manual value: nothing rewrites it implicitly.
      setSlugMode(brand ? 'manual' : 'auto')
      setDescription(brand?.description ?? '')
      setError(null)
      setSlugConflict(null)
    }
  }, [open, brand])

  // SS-254 collision dataset: one fetch per open. Complete today (all brands
  // fit the 100-row cap); if the catalog ever outgrows it, the hint degrades
  // to found-only warnings — it never claims availability.
  useEffect(() => {
    if (!open) return
    let active = true
    void listBrands({ page: 1, limit: COLLISION_DATASET_LIMIT })
      .then((page) => {
        if (active) setKnownBrands(page.items)
      })
      .catch(() => {
        // Hint is best-effort; the server 409 stays authoritative.
      })
    return () => {
      active = false
    }
  }, [open])

  // Auto mode derives the suggestion from the CURRENT name (same slugger as
  // the server, pinned by parity fixtures); manual mode freezes the value.
  const effectiveSlug = slugMode === 'auto' ? slugify(name) : slug
  const collision =
    findSlugCollision(knownBrands, effectiveSlug, brand?.id) !== null

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام برند الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    setSlugConflict(null)
    try {
      const base = {
        name: name.trim(),
        ...(effectiveSlug.trim() ? { slug: effectiveSlug.trim() } : {}),
        description: description.trim() || null,
      }
      if (isEdit) {
        await updateBrand(brand.id, base as UpdateBrandInput)
      } else {
        await createBrand(base as CreateBrandInput)
      }
      onSuccess()
    } catch (submitError) {
      setError(translateApiError(submitError))
      // A collision that escaped the hint lands here, field-level, without
      // losing any input or the manual lock.
      if (isConflictError(submitError)) {
        setSlugConflict(translateApiError(submitError))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش برند' : 'افزودن برند'}</AlertTitle>
      <AlertDescription>
        {isEdit ? 'اطلاعات برند را ویرایش کنید.' : 'برند جدید ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
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

          <Field>
            <Label>توضیح</Label>
            <Textarea
              name="description"
              value={description}
              maxLength={1000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              {description.length}/1000
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
