import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import {
  CategoryTileSkeleton,
} from '@/components/ecommerce/skeleton/category-tile-skeleton';

/** Route-level loading state (SS-217): category index geometry placeholder. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-8 w-36" />
      </div>
      <ul role="list" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <CategoryTileSkeleton key={index} />
        ))}
      </ul>
    </div>
  );
}
