import { useEffect, useMemo, useState } from 'react'
import type { CategoryDetail, CategorySummary, CreateCategoryInput, UpdateCategoryInput } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { createCategory, updateCategory } from '../../services/categories'

export function CategoryForm({
  open,
  category,
  categories,
  onClose,
  onSuccess,
}: {
  open: boolean
  category: CategoryDetail | null
  categories: CategorySummary[]
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = category !== null

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isVisible, setIsVisible] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setSlug(category?.slug ?? '')
      setParentId(category?.parentId ?? '')
      setSortOrder(category ? String(category.sortOrder) : '0')
      setIsVisible(category?.isVisible ?? true)
      setError(null)
    }
  }, [open, category])

  const parentOptions = useMemo(
    () => categories.filter((item) => item.id !== category?.id),
    [categories, category],
  )

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام دسته‌بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const sortOrderNumber = Number(sortOrder)
      const base = {
        name: name.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        parentId: parentId || null,
        sortOrder: Number.isFinite(sortOrderNumber) ? sortOrderNumber : 0,
        isVisible,
      }
      if (isEdit) {
        await updateCategory(category.id, base as UpdateCategoryInput)
      } else {
        await createCategory(base as CreateCategoryInput)
      }
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی'}</AlertTitle>
      <AlertDescription>
        {isEdit
          ? 'اطلاعات دسته‌بندی را ویرایش کنید. جابه‌جایی در سلسله‌مراتب توسط سامانه اعتبارسنجی می‌شود.'
          : 'دسته‌بندی جدید ثبت کنید.'}
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
            <Label>اسلاگ</Label>
            <Input
              name="slug"
              dir="ltr"
              value={slug}
              maxLength={255}
              placeholder="در صورت خالی بودن، از نام ساخته می‌شود"
              onChange={(event) => setSlug(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              فقط حروف انگلیسی کوچک، اعداد و خط تیره.
            </Text>
          </Field>

          <Field>
            <Label>دسته‌بندی والد</Label>
            <Select
              name="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              disabled={submitting}
            >
              <option value="">(ریشه)</option>
              {parentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>ترتیب نمایش</Label>
            <Input
              name="sortOrder"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>نمایش در فروشگاه</Label>
            <Select
              name="isVisible"
              value={isVisible ? 'true' : 'false'}
              onChange={(event) => setIsVisible(event.target.value === 'true')}
              disabled={submitting}
            >
              <option value="true">بله</option>
              <option value="false">خیر</option>
            </Select>
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
