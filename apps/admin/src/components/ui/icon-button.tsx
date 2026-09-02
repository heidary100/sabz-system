import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import React from 'react'

export function IconButton({
  label,
  outline = false,
  className,
  children,
  ...props
}: {
  label: string
  outline?: boolean
  className?: string
  children: React.ReactNode
} & Omit<Headless.ButtonProps, 'as' | 'className'>) {
  return (
    <Headless.Button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={clsx(
        className,
        'relative isolate inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition duration-150 data-disabled:opacity-50',
        outline
          ? 'border-zinc-950/10 text-zinc-600 data-hover:bg-zinc-950/5 data-hover:text-zinc-950 dark:border-white/15 dark:text-zinc-400 dark:data-hover:bg-white/10 dark:data-hover:text-white'
          : 'border-transparent text-zinc-500 data-hover:bg-zinc-950/5 data-hover:text-zinc-950 dark:text-zinc-400 dark:data-hover:bg-white/10 dark:data-hover:text-white',
        'focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500',
      )}
    >
      <span
        className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      />
      {children}
    </Headless.Button>
  )
}