import { useEffect, useMemo, useState } from 'react'
import type { CategoryTreeNode } from '@sabz/types'
import { Folder } from 'lucide-react'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, FieldGroup, Fieldset, Label, Legend } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { flattenAllNodes, getDescendantIds, lookupNode, maxSiblingSortOrder } from '../../lib/category-tree-utils'
import { createCategory, updateCategory } from '../../services/categories'

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
  onSuccess: () => void
}) {
  const isEdit = category !== null

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [parentId, setParentId] = useState('')
  const [isVisible, setIsVisible] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setSlug(category?.slug ?? '')
      setParentId(category?.parentId ?? parentPreset?.id ?? '')
      setIsVisible(category?.isVisible ?? true)
      setError(null)
    }
  }, [open, category, parentPreset])

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

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام دسته بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const base = {
        name: name.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        parentId: parentId || null,
        isVisible,
      }
      if (isEdit && category) {
        await updateCategory(category.id, base)
      } else {
        await createCategory({
          ...base,
          sortOrder: maxSiblingSortOrder(tree, parentId || null),
        })
      }
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const previewPath = [...parentPath, name.trim() || category?.name || 'نام دسته بندی']

  return (
    <Alert open={open} onClose={onClose} size="2xl">
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
              <Field>
                <Label>اسلاگ</Label>
                <Input
                  name="slug"
                  dir="ltr"
                  value={slug}
                  maxLength={255}
                  placeholder="در صورت خالی بودن، از نام ساخته میشود"
                  onChange={(event) => setSlug(event.target.value)}
                  disabled={submitting}
                />
                <Text className="text-xs text-muted">فقط حروف انگلیسی کوچک، اعداد و خط تیره.</Text>
              </Field>
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
                <Badge color={isVisible ? 'green' : 'zinc'}>
                  {isVisible ? 'نمایش' : 'مخفی'}
                </Badge>
              </div>
            </FieldGroup>
          </Fieldset>

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