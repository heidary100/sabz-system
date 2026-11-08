// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CatalogCategoryNode } from '@sabz/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/components/ecommerce/theme/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-control" />,
}));

import { MobileMenu } from './mobile-menu';

function node(
  id: string,
  count: number,
  children: CatalogCategoryNode[] = [],
): CatalogCategoryNode {
  return {
    id,
    name: id,
    slug: id,
    sortOrder: 0,
    publishedProductCount: count,
    children,
  };
}

const categories = [
  node('phones', 12, [
    node('cases', 5, [node('iphone-cases', 3)]),
    node('chargers', 3),
  ]),
  node('laptops', 8),
  node('qa-empty', 0),
];

afterEach(cleanup);

describe('MobileMenu', () => {
  it('opens as a dialog, locks scroll, and shows only visible root categories', async () => {
    render(
      <MobileMenu
        categories={categories}
        covers={{ phones: 'http://media/phones' }}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'باز کردن منو' });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'منوی فروشگاه' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByText('phones')).toBeTruthy();
    expect(screen.getByText('laptops')).toBeTruthy();
    expect(screen.queryByText('qa-empty')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'بستن منو' }),
      ),
    );
  });

  it('drills down through levels, shows breadcrumb/back/product link, and returns', async () => {
    render(<MobileMenu categories={categories} covers={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن منو' }));

    fireEvent.click(
      await screen.findByRole('button', { name: /^phones/ }),
    );
    expect(screen.getByText('phones')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /مشاهده محصولات phones/ }),
    ).toBeTruthy();
    expect(screen.getByText('cases')).toBeTruthy();
    expect(screen.getByText('chargers')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'بازگشت به سطح قبل' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^cases/ }));
    expect(screen.getByText('phones / cases')).toBeTruthy();
    expect(screen.getByText('iphone-cases')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'بازگشت به سطح قبل' }),
    );
    expect(screen.getByText('cases')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'بازگشت به سطح قبل' }),
    );
    expect(screen.getByText('phones')).toBeTruthy();
    expect(screen.getByText('laptops')).toBeTruthy();
  });

  it('navigates a leaf to its canonical URL and closes the dialog', async () => {
    render(<MobileMenu categories={categories} covers={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن منو' }));
    fireEvent.click(
      await screen.findByRole('link', { name: /^laptops/ }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).toBeNull(),
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes on Escape and restores focus to the menu trigger', async () => {
    render(<MobileMenu categories={categories} covers={{}} />);
    const trigger = screen.getByRole('button', { name: 'باز کردن منو' });
    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
