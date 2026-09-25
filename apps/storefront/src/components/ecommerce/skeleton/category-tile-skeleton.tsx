import { Skeleton } from './skeleton';

/**
 * Category tile placeholder mirroring the index variant of CategoryTile
 * (bordered card: title line, count line, child-list block).
 */
export function CategoryTileSkeleton() {
  return (
    <li className="flex h-full flex-col rounded-xl border border-sand-200 bg-white p-5">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-2 h-3 w-16" />
      <div className="mt-3 space-y-2 border-t border-sand-100 pt-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </li>
  );
}
