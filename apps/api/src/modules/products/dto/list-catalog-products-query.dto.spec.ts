import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListCatalogProductsQueryDto } from './list-catalog-products-query.dto';

describe('ListCatalogProductsQueryDto (SS-213 facets)', () => {
  it('accepts an empty query', async () => {
    const dto = plainToInstance(ListCatalogProductsQueryDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a valid priceFrom', async () => {
    const dto = plainToInstance(ListCatalogProductsQueryDto, {
      priceFrom: '1500000',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.priceFrom).toBe('1500000');
  });

  it('accepts a valid price range with decimals', async () => {
    const dto = plainToInstance(ListCatalogProductsQueryDto, {
      priceFrom: '1500000.50',
      priceTo: '20000000',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed priceFrom', async () => {
    for (const priceFrom of ['abc', '12.345', '-5', '1,000', '']) {
      const dto = plainToInstance(ListCatalogProductsQueryDto, { priceFrom });
      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'priceFrom')).toBe(true);
    }
  });

  it('rejects a malformed priceTo', async () => {
    const dto = plainToInstance(ListCatalogProductsQueryDto, { priceTo: 'lots' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'priceTo')).toBe(true);
  });

  it('accepts valid inStockOnly representations', async () => {
    for (const inStockOnly of ['true', true, '1', 'false', false, '0']) {
      const dto = plainToInstance(ListCatalogProductsQueryDto, { inStockOnly });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    }
    expect(
      plainToInstance(ListCatalogProductsQueryDto, { inStockOnly: 'true' }).inStockOnly,
    ).toBe(true);
    expect(
      plainToInstance(ListCatalogProductsQueryDto, { inStockOnly: 'false' })
        .inStockOnly,
    ).toBe(false);
  });

  it('rejects an invalid inStockOnly boolean', async () => {
    const dto = plainToInstance(ListCatalogProductsQueryDto, { inStockOnly: 'yes' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'inStockOnly')).toBe(true);
  });

  it('keeps the existing limit maximum of 50 intact', async () => {
    const dto = plainToInstance(ListCatalogProductsQueryDto, { limit: 51 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });
});
