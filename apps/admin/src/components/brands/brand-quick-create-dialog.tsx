import { useEffect, useState } from 'react'
import type { BrandSummary } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { findSlugCollision } from '../../lib/slug-collision'
import { slugify } from '../../lib/slug'
import { SlugField } from '../ui/slug-field'
import { createBrand, listBrands } from '../../services/brands'

const COLLISION_DATASET_LIMIT = 100

/**
 * Inline brand creation from the product form (SS-255).
 *
 * Minimal fields per the issue — name, optional English name, and the SS-254
 * slug field (live suggestion + collision hint). The created BrandSummary is
 * handed to the parent, which refreshes its options, selects the entity and
 * closes this dialog only after both succeed. Failures keep the dialog open
 * with every entered value intact; the server stays authoritative (409).
 */
export function BrandQuickCreateDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: (brand: BrandSummary) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [slug, setSlug] = useState('')
  const [slugMode, setSlugMode] = useState<'auto' | 'manual'>('auto')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugConflict, setSlugConflict] = useState<string | null>(null)
  const [knownBrands, setKnownBrands] = useState<BrandSummary[]>([])

  useEffect(() => {
    if (open) {
      setName('')
      setNameEn('')
      setSlug('')
      setSlugMode('auto')
      setError(null)
      setSlugConflict(null)
    }
  }, [open])

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

  const effectiveSlug = slugMode === 'auto' ? slugify(name) : slug
  const collision = findSlugCollision(knownBrands, effectiveSlug) !== null
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
      const created = await createBrand({
        name: name.trim(),
        ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
        ...(effectiveSlug.trim() ? { slug: effectiveSlug.trim() } : {}),
      })
      await onSuccess(created)
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
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>افزودن برند</AlertTitle>
      <AlertDescription>
        برند جدید ثبت کنید؛ پس از ثبت، همین‌جا انتخاب میشود.
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

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال ذخیره…' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
