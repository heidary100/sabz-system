import { ProductCondition, ProductStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { ListProductsQueryDto } from './list-products-query.dto';
import { UpdateProductDto } from './update-product.dto';

async function expectValid<T extends object>(dto: T): Promise<void> {
  const errors = await validate(dto as object);
  expect(errors).toHaveLength(0);
}

async function expectInvalid<T extends object>(
  dto: T,
  property?: string,
): Promise<void> {
  const errors = await validate(dto as object);
  expect(errors.length).toBeGreaterThan(0);
  if (property) {
    expect(errors.some((error) => error.property === property)).toBe(true);
  }
}

describe('CreateProductDto', () => {
  const base = {
    name: 'لپتاپ دل XPS 13',
    brandId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    categoryId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e',
    condition: ProductCondition.NEW,
  };

  it('accepts a valid create payload without status or slug', async () => {
    await expectValid(plainToInstance(CreateProductDto, base));
  });

  it('accepts an optional slug matching the pattern', async () => {
    await expectValid(
      plainToInstance(CreateProductDto, { ...base, slug: 'dell-xps-13' }),
    );
  });

  it('rejects an invalid slug', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, slug: 'UPPER CASE!' }),
      'slug',
    );
  });

  it('rejects a missing name', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, name: undefined }),
      'name',
    );
  });

  it('rejects a missing condition', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, condition: undefined }),
      'condition',
    );
  });

  it('rejects a non-UUID brandId', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, brandId: 'not-a-uuid' }),
      'brandId',
    );
  });

  it('accepts a DRAFT status (ignored server-side)', async () => {
    await expectValid(
      plainToInstance(CreateProductDto, {
        ...base,
        status: ProductStatus.DRAFT,
      }),
    );
  });

  it('accepts a PUBLISHED status as a valid enum at DTO level; the service rejects non-DRAFT on create', async () => {
    // The DTO only constrains the value to the ProductStatus enum. The
    // DRAFT-only creation rule is enforced by ProductsService.create (covered
    // in the service spec), not by this DTO.
    await expectValid(
      plainToInstance(CreateProductDto, {
        ...base,
        status: ProductStatus.PUBLISHED,
      }),
    );
  });

  it('rejects a weightKg with more than 3 decimal places', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, weightKg: '1.1234' }),
      'weightKg',
    );
  });

  it('rejects a widthCm with more than 2 decimal places', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, widthCm: '1.234' }),
      'widthCm',
    );
  });

  it('accepts valid dimension strings', async () => {
    await expectValid(
      plainToInstance(CreateProductDto, {
        ...base,
        weightKg: '1.500',
        widthCm: '30.00',
        heightCm: '21.50',
        depthCm: '1.75',
      }),
    );
  });

  it('rejects an overly long name', async () => {
    await expectInvalid(
      plainToInstance(CreateProductDto, { ...base, name: 'x'.repeat(256) }),
      'name',
    );
  });
});

describe('UpdateProductDto', () => {
  it('accepts an empty update body (all fields optional)', async () => {
    await expectValid(plainToInstance(UpdateProductDto, {}));
  });

  it('accepts nullable dimension/origin fields to clear them', async () => {
    await expectValid(
      plainToInstance(UpdateProductDto, {
        weightKg: null,
        widthCm: null,
        originCountry: null,
      }),
    );
  });

  it('preserves an explicit null on originCountry so it can be cleared', () => {
    const instance = plainToInstance(UpdateProductDto, {
      originCountry: null,
    });
    expect(instance.originCountry).toBeNull();
  });

  it('collapses an empty-string originCountry to undefined (no-op)', () => {
    const instance = plainToInstance(UpdateProductDto, {
      originCountry: '   ',
    });
    expect(instance.originCountry).toBeUndefined();
  });

  it('has no status field (lifecycle only via publish/archive)', () => {
    const prototype = Object.getOwnPropertyNames(UpdateProductDto.prototype);
    expect(prototype).not.toContain('status');
  });

  it('rejects an invalid slug', async () => {
    await expectInvalid(
      plainToInstance(UpdateProductDto, { slug: 'INVALID SLUG' }),
      'slug',
    );
  });

  it('rejects an invalid condition', async () => {
    await expectInvalid(
      plainToInstance(UpdateProductDto, { condition: 'BOGUS' }),
      'condition',
    );
  });
});

describe('ListProductsQueryDto', () => {
  it('accepts valid pagination and filters', async () => {
    await expectValid(
      plainToInstance(ListProductsQueryDto, {
        page: 2,
        limit: 50,
        search: 'dell',
        status: ProductStatus.PUBLISHED,
        categoryId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e',
        brandId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      }),
    );
  });

  it('rejects a limit above 100', async () => {
    await expectInvalid(plainToInstance(ListProductsQueryDto, { limit: 101 }), 'limit');
  });

  it('rejects a page below 1', async () => {
    await expectInvalid(plainToInstance(ListProductsQueryDto, { page: 0 }), 'page');
  });

  it('rejects an invalid status enum', async () => {
    await expectInvalid(plainToInstance(ListProductsQueryDto, { status: 'GONE' }), 'status');
  });

  it('rejects a non-UUID categoryId', async () => {
    await expectInvalid(
      plainToInstance(ListProductsQueryDto, { categoryId: 'nope' }),
      'categoryId',
    );
  });
});
