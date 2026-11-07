import * as Headless from '@headlessui/react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CircleHelp, X } from 'lucide-react'
import { resolveRouteHelp } from '../../lib/route-help'
import type { RouteHelpEntry } from '../../lib/route-help'
import { IconButton } from './icon-button'

/**
 * Contextual page help (SS-269): an info icon that opens a side panel with
 * the route's Persian documentation — never a tooltip carrying the whole
 * page docs. The panel slides from the start side (RTL-safe), is
 * focus-trapped by Headless Dialog, and closes with Esc, the X, or the
 * scrim. `PageHeader` wires it automatically via `resolveRouteHelp`;
 * detail pages with custom headings mount `RouteHelpButton` themselves and
 * render `<PageHelp open onClose />`.
 */
export function PageHelp({
  help,
  open,
  onClose,
}: {
  help: RouteHelpEntry
  open: boolean
  onClose: () => void
}) {
  return (
    <Headless.Dialog open={open} onClose={onClose} className="fixed inset-0 z-50 lg:z-40">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm transition duration-300 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      />
      <div className="fixed inset-0 flex justify-start">
        <Headless.DialogPanel
          transition
          className="glass-strong flex h-full w-[26rem] max-w-[92vw] flex-col gap-5 overflow-y-auto p-6 transition duration-300 ease-out data-closed:translate-x-full data-enter:ease-out data-leave:ease-in"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-primary">
              <CircleHelp className="size-5" aria-hidden="true" />
              <h2 className="text-base/6 font-bold text-foreground">{help.title}</h2>
            </div>
            <IconButton label="بستن راهنما" onClick={onClose}>
              <X className="size-5" aria-hidden="true" />
            </IconButton>
          </div>
          <p className="text-sm/7 text-foreground">{help.summary}</p>
          {help.sections.map((section) => (
            <section key={section.heading} className="space-y-1">
              <h3 className="text-sm/6 font-semibold text-foreground">{section.heading}</h3>
              <p className="text-sm/6 text-muted">{section.body}</p>
            </section>
          ))}
          {help.workflows && help.workflows.length > 0 ? (
            <section className="space-y-1 rounded-xl border border-border bg-surface p-4">
              <h3 className="text-sm/6 font-semibold text-foreground">گردش کار</h3>
              <ol className="list-decimal space-y-1 ps-5 text-sm/6 text-muted">
                {help.workflows.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}

/** Standalone trigger for pages whose header is custom (detail pages). */
export function RouteHelpButton({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <IconButton label="راهنمای این صفحه" onClick={onOpen} className={className}>
      <CircleHelp className="size-5" aria-hidden="true" />
    </IconButton>
  )
}

/**
 * Self-contained help for custom-header pages: resolves the route against
 * the registry, renders the trigger (optionally pushed to the row end via
 * `className`, e.g. `ms-auto`) and owns the panel state. Renders nothing on
 * routes without registry content.
 */
export function RouteHelpSection({ className }: { className?: string }) {
  const location = useLocation()
  const help = resolveRouteHelp(location.pathname)
  const [open, setOpen] = useState(false)
  if (!help) {
    return null
  }
  return (
    <>
      <RouteHelpButton onOpen={() => setOpen(true)} className={className} />
      <PageHelp help={help} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
