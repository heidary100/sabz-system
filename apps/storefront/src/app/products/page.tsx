import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products',
};

export default function ProductsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Products</h1>
      <p className="mt-4 text-base text-zinc-600">
        The product catalog is not available yet.
      </p>
    </main>
  );
}
