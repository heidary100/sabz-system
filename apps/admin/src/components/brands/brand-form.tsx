import { useEffect, useState } from 'react'
import type { BrandSummary, CreateBrandInput, UpdateBrandInput } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { createBrand, updateBrand } from '../../services/brands'

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
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? '')
      setSlug(brand?.slug ?? '')
      setDescription(brand?.description ?? '')
      setError(null)
    }
  }, [open, brand])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('نام برند الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const base = {
        name: name.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        description: description.trim() || null,
      }
      if (isEdit) {
        await updateBrand(brand.id, base as UpdateBrandInput)
      } else {
        await createBrand(base as CreateBrandInput)
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
            <Text className="text-xs text-zinc-500">
              فقط حروف انگلیسی کوچک، اعداد و خط تیره.
            </Text>
          </Field>

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
            <Text className="text-xs text-zinc-500">
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
