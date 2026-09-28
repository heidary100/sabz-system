/** Route-level loading state (SS-238): blog geometry placeholder. */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="در حال بارگذاری وبلاگ"
    >
      <div className="h-8 w-48 rounded-md bg-sand-100" aria-hidden="true" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-64 rounded-xl bg-sand-100" aria-hidden="true" />
        <div className="h-64 rounded-xl bg-sand-100" aria-hidden="true" />
        <div className="h-64 rounded-xl bg-sand-100" aria-hidden="true" />
      </div>
    </div>
  );
}
