import { Skeleton } from './skeleton';

/**
 * Listing-card placeholder mirroring ProductCard v2's exact geometry:
 * 1:1 light plate, reserved brand/name/availability lines, a dedicated price
 * block and a separated action row. No layout shift on swap.
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="relative aspect-square bg-plate p-3 sm:p-4">
        <Skeleton tone="plate" className="size-full rounded-control" />
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <Skeleton className="mt-1 h-4 w-3/5" />
        <Skeleton className="mt-2 h-3 w-1/3" />
        <div className="mt-auto pt-3">
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="size-11 rounded-pill" />
        </div>
      </div>
    </div>
  );
}
