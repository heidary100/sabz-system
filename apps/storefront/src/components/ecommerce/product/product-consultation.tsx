import { contactChannels } from '@/lib/site';

/**
 * Consultation card (SS-227): the live site's real conversion path — the
 * client's own messengers plus tappable phone numbers. Sits under the
 * purchase panel so the 78% call-for-price catalog always has a next step.
 * All channels come from the verified `contactChannels` config.
 */
export function ProductConsultation() {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-sm font-bold text-fg">
        برای دریافت مشاوره با ما در ارتباط باشید.
      </h2>
      <ul role="list" className="mt-3 flex flex-wrap gap-2">
        {contactChannels.consult.map((channel) => (
          <li key={channel.href}>
            <a
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-surface-2 px-4 text-xs font-semibold text-fg-secondary transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {channel.label}
              <span className="sr-only"> (باز شدن در پنجره جدید)</span>
            </a>
          </li>
        ))}
      </ul>
      <ul role="list" className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm text-fg-secondary">
        {contactChannels.phones.map((phone) => (
          <li key={phone.tel}>
            <a
              href={`tel:${phone.tel}`}
              dir="ltr"
              className="inline-block rounded-control font-medium hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {phone.display}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
