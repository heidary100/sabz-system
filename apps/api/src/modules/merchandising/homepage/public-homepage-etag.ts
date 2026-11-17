import { createHash } from 'crypto';
import type { PublishedHomepageDto } from '@sabz/types';

/**
 * Strong ETag derived from the exact JSON representation of the resolved
 * public homepage. Publication metadata is part of the payload, and live
 * price/stock/media changes alter the serialized body, so their validators
 * change too. Cache invalidation remains governed by the existing 10s policy.
 */
export function generatePublicHomepageEtag(payload: PublishedHomepageDto): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('base64url');
  return `"sha256-${digest}"`;
}

/** Weak comparison per If-None-Match semantics (RFC 9110). */
export function ifNoneMatchMatches(
  header: string | string[] | undefined,
  etag: string,
): boolean {
  if (header === undefined) return false;
  const values = Array.isArray(header) ? header : [header];
  const target = stripWeak(etag);
  return values.some((value) =>
    value.split(',').some((candidate) => {
      const trimmed = candidate.trim();
      if (trimmed.length === 0) return false;
      if (trimmed === '*') return true;
      return stripWeak(trimmed) === target;
    }),
  );
}

function stripWeak(value: string): string {
  return value.startsWith('W/') ? value.slice(2) : value;
}
