import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';
import { ListCategoriesQueryDto } from './list-categories-query.dto';
import { UpdateCategoryDto } from './update-category.dto';

const UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

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

describe('CreateCategoryDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expectValid(plainToInstance(CreateCategoryDto, { name: 'لپتاپ' }));
  });

  it('accepts an optional slug, parentId, sortOrder and isVisible', async () => {
    await expectValid(
      plainToInstance(CreateCategoryDto, {
        name: 'لپتاپ',
        slug: 'laptop',
        parentId: UUID,
        sortOrder: 5,
        isVisible: false,
      }),
    );
  });

  it('accepts a null parentId (root)', async () => {
    await expectValid(
      plainToInstance(CreateCategoryDto, { name: 'لپتاپ', parentId: null }),
    );
  });

  it('rejects a missing name', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: undefined }),
      'name',
    );
  });

  it('rejects an invalid slug', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: 'لپتاپ', slug: 'BAD SLUG!' }),
      'slug',
    );
  });

  it('rejects an invalid parentId', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: 'لپتاپ', parentId: 'nope' }),
      'parentId',
    );
  });

  it('rejects a negative sortOrder', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: 'لپتاپ', sortOrder: -1 }),
      'sortOrder',
    );
  });

  it('rejects a non-integer sortOrder', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: 'لپتاپ', sortOrder: 1.5 }),
      'sortOrder',
    );
  });

  it('rejects a non-boolean isVisible', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: 'لپتاپ', isVisible: 'yes' }),
      'isVisible',
    );
  });

  it('rejects an overly long name', async () => {
    await expectInvalid(
      plainToInstance(CreateCategoryDto, { name: 'x'.repeat(256) }),
      'name',
    );
  });
});

describe('UpdateCategoryDto', () => {
  it('accepts an empty update body', async () => {
    await expectValid(plainToInstance(UpdateCategoryDto, {}));
  });

  it('preserves an explicit null parentId so a category can move to root', () => {
    const instance = plainToInstance(UpdateCategoryDto, { parentId: null });
    expect(instance.parentId).toBeNull();
  });

  it('rejects an invalid slug', async () => {
    await expectInvalid(plainToInstance(UpdateCategoryDto, { slug: 'BAD' }), 'slug');
  });

  it('rejects an invalid parentId', async () => {
    await expectInvalid(plainToInstance(UpdateCategoryDto, { parentId: 'x' }), 'parentId');
  });

  it('rejects a negative sortOrder', async () => {
    await expectInvalid(plainToInstance(UpdateCategoryDto, { sortOrder: -2 }), 'sortOrder');
  });
});

describe('ListCategoriesQueryDto', () => {
  it('accepts valid pagination', async () => {
    await expectValid(plainToInstance(ListCategoriesQueryDto, { page: 2, limit: 50 }));
  });

  it('rejects a limit above 100', async () => {
    await expectInvalid(plainToInstance(ListCategoriesQueryDto, { limit: 101 }), 'limit');
  });

  it('rejects a page below 1', async () => {
    await expectInvalid(plainToInstance(ListCategoriesQueryDto, { page: 0 }), 'page');
  });
});
