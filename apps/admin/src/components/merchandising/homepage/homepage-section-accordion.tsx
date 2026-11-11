import { useEffect, useRef } from 'react'
import type { ReactNode, Ref } from 'react'
import type {
  HomepageDraftSection,
  HomepageDraftValidationResult,
  HomepageSectionType,
} from '@sabz/types'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { EmptyState } from '../../ui/empty-state'
import { StatusBadge } from '../../ui/status-badge'
import { HomepageSectionAddControl } from './homepage-section-add-control'
import {
  groupHomepageValidation,
  sectionIssueCounts,
  sectionTypeLabel,
  type GroupedHomepageValidation,
} from '../../../lib/merchandising-homepage'

/**
 * The unified responsive section editor. It is the single tree for both
 * presentations: the outline occupies the start column and the one selected
 * configuration panel occupies the end column on desktop; on tablet/mobile
 * the same panel follows the outline full-width. Because the panel keeps the
 * same React position (a sibling of the outline), changing the breakpoint does
 * not remount the active form.
 */
export function HomepageSectionAccordion({
  sections,
  selectedKey,
  validation,
  disabled = false,
  maxSections,
  desktop = false,
  focusRef,
  onSelect,
  onDeselect,
  onAdd,
  onMove,
  onRemove,
  onToggleVisibility,
  renderConfig,
}: {
  sections: HomepageDraftSection[]
  selectedKey: string | null
  validation: HomepageDraftValidationResult | null
  disabled?: boolean
  maxSections: number
  desktop?: boolean
  focusRef?: Ref<HTMLDivElement>
  onSelect: (key: string) => void
  onDeselect?: () => void
  onAdd: (type: HomepageSectionType) => string | null
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
  onToggleVisibility: (index: number) => void
  renderConfig: (section: HomepageDraftSection, index: number) => ReactNode
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const pendingFocusIndex = useRef<number | null>(null)
  const grouping: GroupedHomepageValidation | null = validation
    ? groupHomepageValidation(validation, sections.length)
    : null
  const selectedIndex = selectedKey
    ? sections.findIndex((section) => section.key === selectedKey)
    : -1
  const selectedSection =
    selectedIndex >= 0 ? sections[selectedIndex] : undefined

  useEffect(() => {
    if (pendingFocusIndex.current === null) {
      return
    }
    const targetIndex = pendingFocusIndex.current
    pendingFocusIndex.current = null
    const headers = listRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-accordion-header]',
    )
    if (headers && headers.length > 0) {
      headers[Math.min(targetIndex, headers.length - 1)]?.focus()
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
      aria-labelledby="homepage-accordion-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="homepage-accordion-heading"
            className="text-sm font-semibold text-foreground"
          >
            ساختار بخش‌ها
          </h2>
          <Text className="text-xs text-muted">
            هر بخش را باز کنید تا تنظیمات آن را ویرایش کنید. ترتیب آرایه، ترتیب
            نمایش در صفحه اصلی است.
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

      <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-4">
      <ol
        ref={listRef}
        tabIndex={-1}
        aria-label="بخش‌های صفحه اصلی"
        className="relative min-w-0 space-y-2 lg:col-start-1 lg:row-start-1"
      >
        {sections.map((section, index) => {
          const counts = sectionIssueCounts(grouping, index)
          const selected = section.key === selectedKey
          const headerId = `homepage-accordion-header-${section.key}`
          const panelId = `homepage-accordion-panel-${section.key}`
          return (
            <li key={section.key} id={`homepage-section-row-${index}`}>
              <div
                className={
                  selected
                    ? 'rounded-xl border border-primary-border bg-primary-subtle'
                    : 'rounded-xl border border-border bg-background/40'
                }
              >
                <h3>
                  <button
                    type="button"
                    data-accordion-header
                    id={headerId}
                    aria-expanded={selected}
                    aria-controls={selected ? panelId : undefined}
                    onClick={() =>
                      selected ? onDeselect?.() : onSelect(section.key)
                    }
                    className="focus-ring flex w-full flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 text-start"
                  >
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
                    <span className="ms-auto" aria-hidden="true">
                      {selected ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </span>
                  </button>
                </h3>

                <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
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
              </div>
            </li>
          )
        })}
      </ol>

      <div
        data-homepage-config-pane
        className="mt-4 min-w-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:mt-0"
      >
        {selectedSection ? (
          <div
            ref={focusRef}
            id={`homepage-accordion-panel-${selectedSection.key}`}
            role="region"
            aria-labelledby={`homepage-accordion-header-${selectedSection.key}`}
            tabIndex={-1}
            className="focus-ring rounded-xl lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            {renderConfig(selectedSection, selectedIndex)}
          </div>
        ) : desktop ? (
          <EmptyState
            size="compact"
            title="بخشی را برای بررسی انتخاب کنید"
            description="از فهرست ساختار، یک بخش را انتخاب کنید تا تنظیمات آن را ببینید."
          />
        ) : null}
      </div>
      </div>
    </section>
  )
}
