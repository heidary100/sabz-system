import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const show = (): void => {
    const el = triggerRef.current
    if (!el) {
      return
    }
    const rect = el.getBoundingClientRect()
    setPosition({ top: rect.top + rect.height / 2, left: rect.left - 8 })
    setOpen(true)
  }

  const hide = (): void => setOpen(false)

  return (
    <span
      ref={triggerRef}
      className="relative flex justify-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        position &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[60] -translate-x-full -translate-y-1/2 whitespace-nowrap rounded-lg bg-zinc-950 px-2.5 py-1.5 text-sm/6 font-medium text-white shadow-lg dark:bg-zinc-700"
            style={{ top: position.top, left: position.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}