import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ListingSkeleton } from '@/components/ecommerce/skeleton/listing-skeleton';

/**
 * Route-level loading state (SS-217): category landing geometry placeholder
 * (breadcrumb + header + child tiles + listing grid).
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-56" />
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-11 rounded-card" />
        ))}
      </div>
      <div className="mt-8">
        <ListingSkeleton />
      </div>
    </div>
  );
}
