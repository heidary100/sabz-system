import { useState } from 'react'
import type {
  HomepageDraftSection,
  HomepageSectionType,
} from '@sabz/types'
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import {
  HOMEPAGE_SECTION_REGISTRY,
  HOMEPAGE_SECTION_TYPE_ORDER,
  groupHomepageValidation,
  sectionIssueCounts,
  sectionTypeLabel,
  type GroupedHomepageValidation,
} from '../../../lib/merchandising-homepage'
import type { HomepageDraftValidationResult } from '@sabz/types'

export function HomepageSectionOutline({
  sections,
  selectedKey,
  validation,
  disabled = false,
  maxSections,
  onSelect,
  onAdd,
  onMove,
  onRemove,
  onToggleVisibility,
}: {
  sections: HomepageDraftSection[]
  selectedKey: string | null
  validation: HomepageDraftValidationResult | null
  disabled?: boolean
  maxSections: number
  onSelect: (key: string) => void
  onAdd: (type: HomepageSectionType) => string | null
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
  onToggleVisibility: (index: number) => void
}) {
  const [addType, setAddType] = useState<HomepageSectionType>('TRUST_STRIP')
  const [addError, setAddError] = useState<string | null>(null)
  const selection = HOMEPAGE_SECTION_REGISTRY[addType]
  const maxReached = sections.length >= maxSections
  const grouping: GroupedHomepageValidation | null = validation
    ? groupHomepageValidation(validation, sections.length)
    : null

  const handleAdd = (): void => {
    setAddError(null)
    const error = onAdd(addType)
    if (error) {
      setAddError(error)
    }
  }

  return (
    <section
      aria-labelledby="homepage-outline-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="homepage-outline-heading"
            className="text-sm font-semibold text-foreground"
          >
            ساختار بخش‌ها
          </h2>
          <Text className="text-xs text-muted">
            ترتیب آرایه، ترتیب نمایش در صفحه اصلی است.
          </Text>
        </div>
        <StatusBadge tone="neutral">
          {sections.length.toLocaleString('fa-IR')} از{' '}
          {maxSections.toLocaleString('fa-IR')}
        </StatusBadge>
      </div>

      <div className="space-y-2">
        <Field>
          <Label htmlFor="homepage-add-section-type">افزودن بخش</Label>
          <Select
            id="homepage-add-section-type"
            value={addType}
            disabled={disabled || maxReached}
            onChange={(event) =>
              setAddType(event.target.value as HomepageSectionType)
            }
          >
            {HOMEPAGE_SECTION_TYPE_ORDER.map((type) => {
              const definition = HOMEPAGE_SECTION_REGISTRY[type]
              return (
                <option key={type} value={type}>
                  {definition.label}
                  {!definition.canAdd ? ' — ایجاد در گام بعدی' : ''}
                </option>
              )
            })}
          </Select>
        </Field>
        <Text className="text-xs text-muted">{selection.description}</Text>
        {!selection.canAdd && selection.unavailableReason && (
          <Text className="text-xs text-warning">
            {selection.unavailableReason}
          </Text>
        )}
        {addError && <InlineError message={addError} />}
        <Button
          outline
          disabled={disabled || maxReached || !selection.canAdd}
          onClick={handleAdd}
        >
          <Plus data-slot="icon" />
          افزودن بخش
        </Button>
        {maxReached && (
          <Text className="text-xs text-muted">
            حداکثر تعداد بخش‌ها تکمیل شده است.
          </Text>
        )}
      </div>

      {sections.length === 0 ? (
        <Text className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-8 text-center text-sm text-muted">
          هنوز بخشی به صفحه اصلی اضافه نشده است.
        </Text>
      ) : (
        <ol className="space-y-2">
          {sections.map((section, index) => {
            const counts = sectionIssueCounts(grouping, index)
            const selected = section.key === selectedKey
            return (
              <li
                key={section.key}
                id={`homepage-section-row-${index}`}
                className={
                  selected
                    ? 'rounded-xl border border-primary-border bg-primary-subtle p-2'
                    : 'rounded-xl border border-border bg-background/40 p-2'
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`انتخاب بخش ${sectionTypeLabel(section.type)}`}
                    onClick={() => onSelect(section.key)}
                    className="focus-ring min-w-0 flex-1 rounded-lg px-2 py-1.5 text-start"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-semibold tabular-nums text-foreground">
                        {(index + 1).toLocaleString('fa-IR')}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">
                        {sectionTypeLabel(section.type)}
                      </span>
                      <span className="truncate text-xs text-muted" dir="ltr">
                        {section.key}
                      </span>
                      {!section.isVisible && (
                        <StatusBadge tone="neutral">پنهان</StatusBadge>
                      )}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1">
                    {counts.errors > 0 && (
                      <StatusBadge tone="danger">
                        {counts.errors.toLocaleString('fa-IR')} خطا
                      </StatusBadge>
                    )}
                    {counts.warnings > 0 && (
                      <StatusBadge tone="warning">
                        {counts.warnings.toLocaleString('fa-IR')} هشدار
                      </StatusBadge>
                    )}
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1 ps-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={section.isVisible}
                      disabled={disabled}
                      aria-label={`نمایش بخش ${sectionTypeLabel(section.type)}`}
                      onChange={() => onToggleVisibility(index)}
                      className="size-4 rounded border-border accent-primary"
                    />
                    نمایش
                  </label>
                  <Button
                    plain
                    aria-label={`جابه‌جایی ${sectionTypeLabel(section.type)} به بالا`}
                    disabled={disabled || index === 0}
                    onClick={() => onMove(index, -1)}
                  >
                    <ChevronUp data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    aria-label={`جابه‌جایی ${sectionTypeLabel(section.type)} به پایین`}
                    disabled={disabled || index === sections.length - 1}
                    onClick={() => onMove(index, 1)}
                  >
                    <ChevronDown data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    aria-label={`حذف بخش ${sectionTypeLabel(section.type)}`}
                    disabled={disabled}
                    onClick={() => {
                      if (
                        window.confirm(
                          `بخش «${sectionTypeLabel(section.type)}» از پیش‌نویس حذف شود؟`,
                        )
                      ) {
                        onRemove(index)
                      }
                    }}
                  >
                    <Trash2 data-slot="icon" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
