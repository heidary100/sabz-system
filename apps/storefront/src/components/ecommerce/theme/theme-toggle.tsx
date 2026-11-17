'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from './theme-provider';
import type { ThemeMode } from '@/lib/theme';

const OPTIONS: Array<{ value: ThemeMode; label: string; shortLabel: string }> = [
  { value: 'system', label: 'هماهنگ با سیستم', shortLabel: 'سیستم' },
  { value: 'light', label: 'روشن', shortLabel: 'روشن' },
  { value: 'dark', label: 'تیره', shortLabel: 'تیره' },
];

const MODE_LABEL: Record<ThemeMode, string> = {
  system: 'هماهنگ با سیستم',
  light: 'روشن',
  dark: 'تیره',
};

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === 'light') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
        className="size-5"
      >
        <path
          d="M12 3v2.25M12 18.75V21M4.22 4.22l1.59 1.59M18.19 18.19l1.59 1.59M3 12h2.25M18.75 12H21M4.22 19.78l1.59-1.59M18.19 5.81l1.59-1.59M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (mode === 'dark') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
        className="size-5"
      >
        <path
          d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
      className="size-5"
    >
      <rect
        x="3"
        y="4.5"
        width="18"
        height="12"
        rx="2"
        strokeLinejoin="round"
      />
      <path d="M8.25 20.25h7.5M12 16.5v3.75" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Accessible theme control. The header uses the compact menu; the mobile
 * drawer uses `variant="inline"` so it cannot be clipped by the scroll panel.
 */
export function ThemeToggle({
  variant = 'menu',
  className = '',
}: {
  variant?: 'menu' | 'inline';
  className?: string;
}) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openMenu(): void {
    setActiveIndex(
      Math.max(
        0,
        OPTIONS.findIndex((option) => option.value === mode),
      ),
    );
    setOpen(true);
  }

  function choose(next: ThemeMode): void {
    setMode(next);
    setAnnouncement(`پوسته ${MODE_LABEL[next]} فعال شد.`);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const last = OPTIONS.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowDown'
            ? (activeIndex + 1) % OPTIONS.length
            : (activeIndex - 1 + OPTIONS.length) % OPTIONS.length;
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  }

  if (variant === 'inline') {
    return (
      <div className={className}>
        <p className="text-label font-semibold text-fg">پوسته</p>
        <div
          role="radiogroup"
          aria-label="انتخاب پوسته"
          onKeyDown={(event) => {
            if (
              !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(
                event.key,
              )
            ) {
              return;
            }
            event.preventDefault();
            const radios = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="radio"]',
              ),
            ];
            const current = radios.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const direction =
              event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
            const next =
              (Math.max(0, current) + direction + OPTIONS.length) %
              OPTIONS.length;
            radios[next]?.focus();
            choose(OPTIONS[next]!.value);
          }}
          className="mt-2 grid grid-cols-3 gap-1 rounded-control border border-border bg-surface-2 p-1"
        >
          {OPTIONS.map((option) => {
            const checked = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => choose(option.value)}
                className={`min-h-11 rounded-control px-2 text-xs font-semibold transition-colors ${
                  checked
                    ? 'bg-surface text-fg shadow-card'
                    : 'text-fg-secondary hover:text-fg'
                }`}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label={`پوسته: ${MODE_LABEL[mode]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <ThemeIcon mode={mode} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="انتخاب پوسته"
          onKeyDown={onMenuKeyDown}
          className="animate-zoom-in absolute end-0 top-full z-50 mt-1 w-48 origin-top rounded-card border border-border bg-surface p-1 shadow-overlay"
        >
          {OPTIONS.map((option, index) => {
            const checked = mode === option.value;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => choose(option.value)}
                className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-control px-2.5 text-start text-xs font-medium transition-colors ${
                  checked
                    ? 'bg-accent-soft text-accent'
                    : 'text-fg-secondary hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <span>{option.label}</span>
                {checked ? (
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="size-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
