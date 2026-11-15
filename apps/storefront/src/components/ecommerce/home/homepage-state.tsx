const COPY = {
  empty: {
    title: 'صفحه اصلی هنوز منتشر نشده است',
    body: 'محتوای صفحه اصلی پس از انتشار از پنل مدیریت در اینجا نمایش داده می‌شود.',
  },
  'published-empty': {
    title: 'محتوایی برای نمایش وجود ندارد',
    body: 'نسخه منتشرشده صفحه اصلی در حال حاضر بخشی برای نمایش ندارد.',
  },
  unavailable: {
    title: 'صفحه اصلی در حال حاضر در دسترس نیست',
    body: 'لطفاً چند لحظه بعد دوباره تلاش کنید.',
  },
} as const

export type HomepageStateKind = keyof typeof COPY

/**
 * Neutral homepage states. These intentionally contain no merchandising
 * content, product links, or static promotional fallback.
 */
export function HomepageState({ kind }: { kind: HomepageStateKind }) {
  const copy = COPY[kind]

  return (
    <section
      data-homepage-state={kind}
      aria-labelledby={`homepage-state-${kind}`}
      className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6"
    >
      <h1
        id={`homepage-state-${kind}`}
        className="text-balance text-2xl font-black text-fg sm:text-3xl"
      >
        {copy.title}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-fg-muted">
        {copy.body}
      </p>
    </section>
  )
}
