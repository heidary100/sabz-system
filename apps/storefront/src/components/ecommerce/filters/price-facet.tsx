'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buildListingHref, type ListingState } from '@/lib/listing';
import { sanitizePriceBound } from '@/lib/price-input';

/** Quick ranges (Toman) — the scanning-friendly augmentation of the free inputs. */
const PRICE_PRESETS: Array<{ label: string; from: string; to: string }> = [
  { label: 'تا ۱ میلیون', from: '', to: '1000000' },
  { label: '۱ تا ۵ میلیون', from: '1000000', to: '5000000' },
  { label: '۵ تا ۲۰ میلیون', from: '5000000', to: '20000000' },
  { label: 'بالای ۲۰ میلیون', from: '20000000', to: '' },
];

/**
 * Price-range facet (SS-213, UI layer): two Toman inputs applied together on
 * submit — never a request per keystroke — plus quick-range preset chips
 * (SS-226). The server is authoritative; this component only sanitizes input
 * and navigates via the canonical `buildListingHref(basePath, …)`. Invalid
 * input blocks apply with an inline message instead of producing a broken URL.
 *
 * `formId` lets an external submit button (the mobile sheet's «نمایش نتایج»)
 * drive this form across the portal; `onApplied` fires only after a valid
 * commit so the sheet closes on success and stays open on a validation error.
 */
export function PriceFacet({
  state,
  basePath = '/products',
  formId,
  onApplied,
}: {
  state: ListingState;
  basePath?: string;
  formId?: string;
  onApplied?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(state.priceFrom);
  const [to, setTo] = useState(state.priceTo);
  const [error, setError] = useState('');
  const fromId = useId();
  const toId = useId();

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const nextFrom = sanitizePriceBound(from);
    const nextTo = sanitizePriceBound(to);
    if (nextFrom === null || nextTo === null) {
      setError('مبلغ واردشده معتبر نیست.');
      return;
    }
    setError('');
    startTransition(() => {
      router.push(
        buildListingHref(basePath, state, { priceFrom: nextFrom, priceTo: nextTo }),
      );
    });
    onApplied?.();
  }

  function clear() {
    setFrom('');
    setTo('');
    setError('');
    startTransition(() => {
      router.push(buildListingHref(basePath, state, { priceFrom: '', priceTo: '' }));
    });
  }

  const hasValue = state.priceFrom !== '' || state.priceTo !== '';

  return (
    <div className="mt-4 border-t border-border pt-4" aria-busy={pending}>
      <p className="text-sm font-semibold text-fg">محدوده قیمت (تومان)</p>
      <form id={formId} onSubmit={apply} className="mt-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={fromId} className="sr-only">
              حداقل قیمت به تومان
            </label>
            <input
              id={fromId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="از"
              className="w-full min-w-0 rounded-control border-0 bg-surface-2 py-2 px-3 text-sm text-fg ring-1 ring-inset ring-border-control placeholder:text-fg-secondary focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
          <span aria-hidden="true" className="shrink-0 text-xs text-fg-muted">
            تا
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor={toId} className="sr-only">
              حداکثر قیمت به تومان
            </label>
            <input
              id={toId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="تا"
              className="w-full min-w-0 rounded-control border-0 bg-surface-2 py-2 px-3 text-sm text-fg ring-1 ring-inset ring-border-control placeholder:text-fg-secondary focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 py-1 text-xs font-semibold text-on-accent hover:bg-accent-hover"
          >
            اعمال
          </button>
          {hasValue ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-11 items-center rounded-control px-2 py-1 text-xs font-semibold text-accent hover:text-accent-hover"
            >
              حذف محدوده قیمت
            </button>
          ) : null}
        </div>
        {/* Quick ranges: one tap applies a preset range (SS-226). */}
        <ul role="list" className="mt-3 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const active =
              state.priceFrom === preset.from && state.priceTo === preset.to;
            return (
              <li key={preset.label}>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() => {
                      router.push(
                        buildListingHref(basePath, state, {
                          priceFrom: preset.from,
                          priceTo: preset.to,
                        }),
                      );
                    })
                  }
                  aria-pressed={active}
                  className={`min-h-9 rounded-pill px-3 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-accent text-on-accent'
                      : 'bg-surface-2 text-fg-secondary hover:bg-accent-soft hover:text-accent'
                  }`}
                >
                  {preset.label}
                </button>
              </li>
            );
          })}
        </ul>
      </form>
    </div>
  );
}
