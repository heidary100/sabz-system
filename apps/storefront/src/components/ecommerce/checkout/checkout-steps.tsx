import Link from 'next/link';
import type { CheckoutStep } from '@/lib/checkout';
import { CHECKOUT_STEPS, stepLabel } from '@/lib/checkout';
import { formatFaNumber } from '@/lib/format';

/**
 * Wizard step indicator (SS-233): ordered, RTL-native, `aria-current`
 * marks the active step; completed steps link back, future steps render
 * inert (no fake navigation).
 */
export function CheckoutSteps({
  current,
  reachable,
}: {
  current: CheckoutStep;
  reachable: CheckoutStep;
}) {
  const currentIndex = CHECKOUT_STEPS.indexOf(current);
  const reachableIndex = CHECKOUT_STEPS.indexOf(reachable);
  return (
    <ol
      aria-label="مراحل تسویه حساب"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      {CHECKOUT_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = step === current;
        const open = index <= reachableIndex;
        return (
          <li key={step} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-fg-muted">
                ‹
              </span>
            ) : null}
            {done || (open && !active) ? (
              <Link
                href={`/checkout?step=${step}`}
                className="rounded-control px-2 py-1 text-accent underline-offset-4 hover:underline"
              >
                {formatFaNumber(index + 1)}. {stepLabel(step)}
              </Link>
            ) : (
              <span
                aria-current={active ? 'step' : undefined}
                className={
                  active
                    ? 'rounded-control bg-accent-hover px-2 py-1 font-semibold text-on-accent'
                    : 'px-2 py-1 text-fg-muted'
                }
              >
                {formatFaNumber(index + 1)}. {stepLabel(step)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
