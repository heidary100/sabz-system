import { useId } from 'react'
import { Description, Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { Textarea } from '../../catalyst/textarea'
import { FieldErrorMessage } from '../../ui/field-error'
import {
  CAMPAIGN_PRIORITY_MAX,
  CAMPAIGN_TEXT_LIMITS,
  type CampaignFormErrors,
  type CampaignFormState,
} from '../../../lib/merchandising-campaign'
import {
  MERCH_CAMPAIGN_TYPE_LABELS,
  MERCH_CAMPAIGN_TYPE_ORDER,
} from '../../../lib/merchandising-labels'
import type { OrderedEntityItem } from './campaign-ordered-entity-list'
import { CampaignCtaBuilder } from './campaign-cta-builder'

export function CampaignSettingsPanel({
  form,
  errors,
  disabled = false,
  knownProducts,
  knownCategories,
  knownBrands,
  onChange,
}: {
  form: CampaignFormState
  errors: CampaignFormErrors
  disabled?: boolean
  knownProducts: OrderedEntityItem[]
  knownCategories: OrderedEntityItem[]
  knownBrands: OrderedEntityItem[]
  onChange: (next: CampaignFormState) => void
}) {
  const uid = useId()
  const fieldId = (name: string): string => `campaign-${uid}-${name}`
  const errorId = (name: string): string => `${fieldId(name)}-error`
  const descriptionId = (name: string): string =>
    `${fieldId(name)}-description`

  const update = (patch: Partial<CampaignFormState>): void => {
    onChange({ ...form, ...patch })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor={fieldId('internal-name')}>نام داخلی</Label>
          <Input
            id={fieldId('internal-name')}
            value={form.internalName}
            maxLength={CAMPAIGN_TEXT_LIMITS.internalName}
            disabled={disabled}
            invalid={Boolean(errors.internalName)}
            onChange={(event) => update({ internalName: event.target.value })}
            placeholder="مثلاً کمپین نوروز ۱۴۰۵"
          />
          <Description className="text-xs text-muted" id={descriptionId('internal-name')}>
            فقط برای شناسایی در پنل مدیریت.
          </Description>
          <FieldErrorMessage
            id={errorId('internal-name')}
            message={errors.internalName}
          />
        </Field>

        <Field>
          <Label htmlFor={fieldId('type')}>نوع کمپین</Label>
          <Select
            id={fieldId('type')}
            value={form.type}
            disabled={disabled}
            invalid={Boolean(errors.type)}
            onChange={(event) =>
              update({
                type: event.target.value as CampaignFormState['type'],
              })
            }
          >
            {MERCH_CAMPAIGN_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {MERCH_CAMPAIGN_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <Description className="text-xs text-muted" id={descriptionId('type')}>
            نوع کمپین فقط برچسب اداری است و محدودیت ترکیب ایجاد نمی‌کند.
          </Description>
          <FieldErrorMessage id={errorId('type')} message={errors.type} />
        </Field>

        <Field className="md:col-span-2">
          <Label htmlFor={fieldId('title')}>عنوان فارسی</Label>
          <Input
            id={fieldId('title')}
            value={form.titleFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.titleFa}
            disabled={disabled}
            invalid={Boolean(errors.titleFa)}
            onChange={(event) => update({ titleFa: event.target.value })}
          />
          <FieldErrorMessage id={errorId('title')} message={errors.titleFa} />
        </Field>

        <Field>
          <Label htmlFor={fieldId('eyebrow')}>
            متن بالای عنوان (اختیاری)
          </Label>
          <Input
            id={fieldId('eyebrow')}
            value={form.eyebrowFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.eyebrowFa}
            disabled={disabled}
            invalid={Boolean(errors.eyebrowFa)}
            onChange={(event) => update({ eyebrowFa: event.target.value })}
          />
          <FieldErrorMessage
            id={errorId('eyebrow')}
            message={errors.eyebrowFa}
          />
        </Field>

        <Field>
          <Label htmlFor={fieldId('subtitle')}>زیرعنوان (اختیاری)</Label>
          <Input
            id={fieldId('subtitle')}
            value={form.subtitleFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.subtitleFa}
            disabled={disabled}
            invalid={Boolean(errors.subtitleFa)}
            onChange={(event) => update({ subtitleFa: event.target.value })}
          />
          <FieldErrorMessage
            id={errorId('subtitle')}
            message={errors.subtitleFa}
          />
        </Field>

        <Field className="md:col-span-2">
          <Label htmlFor={fieldId('description')}>توضیحات (اختیاری)</Label>
          <Textarea
            id={fieldId('description')}
            rows={3}
            value={form.descriptionFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.descriptionFa}
            disabled={disabled}
            invalid={Boolean(errors.descriptionFa)}
            onChange={(event) => update({ descriptionFa: event.target.value })}
          />
          <FieldErrorMessage
            id={errorId('description')}
            message={errors.descriptionFa}
          />
        </Field>

        <Field className="md:col-span-2">
          <Label htmlFor={fieldId('cta-label')}>متن دکمه فراخوان</Label>
          <Input
            id={fieldId('cta-label')}
            value={form.ctaLabelFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.ctaLabelFa}
            disabled={disabled}
            invalid={Boolean(errors.ctaLabelFa)}
            onChange={(event) => update({ ctaLabelFa: event.target.value })}
          />
          <Description className="text-xs text-muted" id={descriptionId('cta-label')}>
            برای هر مقصدی جز «بدون فراخوان» الزامی است.
          </Description>
          <FieldErrorMessage
            id={errorId('cta-label')}
            message={errors.ctaLabelFa}
          />
        </Field>
      </div>

      <CampaignCtaBuilder
        value={{
          ctaKind: form.ctaKind,
          ctaProductId: form.ctaProductId,
          ctaCategoryId: form.ctaCategoryId,
          ctaBrandId: form.ctaBrandId,
        }}
        knownProducts={knownProducts}
        knownCategories={knownCategories}
        knownBrands={knownBrands}
        disabled={disabled}
        error={errors.cta}
        onChange={(next) => update(next)}
      />

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-3">
        <Field>
          <Label htmlFor={fieldId('starts-at')}>
            شروع بازه (به وقت تهران)
          </Label>
          <Input
            id={fieldId('starts-at')}
            type="datetime-local"
            dir="ltr"
            value={form.startsAt}
            disabled={disabled}
            invalid={Boolean(errors.startsAt)}
            onChange={(event) => update({ startsAt: event.target.value })}
          />
          <FieldErrorMessage
            id={errorId('starts-at')}
            message={errors.startsAt}
          />
        </Field>
        <Field>
          <Label htmlFor={fieldId('ends-at')}>پایان بازه (به وقت تهران)</Label>
          <Input
            id={fieldId('ends-at')}
            type="datetime-local"
            dir="ltr"
            value={form.endsAt}
            disabled={disabled}
            invalid={Boolean(errors.endsAt)}
            onChange={(event) => update({ endsAt: event.target.value })}
          />
          <FieldErrorMessage
            id={errorId('ends-at')}
            message={errors.endsAt}
          />
        </Field>
        <Field>
          <Label htmlFor={fieldId('priority')}>اولویت</Label>
          <Input
            id={fieldId('priority')}
            type="number"
            min={0}
            max={CAMPAIGN_PRIORITY_MAX}
            value={form.priority}
            disabled={disabled}
            invalid={Boolean(errors.priority)}
            onChange={(event) => update({ priority: event.target.value })}
          />
          <FieldErrorMessage
            id={errorId('priority')}
            message={errors.priority}
          />
        </Field>
        <Text className="text-xs text-muted md:col-span-3">
          زمان‌ها به وقت تهران (Asia/Tehran) وارد و نمایش داده می‌شوند و پیش از
          ارسال به UTC تبدیل می‌شوند؛ منطقه زمانی مرورگر استفاده نمی‌شود.
        </Text>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.isEnabled}
          disabled={disabled}
          onChange={(event) => update({ isEnabled: event.target.checked })}
          className="size-4 rounded border-border accent-primary"
        />
        کمپین فعال باشد
      </label>
      <Text className="text-xs text-muted">
        فعال/غیرفعال کردن کمپین آن را منتشر نمی‌کند و محتوای صفحه اصلی را تغییر
        نمی‌دهد.
      </Text>
    </div>
  )
}
