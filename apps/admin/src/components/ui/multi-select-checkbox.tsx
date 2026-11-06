import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

/**
 * Reusable multi-select with checkbox options (SS-257 advanced filters).
 * Used for brand/category/status on the products grid; the selected count
 * shows on the closed button so several active filters stay scannable.
 */
export interface MultiSelectOption {
  value: string
  label: string
}

export interface MultiSelectCheckboxProps {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  className?: string
}

export function MultiSelectCheckbox({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  className,
}: MultiSelectCheckboxProps) {
  const selectedLabels = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label)

  return (
    <Listbox multiple disabled={disabled} value={selected} onChange={onChange}>
      <div className={clsx('relative', className)}>
        <ListboxButton
          className={clsx(
            'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-primary',
            selectedLabels.length > 0 && 'border-primary/60',
          )}
        >
          <span className="truncate text-start">
            {label}
            {selectedLabels.length > 0 ? (
              <span className="ms-2 rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">
                {selectedLabels.length}
              </span>
            ) : null}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-50 max-h-72 min-w-56 overflow-y-auto rounded-xl border border-border bg-surface-strong p-1 shadow-xl"
        >
          {selectedLabels.length > 0 ? (
            <li
              className="truncate border-b border-border px-3 py-2 text-xs text-muted"
              title={selectedLabels.join('، ')}
            >
              {selectedLabels.join('، ')}
            </li>
          ) : null}
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-focus:bg-primary-subtle/60"
            >
              {/* Display-only checkbox: the Listbox owns selection state. */}
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                readOnly
                tabIndex={-1}
                aria-hidden
                className="pointer-events-none"
              />
              <span className="flex-1">{option.label}</span>
              {selected.includes(option.value) ? (
                <Check className="size-4 text-primary" aria-hidden />
              ) : null}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
