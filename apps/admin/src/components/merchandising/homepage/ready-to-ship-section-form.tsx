import { useId } from 'react'
import type {
  HomepageValidationIssue,
  ReadyToShipSection,
} from '@sabz/types'
import { MERCH_READY_TO_SHIP_MAX_PRODUCTS } from '@sabz/types'
import { Description, Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Text } from '../../catalyst/text'
import { Textarea } from '../../catalyst/textarea'
import { FieldErrorMessage } from '../../ui/field-error'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'

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
  const uid = useId()
  const fieldId = (name: string): string => `ready-to-ship-${uid}-${name}`
  const errorId = (name: string): string => `${fieldId(name)}-error`
  const descriptionId = (name: string): string =>
    `${fieldId(name)}-description`

  const titleError = firstValidationMessage(issues, basePath, 'title')
  const limitError = firstValidationMessage(issues, basePath, 'limit')
  const subtitleError = firstValidationMessage(issues, basePath, 'subtitle')

  const update = (patch: Partial<ReadyToShipSection['settings']>): void => {
    onSettingsChange({ ...section.settings, ...patch })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
        <Field>
          <Label htmlFor={fieldId('title')}>عنوان (اختیاری)</Label>
          <Input
            id={fieldId('title')}
            value={section.settings.title ?? ''}
            maxLength={120}
            disabled={disabled}
            invalid={Boolean(titleError)}
            onChange={(event) =>
              update({
                title:
                  event.target.value === '' ? undefined : event.target.value,
              })
            }
          />
          <Description className="text-xs text-muted" id={descriptionId('title')}>
            حداکثر ۱۲۰ کاراکتر.
          </Description>
          <FieldErrorMessage id={errorId('title')} message={titleError} />
        </Field>
        <Field>
          <Label htmlFor={fieldId('limit')}>تعداد محصولات</Label>
          <Input
            id={fieldId('limit')}
            type="number"
            min={1}
            max={MERCH_READY_TO_SHIP_MAX_PRODUCTS}
            value={section.settings.limit}
            disabled={disabled}
            invalid={Boolean(limitError)}
            onChange={(event) =>
              update({ limit: Number(event.target.value) })
            }
          />
          <Description className="text-xs text-muted" id={descriptionId('limit')}>
            ۱ تا {MERCH_READY_TO_SHIP_MAX_PRODUCTS.toLocaleString('fa-IR')}
          </Description>
          <FieldErrorMessage id={errorId('limit')} message={limitError} />
        </Field>
      </div>

      <Field>
        <Label htmlFor={fieldId('subtitle')}>زیرعنوان (اختیاری)</Label>
        <Textarea
          id={fieldId('subtitle')}
          rows={2}
          value={section.settings.subtitle ?? ''}
          maxLength={240}
          disabled={disabled}
          invalid={Boolean(subtitleError)}
          onChange={(event) =>
            update({
              subtitle:
                event.target.value === '' ? undefined : event.target.value,
            })
          }
        />
        <Description className="text-xs text-muted" id={descriptionId('subtitle')}>
          حداکثر ۲۴۰ کاراکتر.
        </Description>
        <FieldErrorMessage id={errorId('subtitle')} message={subtitleError} />
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
