import { ProductCardSkeleton } from './product-card-skeleton';
import { Skeleton } from './skeleton';

function FilterColumnSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-4 w-4/5" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

/**
 * Listing placeholder mirroring the shared listing layout (heading +
 * per-page/sort row, filter column, product grid, pagination strip) used by
 * /products and /categories/[slug].
 */
export function ListingSkeleton({ withFilters = true }: { withFilters?: boolean }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
        {withFilters ? (
          <div className="hidden lg:block">
            <FilterColumnSkeleton />
          </div>
        ) : null}
        <div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
          <Skeleton className="mx-auto mt-8 h-9 w-64" />
        </div>
      </div>
    </div>
  );
}
