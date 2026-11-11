import { useEffect, useRef } from 'react'
import type { HomepageDraftSection, HomepageSectionType } from '@sabz/types'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { StatusBadge } from '../../ui/status-badge'
import { HomepageSectionAddControl } from './homepage-section-add-control'
import {
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
  const listRef = useRef<HTMLDivElement>(null)
  const pendingFocusIndex = useRef<number | null>(null)
  const grouping: GroupedHomepageValidation | null = validation
    ? groupHomepageValidation(validation, sections.length)
    : null

  useEffect(() => {
    if (pendingFocusIndex.current === null) {
      return
    }
    const targetIndex = pendingFocusIndex.current
    pendingFocusIndex.current = null
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-section-select]',
    )
    if (buttons && buttons.length > 0) {
      buttons[Math.min(targetIndex, buttons.length - 1)]?.focus()
      return
    }
    const addControl =
      listRef.current
        ?.closest('section')
        ?.querySelector<HTMLElement>('[data-homepage-add]') ?? null
    ;(addControl ?? listRef.current)?.focus()
  }, [sections])

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

      <HomepageSectionAddControl
        sectionCount={sections.length}
        maxSections={maxSections}
        disabled={disabled}
        onAdd={onAdd}
      />

      <div ref={listRef} tabIndex={-1}>
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
                      data-section-select
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
                          pendingFocusIndex.current = index
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
      </div>
    </section>
  )
}
