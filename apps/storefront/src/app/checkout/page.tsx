import type { Metadata } from 'next';
import { CheckoutWizard } from './checkout-wizard';

export const metadata: Metadata = { title: 'تسویه حساب' };

/** Server wrapper (SS-233): metadata lives here, interactivity in the island. */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  return <CheckoutWizard stepParam={step} />;
}
