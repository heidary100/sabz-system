// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FiltersSheet } from './filters-sheet';
import { DEFAULT_LISTING_STATE, type ListingState } from '@/lib/listing';
import type { CatalogFacetsResponse } from '@sabz/types';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function renderSheet(
  state: Partial<ListingState> = {},
  facets: CatalogFacetsResponse | null = null,
) {
  return render(
    <FiltersSheet
      state={{ ...DEFAULT_LISTING_STATE, ...state }}
      categories={[]}
      brands={[]}
      facets={facets}
    />,
  );
}

async function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'فیلترها' }));
  await screen.findByRole('dialog', { name: 'فیلترهای محصولات' });
}

beforeEach(() => {
  router.push.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('FiltersSheet typed price commit (#289)', () => {
  it('commits typed Latin-digit bounds when «نمایش نتایج» submits the price form', async () => {
    renderSheet();
    await openSheet();

    fireEvent.change(screen.getByLabelText('حداقل قیمت به ریال'), {
      target: { value: '1000000' },
    });
    fireEvent.change(screen.getByLabelText('حداکثر قیمت به ریال'), {
      target: { value: '5000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش نتایج' }));

    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining('priceFrom=1000000&priceTo=5000000'),
    );
  });

  it('folds Persian digits to the same committed bounds', async () => {
    renderSheet();
    await openSheet();

    fireEvent.change(screen.getByLabelText('حداقل قیمت به ریال'), {
      target: { value: '۱۰۰۰۰۰۰' },
    });
    fireEvent.change(screen.getByLabelText('حداکثر قیمت به ریال'), {
      target: { value: '۵۰۰۰۰۰۰' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش نتایج' }));

    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining('priceFrom=1000000&priceTo=5000000'),
    );
  });

  it('closes the sheet after a valid commit', async () => {
    renderSheet();
    await openSheet();

    fireEvent.change(screen.getByLabelText('حداکثر قیمت به ریال'), {
      target: { value: '20000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش نتایج' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('keeps the sheet open with the Persian error on invalid input and never navigates', async () => {
    renderSheet();
    await openSheet();

    fireEvent.change(screen.getByLabelText('حداقل قیمت به ریال'), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'نمایش نتایج' }));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('مبلغ واردشده معتبر نیست.');
    expect(
      screen.getByRole('dialog', { name: 'فیلترهای محصولات' }),
    ).toBeTruthy();
  });
});

describe('FiltersSheet category-aware attribute facets (SS-900)', () => {
  const facets: CatalogFacetsResponse = {
    categorySlug: 'laptops',
    attributes: [
      {
        attributeId: '11111111-1111-4111-8111-111111111111',
        name: 'ظرفیت',
        slug: 'capacity',
        unit: 'ترابایت',
        valueType: 'SELECT',
        isComparable: true,
        options: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            value: '۱ ترابایت',
            slug: '1tb',
            count: 3,
          },
        ],
        numericMin: null,
        numericMax: null,
      },
    ],
    brands: [],
  };

  it('renders and applies category attribute facets inside the mobile sheet', async () => {
    renderSheet({}, facets);
    await openSheet();

    expect(screen.getByText(/ظرفیت/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /۱ ترابایت/ }));

    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining('attrs='),
    );
  });
});
