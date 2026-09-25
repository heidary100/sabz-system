import { Skeleton } from './skeleton';

/**
 * Product-detail placeholder mirroring the detail page geometry: breadcrumb,
 * two-column gallery/info split, variant chips, then the description/specs
 * block.
 */
export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-56" />
      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-3/4" />
          <Skeleton className="mt-3 h-5 w-24 rounded-full" />
          <Skeleton className="mt-6 h-8 w-40" />
          <div className="mt-6 flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <Skeleton className="mt-8 h-12 w-full rounded-lg" />
        </div>
      </div>
      <Skeleton className="mt-14 h-6 w-24" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
