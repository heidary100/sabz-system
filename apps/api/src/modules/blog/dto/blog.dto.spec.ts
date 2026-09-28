import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBlogCategoryDto,
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  UpdateBlogPostDto,
} from './blog.dto';

describe('Blog DTOs (SS-238)', () => {
  it('accepts a minimal valid post (slug generated from title)', async () => {
    const dto = plainToInstance(CreateBlogPostDto, {
      title: 'راهنمای خرید پاوربانک',
      content: '<p>متن مطلب</p>',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a full valid post with category + SEO fields', async () => {
    const dto = plainToInstance(CreateBlogPostDto, {
      slug: 'powerbank-guide',
      categoryId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      title: 'راهنمای خرید پاوربانک',
      excerpt: 'خلاصه مطلب',
      content: '<p>متن مطلب</p>',
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      authorName: 'تحریریه سبز سیستم',
      metaTitle: 'عنوان سئو',
      metaDescription: 'توضیح سئو',
      status: 'PUBLISHED',
      publishedAt: new Date().toISOString(),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a bad slug, bad categoryId, and bad status', async () => {
    const dto = plainToInstance(CreateBlogPostDto, {
      slug: 'BAD SLUG!',
      categoryId: 'not-a-uuid',
      title: 'عنوان',
      content: '<p>متن</p>',
      status: 'VISIBLE',
    });
    const errors = await validate(dto);
    for (const property of ['slug', 'categoryId', 'status']) {
      expect(errors.some((error) => error.property === property)).toBe(true);
    }
  });

  it('rejects an empty title/content and over-long SEO fields', async () => {
    const dto = plainToInstance(CreateBlogPostDto, {
      title: '   ',
      content: '',
      metaTitle: 'x'.repeat(256),
      metaDescription: 'x'.repeat(501),
    });
    const errors = await validate(dto);
    for (const property of ['title', 'content', 'metaTitle', 'metaDescription']) {
      expect(errors.some((error) => error.property === property)).toBe(true);
    }
  });

  it('update accepts partial fields with nullable clears', async () => {
    const dto = plainToInstance(UpdateBlogPostDto, {
      title: 'عنوان تازه',
      excerpt: null,
      categoryId: null,
      publishedAt: null,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('category create requires a name and validates the slug', async () => {
    const valid = plainToInstance(CreateBlogCategoryDto, { name: 'راهنمای خرید' });
    expect(await validate(valid)).toHaveLength(0);
    const invalid = plainToInstance(CreateBlogCategoryDto, {
      name: '   ',
      slug: 'BAD!',
    });
    const errors = await validate(invalid);
    expect(errors.some((error) => error.property === 'name')).toBe(true);
    expect(errors.some((error) => error.property === 'slug')).toBe(true);
  });

  it('list query validates page/limit bounds', async () => {
    const valid = plainToInstance(ListBlogPostsQueryDto, {
      page: 2,
      limit: 10,
      category: 'guides',
    });
    expect(await validate(valid)).toHaveLength(0);
    const invalid = plainToInstance(ListBlogPostsQueryDto, { page: 0, limit: 51 });
    const errors = await validate(invalid);
    expect(errors.some((error) => error.property === 'page')).toBe(true);
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });
});
