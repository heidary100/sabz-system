import { connection } from 'next/server';
import { PublishedHomepage } from '@/components/ecommerce/home/published-homepage';
import { HomepageState } from '@/components/ecommerce/home/homepage-state';
import { fetchPublishedHomepage } from '@/lib/homepage';

/**
 * Published merchandising homepage.
 *
 * The public merchandising API is the single source of homepage section
 * composition, order, and content. Global header/navigation/footer remain in
 * the layout; this page contains no static merchandising fallback and issues
 * no independent catalog or blog queries.
 *
 * `connection()` keeps rendering at request time. The homepage fetch itself is
 * `no-store`; the API owns its short-lived resolver cache.
 */
export default async function HomePage() {
  await connection();

  const result = await fetchPublishedHomepage();

  if (result.status === 'published') {
    if (result.homepage.sections.length === 0) {
      return (
        <div data-homepage-source="published-empty">
          <HomepageState kind="published-empty" />
        </div>
      );
    }
    return (
      <div data-homepage-source="published">
        <PublishedHomepage homepage={result.homepage} />
      </div>
    );
  }

  if (result.status === 'empty') {
    return (
      <div data-homepage-source="empty">
        <HomepageState kind="empty" />
      </div>
    );
  }

  return (
    <div data-homepage-source="unavailable">
      <HomepageState kind="unavailable" />
    </div>
  );
}
