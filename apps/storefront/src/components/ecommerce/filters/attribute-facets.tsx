'use client';

import { useState } from 'react'
import type { CatalogFacetsResponse } from '@sabz/types'
import { formatFaNumber } from '@/lib/format'
import { parseAttrs } from '@/lib/listing'

/**
 * Category-aware attribute facets (SS-900): select/multi-select, boolean and
 * numeric controls generated from the category's configured filterable
 * attributes. Values update the `attrs` URL JSON through the listing state,
 * so filters stay shareable and server-validated.
 */
export function AttributeFacets({
  facets,
  attrs,
  onApply,
}: {
  facets: CatalogFacetsResponse | null
  attrs: string
  onApply: (next: Record<string, unknown>) => void
}) {
  const [open, setOpen] = useState(true)
  const [numericDrafts, setNumericDrafts] = useState<Record<string, { min: string; max: string }>>({})
  if (!facets || facets.attributes.length === 0) {
    return null
  }
  const selected = parseAttrs(attrs) ?? {}

  function commit(next: Record<string, unknown>) {
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, value]) => {
        if (value === null || value === undefined || value === '') return false
        if (Array.isArray(value)) return value.length > 0
        if (typeof value === 'object') {
          const row = value as { min?: unknown; max?: unknown }
          return row.min !== undefined || row.max !== undefined
        }
        return true
      }),
    )
    onApply(cleaned)
  }

  function toggleOption(slug: string, optionSlug: string, multi: boolean) {
    const current = selected[slug]
    const list = Array.isArray(current)
      ? current.filter((value): value is string => typeof value === 'string')
      : typeof current === 'string'
        ? [current]
        : []
    const exists = list.includes(optionSlug)
    let nextValues: string[]
    if (multi) {
      nextValues = exists ? list.filter((value) => value !== optionSlug) : [...list, optionSlug]
    } else {
      nextValues = exists ? [] : [optionSlug]
    }
    commit({ ...selected, [slug]: nextValues })
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between text-sm font-semibold text-fg"
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="size-4 text-accent" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M12 4v6M8 14v6" strokeLinecap="round" /></svg>
          ویژگی‌ها
        </span>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className={`size-4 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="mt-2 space-y-4">
          {facets.attributes.map((attribute) => {
            const current = selected[attribute.slug]
            const selectedList = Array.isArray(current)
              ? current.filter((value): value is string => typeof value === 'string')
              : typeof current === 'string'
                ? [current]
                : []
            if (attribute.valueType === 'SELECT' || attribute.valueType === 'MULTI_SELECT') {
              return (
                <fieldset key={attribute.attributeId}>
                  <legend className="text-xs font-semibold text-fg-secondary">
                    {attribute.name}
                    {attribute.unit ? ` (${attribute.unit})` : ''}
                  </legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {attribute.options.map((option) => {
                      const checked = selectedList.includes(option.slug)
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={checked}
                          onClick={() =>
                            toggleOption(
                              attribute.slug,
                              option.slug,
                              attribute.valueType === 'MULTI_SELECT',
                            )
                          }
                          className={`inline-flex min-h-9 items-center gap-1 rounded-pill px-2.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                            checked
                              ? 'bg-accent text-on-accent ring-accent'
                              : 'bg-surface text-fg-secondary ring-border hover:text-accent'
                          }`}
                        >
                          {option.value}
                          <span className={checked ? 'text-on-accent/70' : 'text-fg-muted'}>
                            {formatFaNumber(option.count)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )
            }
            if (attribute.valueType === 'BOOLEAN') {
              const active = current === true
              return (
                <label key={attribute.attributeId} className="flex min-h-11 items-center gap-2 text-sm text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => commit({ ...selected, [attribute.slug]: active ? undefined : true })}
                    className="size-4 accent-accent"
                  />
                  {attribute.name}
                </label>
              )
            }
            if (attribute.valueType === 'NUMBER') {
              const draft = numericDrafts[attribute.slug] ?? { min: '', max: '' }
              return (
                <fieldset key={attribute.attributeId}>
                  <legend className="text-xs font-semibold text-fg-secondary">
                    {attribute.name}
                    {attribute.unit ? ` (${attribute.unit})` : ''}
                  </legend>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      value={draft.min}
                      onChange={(event) =>
                        setNumericDrafts((rows) => ({
                          ...rows,
                          [attribute.slug]: { ...draft, min: event.target.value },
                        }))
                      }
                      placeholder={attribute.numericMin !== null ? String(attribute.numericMin) : 'از'}
                      aria-label={`حداقل ${attribute.name}`}
                      className="h-9 w-full min-w-0 rounded-control bg-surface-2 px-2 text-xs text-fg ring-1 ring-inset ring-border focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    <span className="text-xs text-fg-muted">تا</span>
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      value={draft.max}
                      onChange={(event) =>
                        setNumericDrafts((rows) => ({
                          ...rows,
                          [attribute.slug]: { ...draft, max: event.target.value },
                        }))
                      }
                      placeholder={attribute.numericMax !== null ? String(attribute.numericMax) : 'تا'}
                      aria-label={`حداکثر ${attribute.name}`}
                      className="h-9 w-full min-w-0 rounded-control bg-surface-2 px-2 text-xs text-fg ring-1 ring-inset ring-border focus-visible:ring-2 focus-visible:ring-focus"
                    />
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        commit({
                          ...selected,
                          [attribute.slug]: {
                            ...(draft.min !== '' ? { min: Number(draft.min) } : {}),
                            ...(draft.max !== '' ? { max: Number(draft.max) } : {}),
                          },
                        })
                      }
                      className="min-h-9 rounded-control bg-surface-2 px-2.5 text-xs font-semibold text-accent hover:bg-accent-soft"
                    >
                      اعمال
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNumericDrafts((rows) => ({
                          ...rows,
                          [attribute.slug]: { min: '', max: '' },
                        }))
                        const next = { ...selected }
                        delete next[attribute.slug]
                        commit(next)
                      }}
                      className="min-h-9 rounded-control px-2.5 text-xs text-fg-muted hover:text-fg"
                    >
                      حذف
                    </button>
                  </div>
                </fieldset>
              )
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}
