import clsx from 'clsx'

export function Loading({
  label,
  className,
  compact = false,
  announce = true,
}: {
  label?: string
  className?: string
  compact?: boolean
  /** Set false when a parent already provides the single live announcement. */
  announce?: boolean
}) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-live={announce ? undefined : 'off'}
      className={clsx(
        className,
        compact
          ? 'flex flex-col items-center justify-center gap-3 py-12'
          : 'flex min-h-svh flex-col items-center justify-center gap-3 bg-background',
      )}
    >
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
      />
      {label && <span className="text-sm font-medium text-muted">{label}</span>}
    </div>
  )
}