import type { Metadata } from 'next';
import { contactChannels, siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'راه‌های ارتباط با بازرگانی سبز سیستم — تلفن، واتساپ، ایمیل و نشانی.',
};

/**
 * Contact page (SS-229): every fact comes from the verified
 * `siteConfig`/`contactChannels` config (scraped from the client's live
 * site) — no placeholders, no invented values.
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm text-fg-muted">بازرگانی سبز سیستم</p>
      <h1 className="mt-1 text-balance text-2xl font-extrabold text-fg">
        تماس با ما
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-sm font-bold text-fg">شماره تماس</h2>
          <ul role="list" className="mt-3 space-y-2">
            {contactChannels.phones.map((phone) => (
              <li key={phone.tel}>
                <a
                  href={`tel:${phone.tel}`}
                  dir="ltr"
                  className="inline-block rounded-control text-base font-semibold text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {phone.display}
                </a>
              </li>
            ))}
          </ul>
          <h2 className="mt-6 text-sm font-bold text-fg">واتساپ</h2>
          <a
            href={contactChannels.whatsapp.href}
            dir="ltr"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-control text-base font-semibold text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {contactChannels.whatsapp.display}
            <span className="sr-only"> (باز شدن در پنجره جدید)</span>
          </a>
          <h2 className="mt-6 text-sm font-bold text-fg">آدرس ایمیل</h2>
          <ul role="list" className="mt-3 space-y-1.5">
            <li>
              <a
                href={`mailto:${contactChannels.email}`}
                dir="ltr"
                className="rounded-control text-sm text-fg-secondary hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {contactChannels.email}
              </a>
            </li>
          </ul>
          {siteConfig.socials.length > 0 ? (
            <>
              <h2 className="mt-6 text-sm font-bold text-fg">
                فعال در شبکه‌های اجتماعی
              </h2>
              <ul role="list" className="mt-3 flex flex-wrap gap-2">
                {siteConfig.socials.map((social) => (
                  <li key={social.href}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-pill bg-surface-2 px-4 text-xs font-semibold text-fg-secondary hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {social.label}
                      <span className="sr-only"> (باز شدن در پنجره جدید)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-sm font-bold text-fg">نشانی</h2>
          <p className="mt-3 leading-7 text-fg-secondary">{siteConfig.address}</p>
          <p className="mt-1 text-sm text-fg-muted">
            کدپستی: {contactChannels.postalCode}
          </p>
          <h2 className="mt-6 text-sm font-bold text-fg">ساعت کاری</h2>
          <p className="mt-3 leading-7 text-fg-secondary">{siteConfig.hours}</p>
          <div className="mt-6 overflow-hidden rounded-card border border-border">
            <iframe
              title="نقشه محل بازرگانی سبز سیستم در ساری"
              src="https://maps.google.com/maps?q=%D8%B3%D8%A7%D8%B1%DB%8C%D8%8C%20%D8%A8%D9%84%D9%88%D8%A7%D8%B1%20%D9%BE%D8%A7%D8%B3%D8%AF%D8%A7%D8%B1%D8%A7%D9%86&t=&z=15&ie=UTF8&iwloc=&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
