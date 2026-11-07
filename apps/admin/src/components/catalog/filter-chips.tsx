import { X } from 'lucide-react'

/**
 * Active-filter chips for the products grid (SS-257 advanced filters). Each
 * chip removes exactly one filter; «حذف فیلترها» clears the rest at once.
 */
export interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

export interface FilterChipsProps {
  chips: FilterChip[]
  onClearAll: () => void
}

export function FilterChips({ chips, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="فیلترهای فعال">
      {chips.map((chip) => (
        <span
          key={chip.key}
          role="listitem"
          className="flex items-center gap-1 rounded-lg border border-border bg-surface-strong py-0.5 pe-1 ps-2.5 text-xs font-medium text-foreground shadow-xs"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`حذف فیلتر ${chip.label}`}
            className="rounded-md p-0.5 text-muted transition hover:bg-danger-subtle hover:text-danger"
            onClick={chip.onRemove}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="ms-1 text-xs font-medium text-primary hover:underline"
        onClick={onClearAll}
      >
        حذف فیلترها
      </button>
    </div>
  )
}
