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
  onMove,
  onRemove,
}: {
  items: OrderedEntityItem[]
  emptyLabel: string
  disabled?: boolean
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
}) {
  if (items.length === 0) {
    return <Text className="text-sm text-muted">{emptyLabel}</Text>
  }

  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-surface">
      {items.map((item, index) => (
        <li
          key={item.id}
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
              onClick={() => onRemove(item.id)}
            >
              <Trash2 data-slot="icon" />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  )
}
