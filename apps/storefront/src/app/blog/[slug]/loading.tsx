/** Route-level loading state (SS-238): article geometry placeholder. */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="در حال بارگذاری مطلب"
    >
      <div className="h-4 w-40 rounded-md bg-sand-100" aria-hidden="true" />
      <div className="mt-4 h-9 w-3/4 rounded-md bg-sand-100" aria-hidden="true" />
      <div className="mt-6 aspect-[16/9] w-full rounded-xl bg-sand-100" aria-hidden="true" />
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-4 w-full rounded-md bg-sand-100" />
        <div className="h-4 w-full rounded-md bg-sand-100" />
        <div className="h-4 w-2/3 rounded-md bg-sand-100" />
      </div>
    </div>
  );
}
