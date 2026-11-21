import Image from 'next/image';
import Link from 'next/link';
import { brand } from '@/lib/brand';

/**
 * Reusable brand lockup (SS-209): logo mark + Persian wordmark. Consumed by
 * the header, the mobile drawer and the footer so the logo lives in exactly
 * one component and all artwork resolves through `brand.ts`.
 */
export function BrandLockup({
  href = '/',
  markSize = brand.markSize,
  wordmarkClassName = 'text-lg font-extrabold tracking-tight text-fg',
  focusRingClassName = 'focus-visible:outline-focus',
}: {
  href?: string;
  markSize?: number;
  wordmarkClassName?: string;
  focusRingClassName?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 ${focusRingClassName}`}
      aria-label={brand.nameFa}
    >
      <Image
        src={brand.logoPng[128].src}
        alt={brand.logoAlt}
        width={markSize}
        height={markSize}
        className="object-contain"
        priority={false}
      />
      <span className={wordmarkClassName}>{brand.nameFa}</span>
    </Link>
  );
}
