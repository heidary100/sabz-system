import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBrandDto } from './create-brand.dto';
import { ListBrandsQueryDto } from './list-brands-query.dto';
import { UpdateBrandDto } from './update-brand.dto';

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

describe('CreateBrandDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expectValid(plainToInstance(CreateBrandDto, { name: 'دل' }));
  });

  it('accepts slug, description and isFeatured', async () => {
    await expectValid(
      plainToInstance(CreateBrandDto, {
        name: 'دل',
        slug: 'dell',
        description: 'تولیدکننده سختافزار',
        isFeatured: true,
      }),
    );
  });

  it('rejects a missing name', async () => {
    await expectInvalid(plainToInstance(CreateBrandDto, { name: undefined }), 'name');
  });

  it('rejects an invalid slug', async () => {
    await expectInvalid(plainToInstance(CreateBrandDto, { name: 'دل', slug: 'BAD!' }), 'slug');
  });

  it('rejects a non-boolean isFeatured', async () => {
    await expectInvalid(
      plainToInstance(CreateBrandDto, { name: 'دل', isFeatured: 'yes' }),
      'isFeatured',
    );
  });

  it('rejects an overly long description', async () => {
    await expectInvalid(
      plainToInstance(CreateBrandDto, { name: 'دل', description: 'x'.repeat(1001) }),
      'description',
    );
  });

  it('has no logoKey field (logo belongs to SS-105)', () => {
    const prototype = Object.getOwnPropertyNames(CreateBrandDto.prototype);
    expect(prototype).not.toContain('logoKey');
  });
});

describe('UpdateBrandDto', () => {
  it('accepts an empty update body', async () => {
    await expectValid(plainToInstance(UpdateBrandDto, {}));
  });

  it('preserves an explicit null description so it can be cleared', () => {
    const instance = plainToInstance(UpdateBrandDto, { description: null });
    expect(instance.description).toBeNull();
  });

  it('accepts isFeatured true/false', async () => {
    await expectValid(plainToInstance(UpdateBrandDto, { isFeatured: false }));
  });

  it('rejects an invalid slug', async () => {
    await expectInvalid(plainToInstance(UpdateBrandDto, { slug: 'BAD' }), 'slug');
  });

  it('has no logoKey field (logo belongs to SS-105)', () => {
    const prototype = Object.getOwnPropertyNames(UpdateBrandDto.prototype);
    expect(prototype).not.toContain('logoKey');
  });
});

describe('ListBrandsQueryDto', () => {
  it('accepts valid pagination', async () => {
    await expectValid(plainToInstance(ListBrandsQueryDto, { page: 2, limit: 50 }));
  });

  it('rejects a limit above 100', async () => {
    await expectInvalid(plainToInstance(ListBrandsQueryDto, { limit: 101 }), 'limit');
  });

  it('rejects a page below 1', async () => {
    await expectInvalid(plainToInstance(ListBrandsQueryDto, { page: 0 }), 'page');
  });
});
