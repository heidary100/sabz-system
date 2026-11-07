import { useRef, useState } from 'react'
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import clsx from 'clsx'
import { pendingClasses } from './editable-cell'

/**
 * Searchable single-value entity cell for the products grid (SS-270) —
 * brand/category inline editing. Same shell contract as EditableCell:
 * resting = text button (same aria-label), editing = searchable Combobox
 * over the EXISTING option endpoints (client-side filter; the 100-item
 * options cap is a documented gap, tracked in the overhaul plan §E). Clear
 * support is opt-in (`nullable`) — brand is nullable domain-side, category
 * is required.
 */
export interface EntityCellOption {
  value: string
  label: string
}

export interface EntityCellProps {
  /** `null` = no entity assigned (rendered as «بدون …» placeholder). */
  value: string | null
  options: EntityCellOption[]
  onChange: (value: string | null) => void
  ariaLabel: string
  /** Label shown for the "no entity" clear option (nullable only). */
  clearLabel?: string
  nullable?: boolean
  disabled?: boolean
  status: string
  error?: string
}

const optionLabel = (
  options: EntityCellOption[],
  value: string | null,
  clearLabel: string,
): string =>
  value === null
    ? clearLabel
    : (options.find((option) => option.value === value)?.label ?? value)

export function EntityCell({
  value,
  options,
  onChange,
  ariaLabel,
  clearLabel = 'بدون',
  nullable = false,
  disabled = false,
  status,
  error,
}: EntityCellProps) {
  const [editing, setEditing] = useState(false)
  const startValueRef = useRef(value)
  const [query, setQuery] = useState('')

  const beginEditing = (): void => {
    if (disabled) {
      return
    }
    startValueRef.current = value
    setQuery('')
    setEditing(true)
  }

  const endEditing = (): void => {
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="min-w-28" data-entity-cell={ariaLabel}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          title={optionLabel(options, value, clearLabel)}
          onClick={beginEditing}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault()
              beginEditing()
            }
          }}
          className={clsx(
            'block max-w-full truncate rounded-md px-1.5 py-0.5 text-start text-sm transition-colors',
            'hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/10',
            value === null && 'text-muted',
            pendingClasses(status),
          )}
        >
          {optionLabel(options, value, clearLabel)}
        </button>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

  const allOptions = nullable ? [{ value: '', label: clearLabel }, ...options] : options
  const filtered = allOptions.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="min-w-28">
      <Combobox
        nullable={false}
        value={value === null ? '' : value}
        onChange={(selected: string | null) => {
          // '' = the clear option (nullable only) → normalized to null.
          onChange(selected === '' || selected === null ? null : selected)
          endEditing()
        }}
        onClose={() => endEditing()}
        disabled={disabled}
      >
        <ComboboxInput
          autoFocus
          aria-label={ariaLabel}
          displayValue={() => optionLabel(options, value, clearLabel)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onChange(startValueRef.current)
              endEditing()
            }
          }}
          className="w-full rounded-lg border border-border bg-surface-strong px-2.5 py-1.5 text-sm"
        />
        <ComboboxOptions anchor="bottom start" className="z-50 max-h-56 min-w-52 overflow-y-auto rounded-xl border border-border bg-surface-strong p-1 shadow-xl">
          {filtered.map((option) => (
            <ComboboxOption
              key={option.value === '' ? '__clear__' : option.value}
              value={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm data-focus:bg-primary-subtle/60"
            >
              {option.label}
            </ComboboxOption>
          ))}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">موردی یافت نشد.</p>
          ) : null}
        </ComboboxOptions>
      </Combobox>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
