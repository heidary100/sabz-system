'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import { formatFaNumber } from '@/lib/format';
import { createReview } from '@/lib/reviews';
import { useHasSession } from '@/components/ecommerce/wishlist/use-has-session';

const SUBMIT_FAILED = 'ثبت دیدگاه ناموفق بود؛ لطفاً دوباره تلاش کنید.';

/**
 * Review submission island (SS-236): 1–5 star radios + optional comment.
 * Signed-out visitors get the login link (the API 401s guests). On success
 * the review is PENDING moderation — the notice says so in Persian and no
 * fake row is appended to the list.
 *
 * Session visibility goes through `useHasSession()` (SS-231): a direct
 * `hasSession()` in a state initializer read localStorage during the
 * hydration pass and flipped the signed-out card into the form — the #291
 * hydration mismatch on /products/[slug].
 */
export function ReviewForm({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const router = useRouter();
  const signedIn = useHasSession();
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!signedIn) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 text-sm">
        <p className="font-semibold text-fg">دیدگاه شما</p>
        <p className="mt-1 leading-6 text-fg-secondary">
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
      <div className="rounded-card border border-accent/30 bg-accent-soft p-4 text-sm">
        <p className="font-semibold text-accent-hover">دیدگاه شما ثبت شد</p>
        <p className="mt-1 leading-6 text-fg-secondary">
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
    <div className="rounded-card border border-border bg-surface p-4 text-sm sm:p-5">
      <p className="font-semibold text-fg">ثبت دیدگاه</p>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-fg-secondary">امتیاز شما</legend>
        <div className="mt-2 flex items-center gap-1">
          {['5', '4', '3', '2', '1'].map((value) => (
            <label
              key={value}
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border px-2 text-sm font-semibold ${
                rating === value
                  ? 'border-accent bg-accent-soft text-accent-hover'
                  : 'border-border text-fg-secondary hover:border-accent'
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
        className="mt-4 block text-xs font-medium text-fg-secondary"
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
        className="mt-1 w-full rounded-control border border-border-control bg-surface px-3 py-2 text-sm leading-6 text-fg placeholder:text-fg-muted"
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
        <p role="alert" className="mt-2 leading-6 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
