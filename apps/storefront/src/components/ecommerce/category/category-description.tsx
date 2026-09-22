import { RichText } from '@/components/rich-text';

/**
 * Category description placeholder (SS-212): presentation-only, no-op when
 * the backend exposes no description. Accepts future sanitized HTML and
 * renders nothing when absent — never fabricates content from products.
 * When a description lands (future API field), it reuses the shared RichText
 * renderer so no new sanitization system is introduced here.
 */
export function CategoryDescription({
  html,
}: {
  html?: string | null;
}) {
  if (!html || html.trim().length === 0) {
    return null;
  }
  return (
    <div className="mt-4 max-w-prose rounded-xl border border-sand-200 bg-white p-5">
      <RichText html={html} />
    </div>
  );
}
