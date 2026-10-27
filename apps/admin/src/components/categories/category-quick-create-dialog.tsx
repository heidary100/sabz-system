import { useEffect, useMemo, useState } from 'react'
import type { CategoryDetail, CategoryTreeNode } from '@sabz/types'
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
import { Select } from '../catalyst/select'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { findSlugCollision } from '../../lib/slug-collision'
import { slugify } from '../../lib/slug'
import { flattenAllNodes, maxSiblingSortOrder } from '../../lib/category-tree-utils'
import { SlugField } from '../ui/slug-field'
import { createCategory, fetchCategoryTree } from '../../services/categories'

/**
 * Inline category creation from the product form (SS-255).
 *
 * Fields per the issue — name and parent (with the explicit «(ریشه)» root
 * option, matching the category editor's semantics) — plus the SS-254 slug
 * field. New categories land at the end of their sibling group
 * (maxSiblingSortOrder, the category editor's convention) and are visible by
 * default (server default). The created CategoryDetail goes to the parent,
 * which refreshes its options, selects the entity and closes this dialog
 * only after both succeed. Failures keep the dialog open with values intact.
 */
export function CategoryQuickCreateDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: (category: CategoryDetail) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugMode, setSlugMode] = useState<'auto' | 'manual'>('auto')
  const [parentId, setParentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugConflict, setSlugConflict] = useState<string | null>(null)
  const [tree, setTree] = useState<CategoryTreeNode[]>([])

  useEffect(() => {
    if (open) {
      setName('')
      setSlug('')
      setSlugMode('auto')
      setParentId('')
      setError(null)
      setSlugConflict(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    void fetchCategoryTree()
      .then((nodes) => {
        if (active) setTree(nodes)
      })
      .catch(() => {
        // Parent select falls back to root-only; the server validates anyway.
      })
    return () => {
      active = false
    }
  }, [open])

  const parentOptions = useMemo(() => flattenAllNodes(tree), [tree])
  const knownCategorySlugs = useMemo(
    () => parentOptions.map((item) => ({ id: item.id, slug: item.node.slug })),
    [parentOptions],
  )
  const effectiveSlug = slugMode === 'auto' ? slugify(name) : slug
  const collision = findSlugCollision(knownCategorySlugs, effectiveSlug) !== null
  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام دسته بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    setSlugConflict(null)
    try {
      const created = await createCategory({
        name: name.trim(),
        ...(effectiveSlug.trim() ? { slug: effectiveSlug.trim() } : {}),
        parentId: parentId || null,
        sortOrder: maxSiblingSortOrder(tree, parentId || null),
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
      <AlertTitle>افزودن دسته بندی</AlertTitle>
      <AlertDescription>
        دسته بندی جدیدی ثبت کنید؛ پس از ثبت، همین‌جا انتخاب میشود.
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
            <Label>دسته بندی والد</Label>
            <Select
              name="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              disabled={submitting}
            >
              <option value="">(ریشه)</option>
              {parentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {'— '.repeat(item.depth)}
                  {item.node.name}
                </option>
              ))}
            </Select>
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
