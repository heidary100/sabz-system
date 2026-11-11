import { useId } from 'react'
import type {
  HomepageValidationIssue,
  MerchTrustItem,
  TrustStripSection,
} from '@sabz/types'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { MERCH_TRUST_STRIP_MAX_ITEMS } from '@sabz/types'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Textarea } from '../../catalyst/textarea'
import { Text } from '../../catalyst/text'
import { FieldErrorMessage } from '../../ui/field-error'
import {
  MERCH_TRUST_ICON_LABELS,
  MERCH_TRUST_ICON_ORDER,
} from '../../../lib/merchandising-labels'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'

export function TrustStripSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: TrustStripSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: TrustStripSection['settings']) => void
}) {
  const uid = useId()
  const fieldId = (index: number, name: string): string =>
    `trust-${uid}-${index}-${name}`
  const items = section.settings.items
  const update = (next: MerchTrustItem[]): void => {
    onSettingsChange({ items: next })
  }
  const patch = (index: number, value: Partial<MerchTrustItem>): void => {
    update(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...value } : item,
      ),
    )
  }
  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= items.length) {
      return
    }
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    update(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            آیتم‌های نوار اعتماد ({items.length.toLocaleString('fa-IR')} از{' '}
            {MERCH_TRUST_STRIP_MAX_ITEMS.toLocaleString('fa-IR')})
          </p>
          <Text className="text-xs text-muted">
            نوار خالی مجاز است. ترتیب آیتم‌ها در نسخه منتشرشده حفظ می‌شود.
          </Text>
        </div>
        <Button
          outline
          disabled={disabled || items.length >= MERCH_TRUST_STRIP_MAX_ITEMS}
          onClick={() =>
            update([
              ...items,
              { icon: 'shield', title: '', body: undefined },
            ])
          }
        >
          <Plus data-slot="icon" />
          افزودن آیتم
        </Button>
      </div>

      {items.length === 0 ? (
        <Text className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-muted">
          نوار اعتماد خالی است. می‌توانید بدون آیتم ذخیره کنید.
        </Text>
      ) : (
        <ol className="space-y-3">
          {items.map((item, index) => {
            const displayIndex = (index + 1).toLocaleString('fa-IR')
            return (
            <li
              key={index}
              className="rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  آیتم {displayIndex}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    plain
                    aria-label={`جابه‌جایی آیتم ${displayIndex} به بالا`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    aria-label={`جابه‌جایی آیتم ${displayIndex} به پایین`}
                    disabled={disabled || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    aria-label={`حذف آیتم ${displayIndex}`}
                    disabled={disabled}
                    onClick={() =>
                      update(items.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Trash2 data-slot="icon" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <Field>
                  <Label htmlFor={fieldId(index, 'icon')}>آیکن</Label>
                  <Select
                    id={fieldId(index, 'icon')}
                    value={item.icon}
                    disabled={disabled}
                    onChange={(event) =>
                      patch(index, {
                        icon: event.target
                          .value as MerchTrustItem['icon'],
                      })
                    }
                  >
                    {MERCH_TRUST_ICON_ORDER.map((icon) => (
                      <option key={icon} value={icon}>
                        {MERCH_TRUST_ICON_LABELS[icon]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor={fieldId(index, 'title')}>عنوان</Label>
                  <Input
                    id={fieldId(index, 'title')}
                    value={item.title}
                    maxLength={120}
                    disabled={disabled}
                    invalid={Boolean(
                      firstValidationMessage(
                        issues,
                        basePath,
                        `items[${index}].title`,
                      ),
                    )}
                    onChange={(event) =>
                      patch(index, { title: event.target.value })
                    }
                  />
                  <FieldErrorMessage
                    id={`${fieldId(index, 'title')}-error`}
                    message={firstValidationMessage(
                      issues,
                      basePath,
                      `items[${index}].title`,
                    )}
                  />
                </Field>
              </div>

              <Field className="mt-3">
                <Label htmlFor={fieldId(index, 'body')}>
                  متن (اختیاری)
                </Label>
                <Textarea
                  id={fieldId(index, 'body')}
                  rows={2}
                  value={item.body ?? ''}
                  maxLength={240}
                  disabled={disabled}
                  invalid={Boolean(
                    firstValidationMessage(
                      issues,
                      basePath,
                      `items[${index}].body`,
                    ),
                  )}
                  onChange={(event) =>
                    patch(index, {
                      body:
                        event.target.value === ''
                          ? undefined
                          : event.target.value,
                    })
                  }
                />
                <FieldErrorMessage
                  id={`${fieldId(index, 'body')}-error`}
                  message={firstValidationMessage(
                    issues,
                    basePath,
                    `items[${index}].body`,
                  )}
                />
              </Field>
            </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
