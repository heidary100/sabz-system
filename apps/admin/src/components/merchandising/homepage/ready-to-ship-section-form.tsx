import type {
  HomepageValidationIssue,
  ReadyToShipSection,
} from '@sabz/types'
import { MERCH_READY_TO_SHIP_MAX_PRODUCTS } from '@sabz/types'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Text } from '../../catalyst/text'
import { Textarea } from '../../catalyst/textarea'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'

function FieldError({ message }: { message: string | null }) {
  return message ? <Text className="text-sm text-danger">{message}</Text> : null
}

export function ReadyToShipSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: ReadyToShipSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: ReadyToShipSection['settings']) => void
}) {
  const update = (patch: Partial<ReadyToShipSection['settings']>): void => {
    onSettingsChange({ ...section.settings, ...patch })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
        <Field>
          <Label htmlFor="ready-to-ship-title">عنوان (اختیاری)</Label>
          <Input
            id="ready-to-ship-title"
            value={section.settings.title ?? ''}
            maxLength={120}
            disabled={disabled}
            onChange={(event) =>
              update({
                title:
                  event.target.value === '' ? undefined : event.target.value,
              })
            }
          />
          <Text className="text-xs text-muted">حداکثر ۱۲۰ کاراکتر.</Text>
          <FieldError
            message={firstValidationMessage(issues, basePath, 'title')}
          />
        </Field>
        <Field>
          <Label htmlFor="ready-to-ship-limit">تعداد محصولات</Label>
          <Input
            id="ready-to-ship-limit"
            type="number"
            min={1}
            max={MERCH_READY_TO_SHIP_MAX_PRODUCTS}
            value={section.settings.limit}
            disabled={disabled}
            onChange={(event) =>
              update({ limit: Number(event.target.value) })
            }
          />
          <Text className="text-xs text-muted">
            ۱ تا {MERCH_READY_TO_SHIP_MAX_PRODUCTS.toLocaleString('fa-IR')}
          </Text>
          <FieldError
            message={firstValidationMessage(issues, basePath, 'limit')}
          />
        </Field>
      </div>

      <Field>
        <Label htmlFor="ready-to-ship-subtitle">زیرعنوان (اختیاری)</Label>
        <Textarea
          id="ready-to-ship-subtitle"
          rows={2}
          value={section.settings.subtitle ?? ''}
          maxLength={240}
          disabled={disabled}
          onChange={(event) =>
            update({
              subtitle:
                event.target.value === '' ? undefined : event.target.value,
            })
          }
        />
        <Text className="text-xs text-muted">حداکثر ۲۴۰ کاراکتر.</Text>
        <FieldError
          message={firstValidationMessage(issues, basePath, 'subtitle')}
        />
      </Field>

      <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
        <Text className="text-xs text-muted">
          محصولات این بخش به‌صورت خودکار از محصولات منتشرشده و موجود انتخاب
          می‌شوند؛ این بخش فیلد انتخاب محصول ندارد. «تعداد محصولات» فقط سقف
          نمایش را تعیین می‌کند و ممکن است تعداد واقعی محصولات موجود کمتر باشد.
        </Text>
      </div>
    </div>
  )
}
