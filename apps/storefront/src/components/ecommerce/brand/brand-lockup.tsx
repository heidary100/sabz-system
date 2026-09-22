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
  wordmarkClassName = 'text-lg font-bold tracking-tight text-sabz-800',
}: {
  href?: string;
  markSize?: number;
  wordmarkClassName?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label={brand.nameFa}>
      <Image
        src={brand.logoPng[64].src}
        alt={brand.logoAlt}
        width={markSize}
        height={markSize}
        className="rounded-md"
        priority={false}
      />
      <span className={wordmarkClassName}>{brand.nameFa}</span>
    </Link>
  );
}
