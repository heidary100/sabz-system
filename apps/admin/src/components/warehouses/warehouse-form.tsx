import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateWarehouseInput, WarehouseSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { createWarehouse, getWarehouse, updateWarehouse } from '../../services/warehouses'
import { Loading } from '../ui/loading'

export function WarehouseForm({
  open,
  warehouse,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  warehouse: WarehouseSummary | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const isEdit = warehouse !== null

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailSeq = useRef(0)

  const loadDetail = useCallback(async (): Promise<void> => {
    if (!warehouse) {
      return
    }
    const seq = ++detailSeq.current
    setDetailLoading(true)
    setDetailError(null)
    try {
      const detail = await getWarehouse(warehouse.id)
      if (seq !== detailSeq.current) {
        return
      }
      setCode(detail.code)
      setName(detail.name)
      setAddress(detail.address ?? '')
      setContactName(detail.contactName ?? '')
      setContactPhone(detail.contactPhone ?? '')
    } catch (error) {
      if (seq !== detailSeq.current) {
        return
      }
      setDetailError(translateApiError(error))
    } finally {
      if (seq === detailSeq.current) {
        setDetailLoading(false)
      }
    }
  }, [warehouse])

  useEffect(() => {
    if (open) {
      detailSeq.current += 1
      setCode(warehouse?.code ?? '')
      setName(warehouse?.name ?? '')
      setAddress('')
      setContactName('')
      setContactPhone('')
      setError(null)
      setDetailError(null)
      if (warehouse) {
        void loadDetail()
      }
    }
  }, [open, warehouse, loadDetail])

  const canSubmit =
    code.trim().length > 0 &&
    name.trim().length > 0 &&
    !submitting &&
    !detailLoading &&
    !detailError

  const handleSubmit = async (): Promise<void> => {
    if (!code.trim() || !name.trim()) {
      setError('کد و نام انبار الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        await updateWarehouse(warehouse.id, {
          code: code.trim(),
          name: name.trim(),
          address: address.trim() || null,
          contactName: contactName.trim() || null,
          contactPhone: contactPhone.trim() || null,
        })
      } else {
        await createWarehouse({
          code: code.trim(),
          name: name.trim(),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        } as CreateWarehouseInput)
      }
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
      if (isConflictError(error)) {
        onConflict()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>{isEdit ? 'ویرایش انبار' : 'افزودن انبار'}</AlertTitle>
      <AlertDescription>
        {isEdit ? 'اطلاعات انبار را ویرایش کنید.' : 'انبار جدید ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        {detailLoading ? (
          <Loading compact label="در حال بارگذاری اطلاعات…" />
        ) : detailError ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background px-6 py-8 text-center">
            <p className="text-sm/6 text-muted">{detailError}</p>
            <Button outline onClick={() => void loadDetail()}>
              تلاش مجدد
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <Field>
              <Label>کد</Label>
              <Input
                name="code"
                dir="ltr"
                value={code}
                maxLength={100}
                onChange={(event) => setCode(event.target.value)}
                disabled={submitting}
              />
            </Field>

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
              <Label>آدرس</Label>
              <Textarea
                name="address"
                value={address}
                maxLength={1000}
                rows={3}
                onChange={(event) => setAddress(event.target.value)}
                disabled={submitting}
              />
              <Text className="text-xs text-muted">{address.length}/1000</Text>
            </Field>

            <Field>
              <Label>نام مسئول</Label>
              <Input
                name="contactName"
                value={contactName}
                maxLength={255}
                onChange={(event) => setContactName(event.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field>
              <Label>تلفن تماس</Label>
              <Input
                name="contactPhone"
                dir="ltr"
                value={contactPhone}
                maxLength={100}
                onChange={(event) => setContactPhone(event.target.value)}
                disabled={submitting}
              />
            </Field>

            {error && <ErrorMessage>{error}</ErrorMessage>}
          </div>
        )}
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