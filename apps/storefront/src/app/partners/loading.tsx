import { ListingSkeleton } from '@/components/ecommerce/skeleton/listing-skeleton';

/** Route-level loading state (SS-230B): listing geometry placeholder. */
export default function Loading() {
  return <ListingSkeleton withFilters={false} />;
}
