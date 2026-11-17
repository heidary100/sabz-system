import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'

export interface OrderedEntityItem {
  id: string
  label: string
  secondary?: string | null
}

export function CampaignOrderedEntityList({
  items,
  emptyLabel,
  disabled = false,
  describedBy,
  onMove,
  onRemove,
}: {
  items: OrderedEntityItem[]
  emptyLabel: string
  disabled?: boolean
  describedBy?: string
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const pendingFocusIndex = useRef<number | null>(null)

  useEffect(() => {
    if (pendingFocusIndex.current === null) {
      return
    }
    const targetIndex = pendingFocusIndex.current
    pendingFocusIndex.current = null
    const rows = listRef.current?.querySelectorAll<HTMLElement>(
      '[data-ordered-row]',
    )
    if (!rows || rows.length === 0) {
      const addControl =
        listRef.current
          ?.closest('section')
          ?.querySelector<HTMLElement>('[data-add-control]') ?? null
      ;(addControl ?? listRef.current)?.focus()
      return
    }
    const row = rows[Math.min(targetIndex, rows.length - 1)]
    const target =
      row?.querySelector<HTMLButtonElement>('button:not([disabled])') ??
      row?.querySelector<HTMLButtonElement>('button')
    ;(target ?? listRef.current)?.focus()
  }, [items])

  if (items.length === 0) {
    return (
      <div
        ref={listRef}
        role="group"
        tabIndex={-1}
        aria-describedby={describedBy}
        aria-label="فهرست خالی"
      >
        <Text className="text-sm text-muted">{emptyLabel}</Text>
      </div>
    )
  }

  return (
    <div ref={listRef} tabIndex={-1} aria-describedby={describedBy}>
      <ol className="divide-y divide-border rounded-xl border border-border bg-surface">
        {items.map((item, index) => (
          <li
            key={item.id}
            data-ordered-row={index}
            className="flex flex-wrap items-center gap-2 px-3 py-2"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary tabular-nums">
              {(index + 1).toLocaleString('fa-IR')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {item.label}
              </p>
              {item.secondary && (
                <p dir="ltr" className="truncate text-xs text-muted">
                  {item.secondary}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                plain
                aria-label={`جابه‌جایی ${item.label} به بالا`}
                disabled={disabled || index === 0}
                onClick={() => onMove(item.id, -1)}
              >
                <ChevronUp data-slot="icon" />
              </Button>
              <Button
                plain
                aria-label={`جابه‌جایی ${item.label} به پایین`}
                disabled={disabled || index === items.length - 1}
                onClick={() => onMove(item.id, 1)}
              >
                <ChevronDown data-slot="icon" />
              </Button>
              <Button
                plain
                aria-label={`حذف ${item.label}`}
                disabled={disabled}
                onClick={() => {
                  pendingFocusIndex.current = index
                  onRemove(item.id)
                }}
              >
                <Trash2 data-slot="icon" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
