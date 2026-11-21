import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { CategoryDetail, CategoryTreeNode } from '@sabz/types'
import { Folder, ImagePlus, Trash2 } from 'lucide-react'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { StatusBadge } from '../ui/status-badge'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, FieldGroup, Fieldset, Label, Legend } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { findSlugCollision } from '../../lib/slug-collision'
import { slugify } from '../../lib/slug'
import { flattenAllNodes, getDescendantIds, lookupNode, maxSiblingSortOrder } from '../../lib/category-tree-utils'
import {
  createCategory,
  removeCategoryImage,
  updateCategory,
  uploadCategoryImage,
} from '../../services/categories'
import { adminMediaUrl } from '../../lib/media-url'
import { SlugField } from '../ui/slug-field'

export function CategoryEditor({
  open,
  category,
  parentPreset,
  tree,
  onClose,
  onSuccess,
}: {
  open: boolean
  category: CategoryTreeNode | null
  parentPreset: CategoryTreeNode | null
  tree: CategoryTreeNode[]
  onClose: () => void
  onSuccess: (result: CategoryDetail, mode: 'create' | 'edit') => void
}) {
  const isEdit = category !== null

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugMode, setSlugMode] = useState<'auto' | 'manual'>('auto')
  const [parentId, setParentId] = useState('')
  const [isVisible, setIsVisible] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugConflict, setSlugConflict] = useState<string | null>(null)
  const [createdCategory, setCreatedCategory] = useState<CategoryDetail | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageRemoveRequested, setImageRemoveRequested] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setSlug(category?.slug ?? '')
      // A persisted slug is a manual value: nothing rewrites it implicitly.
      setSlugMode(category ? 'manual' : 'auto')
      setParentId(category?.parentId ?? parentPreset?.id ?? '')
      setIsVisible(category?.isVisible ?? true)
      setError(null)
      setSlugConflict(null)
      setCreatedCategory(null)
      setImageFile(null)
      setImagePreview(adminMediaUrl(category?.imageUrl ?? null))
      setImageRemoveRequested(false)
      setImageError(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }, [open, category, parentPreset])

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const parentOptions = useMemo(() => {
    const excluded = category ? new Set([category.id, ...getDescendantIds(tree, category.id)]) : new Set<string>()
    return flattenAllNodes(tree).filter((item) => !excluded.has(item.id))
  }, [tree, category])

  const parentPath = useMemo(() => {
    if (!parentId) {
      return []
    }
    const lookup = lookupNode(tree, parentId)
    return lookup ? lookup.path.map((node) => node.name) : []
  }, [tree, parentId])

  // SS-254: collision check against the FULL tree the editor already holds
  // (complete dataset — the one entity type with an exhaustive client list).
  const knownCategorySlugs = useMemo(
    () => flattenAllNodes(tree).map((item) => ({ id: item.id, slug: item.node.slug })),
    [tree],
  )
  const effectiveSlug = slugMode === 'auto' ? slugify(name) : slug
  const collision =
    findSlugCollision(knownCategorySlugs, effectiveSlug, category?.id) !== null

  const canSubmit = name.trim().length > 0 && !submitting

  const pickImage = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null
    setImageError(null)
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('فقط تصویر JPG، PNG یا WEBP مجاز است.')
      event.target.value = ''
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError('حجم تصویر حداکثر ۸ مگابایت است.')
      event.target.value = ''
      return
    }
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageRemoveRequested(false)
  }

  const clearImage = (): void => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setImageRemoveRequested(Boolean(category?.imageUrl ?? createdCategory?.imageUrl))
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const handleCancel = (): void => {
    if (createdCategory && !category) {
      onSuccess(createdCategory, 'create')
      return
    }
    onClose()
  }

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام دسته بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    setImageError(null)
    setSlugConflict(null)
    try {
      const base = {
        name: name.trim(),
        ...(effectiveSlug.trim() ? { slug: effectiveSlug.trim() } : {}),
        parentId: parentId || null,
        isVisible,
      }
      let saved: CategoryDetail
      if (isEdit && category) {
        saved = await updateCategory(category.id, base)
      } else if (createdCategory) {
        saved = await updateCategory(createdCategory.id, base)
      } else {
        saved = await createCategory({
          ...base,
          sortOrder: maxSiblingSortOrder(tree, parentId || null),
        })
        setCreatedCategory(saved)
      }
      if (imageFile) {
        saved = await uploadCategoryImage(saved.id, imageFile)
      } else if (imageRemoveRequested && saved.imageUrl) {
        saved = await removeCategoryImage(saved.id)
      }
      onSuccess(saved, isEdit ? 'edit' : 'create')
    } catch (submitError) {
      const message = translateApiError(submitError)
      setError(message)
      setImageError(message)
      if (isConflictError(submitError)) {
        setSlugConflict(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const previewPath = [...parentPath, name.trim() || category?.name || 'نام دسته بندی']

  return (
    <Alert open={open} onClose={handleCancel} size="2xl">
      <AlertTitle>{isEdit ? 'ویرایش دسته بندی' : 'افزودن دسته بندی'}</AlertTitle>
      <AlertDescription>
        {isEdit
          ? 'مشخصات دسته بندی را ویرایش کنید. جابهجایی در سلسله مراتب با کشیدن و رها کردن انجام میشود.'
          : 'دسته بندی جدیدی برای سازماندهی کاتالوگ خود ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-6">
          <Fieldset>
            <Legend>مشخصات</Legend>
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </Fieldset>

          <Fieldset>
            <Legend>سلسله مراتب</Legend>
            <FieldGroup>
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
                {parentPath.length > 0 && (
                  <Text className="text-xs text-muted">
                    مسیر: {parentPath.join(' ← ')}
                  </Text>
                )}
              </Field>
            </FieldGroup>
          </Fieldset>

          <Fieldset>
            <Legend>نمایش در فروشگاه</Legend>
            <FieldGroup>
              <Field>
                <Select
                  name="isVisible"
                  value={isVisible ? 'true' : 'false'}
                  onChange={(event) => setIsVisible(event.target.value === 'true')}
                  disabled={submitting}
                >
                  <option value="true">نمایش</option>
                  <option value="false">مخفی</option>
                </Select>
              </Field>
            </FieldGroup>
          </Fieldset>

          <Fieldset>
            <Legend>تصویر دسته‌بندی</Legend>
            <FieldGroup>
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface-2">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt={`پیش‌نمایش تصویر ${name || 'دسته‌بندی'}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="size-8 text-muted" aria-hidden="true" />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:border-accent hover:text-accent">
                      <ImagePlus className="size-4" aria-hidden="true" />
                      {imagePreview ? 'تغییر تصویر' : 'انتخاب تصویر'}
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={pickImage}
                        disabled={submitting}
                      />
                    </label>
                    {imagePreview ? (
                      <Button outline onClick={clearImage} disabled={submitting}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        حذف تصویر
                      </Button>
                    ) : null}
                  </div>
                  <Text className="text-xs text-muted">
                    JPG، PNG یا WEBP، حداکثر ۸ مگابایت. تصویر با نسبت اصلی ذخیره
                    می‌شود و در کارت‌ها و ناوبری فروشگاه نمایش می‌یابد.
                  </Text>
                  {imageError ? <ErrorMessage>{imageError}</ErrorMessage> : null}
                </div>
              </div>
            </FieldGroup>
          </Fieldset>

          <Fieldset>
            <Legend>پیش نمایش</Legend>
            <FieldGroup>
              <div className="flex items-center gap-3 rounded-xl border border-primary-border bg-primary-subtle/40 px-3 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-strong shadow-sm">
                  <Folder className="size-4 text-primary" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm/6 font-medium text-foreground">
                    {previewPath[previewPath.length - 1]}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {previewPath.length > 1 ? previewPath.join(' ← ') : 'دسته بندی ریشه'}
                  </p>
                </div>
                <StatusBadge tone={isVisible ? 'success' : 'neutral'}>
                  {isVisible ? 'نمایش' : 'مخفی'}
                </StatusBadge>
              </div>
            </FieldGroup>
          </Fieldset>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={handleCancel} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن'}
        </Button>
      </AlertActions>
    </Alert>
  )
}