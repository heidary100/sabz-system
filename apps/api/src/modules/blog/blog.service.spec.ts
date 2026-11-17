import { ConflictException } from '@nestjs/common';
import { BlogStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/database/prisma.service';
import type { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import type { AuditService } from '../audit/audit.service';
import { BlogService } from './blog.service';

interface FakeBlogTx {
  blogCategory: { findUnique: jest.Mock };
  blogPost: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  auditLog: { create: jest.Mock };
}

function makeService() {
  const tx: FakeBlogTx = {
    blogCategory: { findUnique: jest.fn() },
    blogPost: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'post-id',
        category: null,
        publishedAt: null,
        ...data,
      })),
    },
    auditLog: { create: jest.fn(async () => ({ id: 'audit-id' })) },
  };
  const prisma = {
    $transaction: jest.fn(
      async (fn: (client: FakeBlogTx) => Promise<unknown>) => fn(tx),
    ),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const cache = { invalidate: jest.fn(async () => undefined) };
  const service = new BlogService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    cache as unknown as StorefrontCacheService,
  );
  return { service, tx, prisma, audit, cache };
}

describe('BlogService explicit slug creation', () => {
  it('persists the exact explicit slug instead of deriving it from the title', async () => {
    const { service, tx, audit, cache } = makeService();

    await service.createPost('actor', {
      slug: 'homepage-demo-article-1',
      title: 'عنوان فارسی کاملاً متفاوت',
      content: '<p>approved body</p>',
      status: BlogStatus.DRAFT,
    });

    expect(tx.blogPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'homepage-demo-article-1',
          title: 'عنوان فارسی کاملاً متفاوت',
          status: BlogStatus.DRAFT,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(cache.invalidate).toHaveBeenCalledWith(['blog:posts']);
  });

  it('still derives a title slug when no explicit slug is supplied', async () => {
    const { service, tx } = makeService();

    await service.createPost('actor', {
      title: 'Different Title',
      content: '<p>body</p>',
      status: BlogStatus.DRAFT,
    });

    expect(tx.blogPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'different-title' }),
      }),
    );
  });

  it('maps a BlogPost slug uniqueness violation to a conflict', async () => {
    const { service, tx } = makeService();
    tx.blogPost.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate slug', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { modelName: 'BlogPost' },
      }),
    );

    await expect(
      service.createPost('actor', {
        slug: 'homepage-demo-article-1',
        title: 'title',
        content: '<p>body</p>',
        status: BlogStatus.DRAFT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
