import Link from 'next/link';
import type { CategoryCrumb } from '@/lib/nav';

function Separator() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="size-3.5 shrink-0 text-gray-300"
    >
      <path
        fillRule="evenodd"
        d="M12.78 5.22a.75.75 0 0 1 0 1.06L8.06 11l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Shared category breadcrumb (SS-212): semantic nav + ordered list, RTL-safe
 * chevron separators (never `/`), `aria-current="page"` on the current item,
 * horizontal scroll on narrow screens.
 */
export function CategoryBreadcrumb({ trail }: { trail: CategoryCrumb[] }) {
  return (
    <nav aria-label="مسیر دسته‌بندی">
      <ol className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-1 text-sm text-gray-500">
        <li className="flex items-center gap-1.5">
          <Link href="/" className="rounded-sm hover:text-sabz-700">
            خانه
          </Link>
        </li>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.slug} className="flex items-center gap-1.5">
              <Separator />
              {isLast ? (
                <span aria-current="page" className="font-medium text-ink-900">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={`/categories/${crumb.slug}`}
                  className="rounded-sm hover:text-sabz-700"
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
