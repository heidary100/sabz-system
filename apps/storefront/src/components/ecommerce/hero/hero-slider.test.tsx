// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({ reduce: false }));

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  },
}));

import { HeroStage, type HeroStageSlide } from './hero-slider';

const slides: HeroStageSlide[] = [
  {
    title: 'کالای دیجیتال',
    subtitle: 'موبایل و لوازم جانبی',
    href: '/products',
    ctaLabel: 'مشاهده محصولات',
    images: ['/media/a', '/media/b', '/media/c'],
  },
  {
    title: 'کالای استوک',
    href: '/categories/stock-goods',
    ctaLabel: 'مشاهده کالای استوک',
    images: ['/media/d'],
  },
  {
    title: 'لوازم جانبی',
    href: '/categories/mobile-accessories',
    ctaLabel: 'مشاهده دسته‌بندی',
    images: [],
  },
  {
    title: 'اسلاید چهارم',
    href: '/products',
    ctaLabel: 'چهارم',
    images: [],
  },
];

beforeEach(() => {
  media.reduce = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: media.reduce,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HeroStage', () => {
  it('renders a polished static fallback when no slides exist', () => {
    render(<HeroStage slides={[]} />);
    expect(
      screen.getByRole('heading', {
        name: 'فروشگاه کالای دیجیتال سبز سیستم',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'مشاهده محصولات' }).getAttribute('href'),
    ).toBe('/products');
  });

  it('caps configured slides at three and keeps real CTA destinations', () => {
    const { container } = render(<HeroStage slides={slides} />);
    expect(container.querySelectorAll('article')).toHaveLength(3);
    const hrefs = [...container.querySelectorAll('a')].map((anchor) =>
      anchor.getAttribute('href'),
    );
    expect(hrefs).toContain('/products');
    expect(hrefs).toContain('/categories/stock-goods');
    expect(screen.queryByText('اسلاید چهارم')).toBeNull();
  });

  it('renders active-slide controls with RTL accessible names', () => {
    render(<HeroStage slides={slides} />);
    expect(screen.getByRole('region', { name: 'معرفی فروشگاه' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'اسلاید بعدی' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'اسلاید قبلی' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'رفتن به اسلاید 1' }),
    ).toBeTruthy();
  });

  it('pauses autoplay on hover and via the explicit control', () => {
    const { container } = render(<HeroStage slides={slides} />);
    const section = container.querySelector('[data-home-section="hero"]')!;
    fireEvent.mouseEnter(section);
    expect(section.getAttribute('data-paused')).toBe('true');
    fireEvent.mouseLeave(section);
    expect(section.getAttribute('data-paused')).toBe('false');

    const pause = screen.getByRole('button', { name: 'توقف پخش خودکار' });
    fireEvent.click(pause);
    expect(
      screen.getByRole('button', { name: 'پخش خودکار اسلایدها' }),
    ).toBeTruthy();
    expect(section.getAttribute('data-paused')).toBe('true');
  });

  it('advances automatically when motion is allowed', () => {
    vi.useFakeTimers();
    const { container } = render(<HeroStage slides={slides} />);
    expect(
      container.querySelector('article')?.getAttribute('data-active'),
    ).toBe('true');
    act(() => {
      vi.advanceTimersByTime(7100);
    });
    const articles = container.querySelectorAll('article');
    expect(articles[1]!.getAttribute('data-active')).toBe('true');
  });

  it('disables autoplay and hides the play control for reduced motion', () => {
    media.reduce = true;
    vi.useFakeTimers();
    const { container } = render(<HeroStage slides={slides} />);
    const section = container.querySelector('[data-home-section="hero"]')!;
    expect(section.getAttribute('data-reduced-motion')).toBe('true');
    expect(
      screen.queryByRole('button', { name: 'توقف پخش خودکار' }),
    ).toBeNull();
    act(() => {
      vi.advanceTimersByTime(21000);
    });
    expect(
      container.querySelector('article')?.getAttribute('data-active'),
    ).toBe('true');
    expect(
      container.querySelectorAll('article')[1]!.getAttribute('data-active'),
    ).toBe('false');
  });
});
