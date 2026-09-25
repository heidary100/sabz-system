import { Skeleton } from './skeleton';

/**
 * Listing-card placeholder mirroring ProductCard's exact geometry
 * (aspect-square media box, brand line, two-line name, price/condition row)
 * so the swap from skeleton to content causes no layout shift.
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-sand-200 bg-white">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-2 h-4 w-4/5" />
        <Skeleton className="mt-1 h-4 w-3/5" />
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}
