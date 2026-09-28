import { Rating } from '@/components/ecommerce/ui/rating';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';
import { fetchProductReviews } from '@/lib/reviews';
import { ReviewForm } from './review-form';

/**
 * Product reviews section (SS-236): approved-review list (server-read,
 * newest first) + the submission island. The section hides nothing when
 * empty — the empty state invites the first review. A reviews-fetch
 * failure never breaks the detail page: the section renders nothing and
 * the purchase flow stays intact.
 */
export async function ProductReviews({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const list = await fetchProductReviews(productId).catch(() => null);
  if (!list) {
    return null;
  }

  return (
    <section aria-labelledby="reviews-heading" className="mt-14">
      <SectionHeader id="reviews-heading" title="دیدگاه‌ها" />
      {list.ratingCount > 0 && list.ratingAverage !== null ? (
        <p className="mt-4">
          <Rating value={list.ratingAverage} count={list.ratingCount} />
        </p>
      ) : null}
      {list.items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-sand-200 bg-white p-6 text-sm leading-7 text-gray-600">
          هنوز دیدگاهی برای این محصول ثبت نشده است. اولین نظر را شما
          بنویسید.
        </p>
      ) : (
        <ul role="list" className="mt-4 space-y-3">
          {list.items.map((review) => (
            <li
              key={review.id}
              className="rounded-xl border border-sand-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Rating value={review.rating} />
                <time
                  dateTime={review.createdAt}
                  className="text-xs text-gray-500"
                >
                  {new Date(review.createdAt).toLocaleDateString('fa-IR')}
                </time>
              </div>
              {review.comment ? (
                <p dir="auto" className="mt-2 text-sm leading-7 text-gray-700">
                  {review.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <ReviewForm productId={productId} productSlug={productSlug} />
      </div>
    </section>
  );
}
