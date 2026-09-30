import { useEffect, useState } from 'react'
import type {
  BlogCategoryDto,
  CreateBlogCategoryInput,
  UpdateBlogCategoryInput,
} from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { createCategory, updateCategory } from '../../services/blog'

export function BlogCategoryForm({
  open,
  category,
  onClose,
  onSuccess,
}: {
  open: boolean
  category: BlogCategoryDto | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = category !== null

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setSlug(category?.slug ?? '')
      setDescription(category?.description ?? '')
      setError(null)
    }
  }, [open, category])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام دسته‌بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        const input: UpdateBlogCategoryInput = {
          name: name.trim(),
          ...(slug.trim() ? { slug: slug.trim() } : {}),
          description: description.trim() || null,
        }
        await updateCategory(category.id, input)
      } else {
        const input: CreateBlogCategoryInput = {
          name: name.trim(),
          ...(slug.trim() ? { slug: slug.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        }
        await createCategory(input)
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
        {isEdit ? 'اطلاعات دسته‌بندی وبلاگ را ویرایش کنید.' : 'دسته‌بندی جدید وبلاگ ثبت کنید.'}
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
            <Label>توضیح</Label>
            <Textarea
              name="description"
              value={description}
              maxLength={2000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              {description.length}/2000
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
