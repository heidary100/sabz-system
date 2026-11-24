import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-provider'
import { translateApiError } from '../lib/error-messages'
import { getMyProfile, updateMyProfile } from '../services/profile'
import type { ProfileResponse } from '@sabz/types'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Input } from '../components/catalyst/input'
import { Textarea } from '../components/catalyst/textarea'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'

const NAME_MAX = 100
const ADDRESS_MAX = 500

const USER_STATUS_LABELS: Record<ProfileResponse['status'], string> = {
  PENDING_OTP: 'در انتظار تأیید',
  ACTIVE: 'فعال',
  SUSPENDED: 'تعلیق‌شده',
  LOCKED: 'قفل‌شده',
}

interface FormState {
  firstName: string
  lastName: string
  address: string
}

interface FieldErrors {
  firstName?: string
  lastName?: string
  address?: string
}

function toForm(profile: ProfileResponse): FormState {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    address: profile.address ?? '',
  }
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  const first = form.firstName.trim()
  const last = form.lastName.trim()
  if (first.length === 0) {
    errors.firstName = 'نام را وارد کنید.'
  } else if (first.length > NAME_MAX) {
    errors.firstName = `نام حداکثر ${NAME_MAX} کاراکتر است.`
  }
  if (last.length === 0) {
    errors.lastName = 'نام خانوادگی را وارد کنید.'
  } else if (last.length > NAME_MAX) {
    errors.lastName = `نام خانوادگی حداکثر ${NAME_MAX} کاراکتر است.`
  }
  if (form.address.trim().length > ADDRESS_MAX) {
    errors.address = `نشانی حداکثر ${ADDRESS_MAX} کاراکتر است.`
  }
  return errors
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [form, setForm] = useState<FormState>({ firstName: '', lastName: '', address: '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  async function load(): Promise<void> {
    setLoading(true)
    setLoadError(null)
    try {
      const next = await getMyProfile()
      setProfile(next)
      setForm(toForm(next))
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fetch the authenticated self profile after mount.
    void load()
  }, [])

  function update(field: keyof FormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setSuccess(null)
    setSaveError(null)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    setSaving(true)
    setSaveError(null)
    setSuccess(null)
    try {
      const saved = await updateMyProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        address: form.address.trim(),
      })
      setProfile(saved)
      setForm(toForm(saved))
      // Header identity updates immediately, without logout/login.
      await refreshUser()
      setSuccess('اطلاعات پروفایل ذخیره شد.')
    } catch (error) {
      setSaveError(translateApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="پروفایل من"
        subtitle="اطلاعات نمایشی حساب شما؛ نقش‌ها و وضعیت حساب فقط توسط مدیر سیستم قابل تغییر است."
      />

      {loading ? (
        <Loading compact label="در حال بارگذاری پروفایل…" />
      ) : loadError ? (
        <ErrorState message={translateApiError(loadError)} onRetry={() => void load()} />
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate>
          <TableCard className="space-y-6 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label>شماره موبایل</Label>
                <Input
                  value={profile?.mobile ?? user?.mobile ?? ''}
                  readOnly
                  disabled
                  dir="ltr"
                  aria-describedby="profile-mobile-help"
                />
                <p id="profile-mobile-help" className="mt-1 text-xs text-muted">
                  شماره موبایل شناسه ورود است و از این بخش قابل تغییر نیست.
                </p>
              </Field>
              <Field>
                <Label>وضعیت حساب</Label>
                <Input
                  value={profile ? USER_STATUS_LABELS[profile.status] : ''}
                  readOnly
                  disabled
                />
              </Field>
              <Field>
                <Label>ایمیل</Label>
                <Input
                  value={profile?.email ?? 'ثبت نشده'}
                  readOnly
                  disabled
                  dir="ltr"
                />
              </Field>
              <Field>
                <Label>کد ملی</Label>
                <Input
                  value={
                    profile?.maskedNationalId ??
                    (profile?.hasNationalId ? 'ثبت شده' : 'ثبت نشده')
                  }
                  readOnly
                  disabled
                  dir="ltr"
                />
              </Field>
              <Field>
                <Label>نام</Label>
                <Input
                  value={form.firstName}
                  onChange={(event) => update('firstName', event.target.value)}
                  maxLength={NAME_MAX}
                  autoComplete="given-name"
                  invalid={fieldErrors.firstName !== undefined}
                />
                {fieldErrors.firstName ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {fieldErrors.firstName}
                  </p>
                ) : null}
              </Field>
              <Field>
                <Label>نام خانوادگی</Label>
                <Input
                  value={form.lastName}
                  onChange={(event) => update('lastName', event.target.value)}
                  maxLength={NAME_MAX}
                  autoComplete="family-name"
                  invalid={fieldErrors.lastName !== undefined}
                />
                {fieldErrors.lastName ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {fieldErrors.lastName}
                  </p>
                ) : null}
              </Field>
              <div className="sm:col-span-2">
                <Field>
                  <Label>نشانی</Label>
                  <Textarea
                    value={form.address}
                    onChange={(event) => update('address', event.target.value)}
                    maxLength={ADDRESS_MAX}
                    rows={3}
                    autoComplete="street-address"
                    invalid={fieldErrors.address !== undefined}
                  />
                  {fieldErrors.address ? (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {fieldErrors.address}
                    </p>
                  ) : null}
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
              </Button>
              <p className="text-xs text-muted">
                تغییر نام بلافاصله در سربرگ پنل نمایش داده می‌شود.
              </p>
            </div>

            {saveError ? <InlineError message={saveError} /> : null}
            {success ? (
              <p role="status" className="rounded-control bg-success-soft px-3 py-2 text-sm text-success">
                {success}
              </p>
            ) : null}
          </TableCard>
        </form>
      )}
    </div>
  )
}
