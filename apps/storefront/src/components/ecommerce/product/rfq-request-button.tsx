'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { createRfq } from '@/lib/rfq';
import { toEnglishDigits } from '@/lib/auth-client';

const SUBMIT_FAILED = 'ثبت استعلام ناموفق بود؛ لطفاً دوباره تلاش کنید.';

/**
 * RFQ request island (SS-235 B2): quantity + «درخواست استعلام» for
 * call-for-price variants. Signed-out visitors get the partner-login
 * link instead (guests cannot file — the API 403s non-partners, and the
 * inline message says so in Persian). Render ONLY for CALL_FOR_PRICE
 * rows; PRICED rows keep `AddToCartButton`.
 */
export function RfqRequestButton({
  variantId,
  productName,
}: {
  variantId: string;
  productName: string;
}) {
  const router = useRouter();
  const [signedIn] = useState(() => hasSession());
  const [quantity, setQuantity] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
        <p className="font-semibold text-ink-900">برای قیمت تماس بگیرید</p>
        <p className="mt-1 leading-6 text-gray-600">
          قیمت این مدل متغیر است. همکاران تأییدشده پس از ورود می‌توانند
          استعلام ثبت کنند.
        </p>
        <Link
          href="/login?next=/partners"
          className={`${buttonVariants({ variant: 'outline', size: 'md' })} mt-3 w-full`}
        >
          ورود همکاران
        </Link>
      </div>
    );
  }

  async function handleSubmit(): Promise<void> {
    if (pending) {
      return;
    }
    const parsed = Number.parseInt(toEnglishDigits(quantity.trim()), 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError('تعداد باید عددی بزرگتر از صفر باشد.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await createRfq(variantId, parsed);
      setCreatedId(created.id);
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        submitError instanceof ApiError
          ? (submitError.payload?.message ?? SUBMIT_FAILED)
          : SUBMIT_FAILED,
      );
    } finally {
      setPending(false);
    }
  }

  if (createdId !== null) {
    return (
      <div className="rounded-xl border border-sabz-200 bg-sabz-50 p-4 text-sm">
        <p className="font-semibold text-sabz-800">استعلام شما ثبت شد</p>
        <p className="mt-1 leading-6 text-gray-600">
          پس از اعلام قیمت از سوی فروشگاه، از صفحه استعلام‌ها می‌توانید آن
          را بپذیرید و سفارش ثبت کنید.
        </p>
        <Link
          href={`/rfq/${createdId}`}
          className={`${buttonVariants({ variant: 'primary', size: 'md' })} mt-3 w-full`}
        >
          مشاهده استعلام
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
      <p className="font-semibold text-ink-900">برای قیمت تماس بگیرید</p>
      <p className="mt-1 leading-6 text-gray-600">
        قیمت {productName} متغیر است؛ تعداد را وارد کنید تا استعلام ثبت شود.
      </p>
      <label
        htmlFor="rfq-quantity"
        className="mt-3 block text-xs font-medium text-gray-600"
      >
        تعداد
      </label>
      <input
        id="rfq-quantity"
        type="number"
        min={1}
        inputMode="numeric"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        className="mt-1 min-h-11 w-28 rounded-md border border-sand-200 bg-white px-3 text-sm text-ink-900"
      />
      <Button
        variant="primary"
        size="lg"
        className="mt-3 w-full"
        disabled={pending}
        onClick={() => void handleSubmit()}
      >
        {pending ? 'در حال ثبت…' : 'درخواست استعلام'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 leading-6 text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
