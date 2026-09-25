import { contactChannels } from '@/lib/site';

/**
 * Consultation card (SS-227): the live site's real conversion path — the
 * client's own messengers plus tappable phone numbers. Sits under the
 * purchase panel so the 78% call-for-price catalog always has a next step.
 * All channels come from the verified `contactChannels` config.
 */
export function ProductConsultation() {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-5">
      <h2 className="text-sm font-bold text-ink-900">
        برای دریافت مشاوره با ما در ارتباط باشید.
      </h2>
      <ul role="list" className="mt-3 flex flex-wrap gap-2">
        {contactChannels.consult.map((channel) => (
          <li key={channel.href}>
            <a
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sand-100 px-4 text-xs font-semibold text-gray-700 transition-colors hover:bg-sabz-50 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
            >
              {channel.label}
              <span className="sr-only"> (باز شدن در پنجره جدید)</span>
            </a>
          </li>
        ))}
      </ul>
      <ul role="list" className="mt-4 space-y-1.5 border-t border-sand-100 pt-3 text-sm text-gray-600">
        {contactChannels.phones.map((phone) => (
          <li key={phone.tel}>
            <a
              href={`tel:${phone.tel}`}
              dir="ltr"
              className="inline-block rounded-sm font-medium hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
            >
              {phone.display}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
