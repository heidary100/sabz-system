'use client';

import { useEffect, useState } from 'react';
import { computeCountdownParts, type CountdownParts } from '@/lib/countdown';

const faTwoDigit = new Intl.NumberFormat('fa-IR', {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

/**
 * Live countdown (SS-221) — the "sale ends in" pattern used on the hero
 * banner (md) and product cards (sm). Pure text updates at 1 Hz; no
 * decorative animation, so reduced-motion users get the same information.
 *
 * Hydration: the server renders its own `computeCountdownParts` snapshot and
 * the client corrects it on mount — value spans carry
 * `suppressHydrationWarning` because a server/client second-boundary skew is
 * expected and self-healing (the interval re-syncs immediately).
 */
export function CountdownTimer({
  endsAt,
  size = 'md',
  className = '',
}: {
  /** ISO timestamp (or ms epoch) the window ends at. */
  endsAt: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    const update = () => setParts(computeCountdownParts(endsAt));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (parts?.expired) {
    return null;
  }

  const boxes = [
    { value: parts ? String(parts.days) : '–', label: 'روز' },
    { value: parts ? faTwoDigit.format(parts.hours) : '–', label: 'ساعت' },
    { value: parts ? faTwoDigit.format(parts.minutes) : '–', label: 'دقیقه' },
    { value: parts ? faTwoDigit.format(parts.seconds) : '–', label: 'ثانیه' },
  ];

  return (
    <span
      role="timer"
      aria-label="زمان باقی‌مانده"
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {boxes.map((box, index) => (
        <span key={box.label} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-flex flex-col items-center rounded-control bg-stage px-2 py-1 text-on-stage ${
              size === 'sm' ? 'min-w-8' : 'min-w-10'
            }`}
          >
            <span
              suppressHydrationWarning
              className={`tabular-nums ${size === 'sm' ? 'text-xs' : 'text-sm'} font-semibold leading-5`}
            >
              {box.value}
            </span>
            <span
              className={`text-on-stage-muted ${
                size === 'sm' ? 'text-[9px]' : 'text-[10px]'
              } leading-3`}
            >
              {box.label}
            </span>
          </span>
          {index < boxes.length - 1 ? (
            <span
              aria-hidden="true"
              className="text-fg-muted"
            >
              :
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
