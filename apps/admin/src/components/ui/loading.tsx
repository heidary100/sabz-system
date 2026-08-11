import clsx from 'clsx'

export function Loading({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={clsx(
        className,
        'flex min-h-svh flex-col items-center justify-center gap-3 bg-background',
      )}
    >
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
      />
      {label && <span className="text-sm font-medium text-dust-200">{label}</span>}
    </div>
  )
}
