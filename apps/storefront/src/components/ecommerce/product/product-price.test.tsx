import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogProductVariantDto } from '@sabz/types';
import { ProductPrice } from './product-price';

function variant(
  overrides: Partial<CatalogProductVariantDto> = {},
): CatalogProductVariantDto {
  return {
    id: 'variant-1',
    sku: 'SKU-1',
    name: null,
    price: '140000000',
    regularPrice: '175000000',
    priceStatus: 'PRICED',
    inStock: true,
    options: [],
    ...overrides,
  };
}

describe('ProductPrice', () => {
  it('renders the server-resolved price, percentage and savings truthfully', () => {
    const html = renderToStaticMarkup(<ProductPrice variant={variant()} />);
    expect(html).toContain('۱۴٬۰۰۰٬۰۰۰ تومان');
    expect(html).toContain('۲۰٪');
    expect(html).toContain('قیمت پیشین');
    expect(html).toContain('۳٬۵۰۰٬۰۰۰ تومان');
    expect(html).toContain('سود شما');
  });

  it('does not invent a discount when the server sends no regular price', () => {
    const html = renderToStaticMarkup(
      <ProductPrice variant={variant({ regularPrice: null })} />,
    );
    expect(html).toContain('۱۴٬۰۰۰٬۰۰۰ تومان');
    expect(html).not.toContain('قیمت پیشین');
    expect(html).not.toContain('تخفیف');
  });

  it('never shows a numeric price for CALL_FOR_PRICE', () => {
    const html = renderToStaticMarkup(
      <ProductPrice
        variant={variant({
          price: '0',
          regularPrice: null,
          priceStatus: 'CALL_FOR_PRICE',
        })}
      />,
    );
    expect(html).toContain('تماس بگیرید');
    expect(html).not.toContain('تومان');
  });
});
