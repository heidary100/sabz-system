import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { Textarea } from '../../catalyst/textarea'
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

function FieldError({ message }: { message?: string }) {
  return message ? <Text className="text-sm text-danger">{message}</Text> : null
}

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
  const update = (patch: Partial<CampaignFormState>): void => {
    onChange({ ...form, ...patch })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor="campaign-internal-name">نام داخلی</Label>
          <Input
            id="campaign-internal-name"
            value={form.internalName}
            maxLength={CAMPAIGN_TEXT_LIMITS.internalName}
            disabled={disabled}
            onChange={(event) => update({ internalName: event.target.value })}
            placeholder="مثلاً کمپین نوروز ۱۴۰۵"
          />
          <Text className="text-xs text-muted">
            فقط برای شناسایی در پنل مدیریت.
          </Text>
          <FieldError message={errors.internalName} />
        </Field>

        <Field>
          <Label htmlFor="campaign-type-select">نوع کمپین</Label>
          <Select
            id="campaign-type-select"
            value={form.type}
            disabled={disabled}
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
          <Text className="text-xs text-muted">
            نوع کمپین فقط برچسب اداری است و محدودیت ترکیب ایجاد نمی‌کند.
          </Text>
          <FieldError message={errors.type} />
        </Field>

        <Field className="md:col-span-2">
          <Label htmlFor="campaign-title">عنوان فارسی</Label>
          <Input
            id="campaign-title"
            value={form.titleFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.titleFa}
            disabled={disabled}
            onChange={(event) => update({ titleFa: event.target.value })}
          />
          <FieldError message={errors.titleFa} />
        </Field>

        <Field>
          <Label htmlFor="campaign-eyebrow">متن بالای عنوان (اختیاری)</Label>
          <Input
            id="campaign-eyebrow"
            value={form.eyebrowFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.eyebrowFa}
            disabled={disabled}
            onChange={(event) => update({ eyebrowFa: event.target.value })}
          />
          <FieldError message={errors.eyebrowFa} />
        </Field>

        <Field>
          <Label htmlFor="campaign-subtitle">زیرعنوان (اختیاری)</Label>
          <Input
            id="campaign-subtitle"
            value={form.subtitleFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.subtitleFa}
            disabled={disabled}
            onChange={(event) => update({ subtitleFa: event.target.value })}
          />
          <FieldError message={errors.subtitleFa} />
        </Field>

        <Field className="md:col-span-2">
          <Label htmlFor="campaign-description">توضیحات (اختیاری)</Label>
          <Textarea
            id="campaign-description"
            rows={3}
            value={form.descriptionFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.descriptionFa}
            disabled={disabled}
            onChange={(event) => update({ descriptionFa: event.target.value })}
          />
          <FieldError message={errors.descriptionFa} />
        </Field>

        <Field className="md:col-span-2">
          <Label htmlFor="campaign-cta-label">متن دکمه فراخوان</Label>
          <Input
            id="campaign-cta-label"
            value={form.ctaLabelFa}
            maxLength={CAMPAIGN_TEXT_LIMITS.ctaLabelFa}
            disabled={disabled}
            onChange={(event) => update({ ctaLabelFa: event.target.value })}
          />
          <Text className="text-xs text-muted">
            برای هر مقصدی جز «بدون فراخوان» الزامی است.
          </Text>
          <FieldError message={errors.ctaLabelFa} />
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
          <Label htmlFor="campaign-starts-at">شروع بازه (به وقت تهران)</Label>
          <Input
            id="campaign-starts-at"
            type="datetime-local"
            dir="ltr"
            value={form.startsAt}
            disabled={disabled}
            onChange={(event) => update({ startsAt: event.target.value })}
          />
          <FieldError message={errors.startsAt} />
        </Field>
        <Field>
          <Label htmlFor="campaign-ends-at">پایان بازه (به وقت تهران)</Label>
          <Input
            id="campaign-ends-at"
            type="datetime-local"
            dir="ltr"
            value={form.endsAt}
            disabled={disabled}
            onChange={(event) => update({ endsAt: event.target.value })}
          />
          <FieldError message={errors.endsAt} />
        </Field>
        <Field>
          <Label htmlFor="campaign-priority">اولویت</Label>
          <Input
            id="campaign-priority"
            type="number"
            min={0}
            max={CAMPAIGN_PRIORITY_MAX}
            value={form.priority}
            disabled={disabled}
            onChange={(event) => update({ priority: event.target.value })}
          />
          <FieldError message={errors.priority} />
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
