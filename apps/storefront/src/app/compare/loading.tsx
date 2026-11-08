/** Route-level loading state (SS-237): compare table geometry placeholder. */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="در حال بارگذاری مقایسه"
    >
      <div className="h-8 w-48 rounded-control bg-surface-2" aria-hidden="true" />
      <div className="mt-6 h-64 rounded-card bg-surface-2" aria-hidden="true" />
    </div>
  );
}
