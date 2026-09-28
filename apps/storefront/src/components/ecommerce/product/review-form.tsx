'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { formatFaNumber } from '@/lib/format';
import { createReview } from '@/lib/reviews';

const SUBMIT_FAILED = 'ثبت دیدگاه ناموفق بود؛ لطفاً دوباره تلاش کنید.';

/**
 * Review submission island (SS-236): 1–5 star radios + optional comment.
 * Signed-out visitors get the login link (the API 401s guests). On success
 * the review is PENDING moderation — the notice says so in Persian and no
 * fake row is appended to the list.
 */
export function ReviewForm({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const router = useRouter();
  const [signedIn] = useState(() => hasSession());
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
        <p className="font-semibold text-ink-900">دیدگاه شما</p>
        <p className="mt-1 leading-6 text-gray-600">
          برای ثبت امتیاز و دیدگاه ابتدا وارد حساب خود شوید.
        </p>
        <Link
          href={`/login?next=/products/${productSlug}`}
          className={`${buttonVariants({ variant: 'outline', size: 'md' })} mt-3 w-full`}
        >
          ورود به حساب
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-sabz-200 bg-sabz-50 p-4 text-sm">
        <p className="font-semibold text-sabz-800">دیدگاه شما ثبت شد</p>
        <p className="mt-1 leading-6 text-gray-600">
          دیدگاه شما پس از بررسی و تأیید نمایش داده می‌شود.
        </p>
      </div>
    );
  }

  async function handleSubmit(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createReview({
        productId,
        rating: Number(rating),
        comment: comment.trim() === '' ? undefined : comment.trim(),
      });
      setSubmitted(true);
      router.refresh();
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        router.push(`/login?next=/products/${productSlug}`);
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

  return (
    <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm sm:p-5">
      <p className="font-semibold text-ink-900">ثبت دیدگاه</p>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-gray-600">امتیاز شما</legend>
        <div className="mt-2 flex items-center gap-1">
          {['5', '4', '3', '2', '1'].map((value) => (
            <label
              key={value}
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-semibold ${
                rating === value
                  ? 'border-sabz-700 bg-sabz-50 text-sabz-800'
                  : 'border-sand-200 text-gray-600 hover:border-sabz-300'
              }`}
            >
              <input
                type="radio"
                name="review-rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <span aria-hidden="true">★ {formatFaNumber(Number(value))}</span>
              <span className="sr-only">{formatFaNumber(Number(value))} از ۵</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label
        htmlFor="review-comment"
        className="mt-4 block text-xs font-medium text-gray-600"
      >
        دیدگاه (اختیاری)
      </label>
      <textarea
        id="review-comment"
        rows={4}
        maxLength={2000}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="تجربه خود از این محصول را بنویسید…"
        className="mt-1 w-full rounded-md border border-sand-200 bg-white px-3 py-2 text-sm leading-6 text-ink-900 placeholder:text-gray-400"
      />
      <Button
        variant="primary"
        size="lg"
        className="mt-3 w-full sm:w-auto"
        disabled={pending}
        onClick={() => void handleSubmit()}
      >
        {pending ? 'در حال ثبت…' : 'ثبت دیدگاه'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 leading-6 text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
