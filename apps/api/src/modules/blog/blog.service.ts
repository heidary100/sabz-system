import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogStatus, Prisma } from '@prisma/client';
import type {
  AdminBlogPostListItemDto,
  AdminBlogPostListResponse,
  BlogCategoryDto,
  BlogPostCardDto,
  BlogPostDetailDto,
  BlogPostListResponse,
} from '@sabz/types';
import { BLOG_STATUS_FA } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  BLOG_CATEGORIES_TAG,
  BLOG_POSTS_TAG,
  blogPostTag,
} from '../../common/storefront-cache/catalog-tags';
import { AuditService } from '../audit/audit.service';
import { sanitizeRichText } from '../products/description-sanitize';
import { ensureUniqueSlug, slugify } from '../products/slug';
import {
  CreateBlogCategoryDto,
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  UpdateBlogCategoryDto,
  UpdateBlogPostDto,
} from './dto';

const CATEGORY_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  sortOrder: true,
} as const;

const POST_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  authorName: true,
  publishedAt: true,
  category: { select: { slug: true, name: true } },
} as const;

const POST_DETAIL_SELECT = {
  ...POST_CARD_SELECT,
  content: true,
  metaTitle: true,
  metaDescription: true,
  status: true,
} as const;

const POST_ADMIN_SELECT = {
  ...POST_CARD_SELECT,
  status: true,
} as const;

type CategoryRow = Prisma.BlogCategoryGetPayload<{
  select: typeof CATEGORY_SELECT;
}>;
type PostCardRow = Prisma.BlogPostGetPayload<{
  select: typeof POST_CARD_SELECT;
}>;
type PostDetailRow = Prisma.BlogPostGetPayload<{
  select: typeof POST_DETAIL_SELECT;
}>;
type PostAdminRow = Prisma.BlogPostGetPayload<{
  select: typeof POST_ADMIN_SELECT;
}>;

/** Newest published first; deterministic tiebreak for pagination. */
const PUBLISHED_ORDER = [
  { publishedAt: { sort: 'desc' as const, nulls: 'last' as const } },
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
];

/**
 * Blog CMS (SS-238, master plan §5.10).
 *
 * Public reads serve PUBLISHED rows only (filtered in the query, never in
 * the component — drafts are indistinguishable from missing). Operator
 * writes are OPERATOR/ADMIN (guarded at the controller; the full admin UI
 * arrives with SS-240). Bodies go through the shared product-description
 * sanitizer before storage. Every mutation writes an audit event (spec §11
 * style: UPPER_SNAKE, entity 'BlogPost'/'BlogCategory') and invalidates the
 * blog storefront-cache tags.
 */
@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storefrontCache: StorefrontCacheService,
  ) {}

  /** Public category list (filing order). */
  async listCategories(): Promise<BlogCategoryDto[]> {
    const rows = await this.prisma.blogCategory.findMany({
      select: CATEGORY_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toCategoryDto);
  }

  /** Public PUBLISHED post list, newest first, optional category filter. */
  async listPosts(query: ListBlogPostsQueryDto): Promise<BlogPostListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    let categoryId: string | undefined;
    if (query.category) {
      const category = await this.prisma.blogCategory.findUnique({
        where: { slug: query.category },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException('دسته‌بندی وبلاگ یافت نشد.');
      }
      categoryId = category.id;
    }
    const where: Prisma.BlogPostWhereInput = {
      status: BlogStatus.PUBLISHED,
      ...(categoryId ? { categoryId } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        select: POST_CARD_SELECT,
        orderBy: PUBLISHED_ORDER,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map(toCardDto), total, page, limit };
  }

  /** Public PUBLISHED article by slug (drafts 404 like missing rows). */
  async getPostBySlug(slug: string): Promise<BlogPostDetailDto> {
    const row = await this.prisma.blogPost.findFirst({
      where: { slug, status: BlogStatus.PUBLISHED },
      select: POST_DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException('مطلب وبلاگ یافت نشد.');
    }
    return toDetailDto(row);
  }

  /**
   * Admin queue list (SS-240E). Unscoped across DRAFT/PUBLISHED, newest
   * first; read-only, no audit. Bodies stay out of the rows — the editor
   * fetches the detail route.
   */
  async listForAdmin(query: {
    status?: BlogStatus;
    page?: number;
    limit?: number;
  }): Promise<AdminBlogPostListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.BlogPostWhereInput = {
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        select: POST_ADMIN_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(toAdminItemDto),
      total,
      page,
      limit,
    };
  }

  /** Admin post detail by id (any status — drafts stay editable). */
  async getPostByIdForAdmin(id: string): Promise<BlogPostDetailDto> {
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      select: POST_DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException('مطلب وبلاگ یافت نشد.');
    }
    return toDetailDto(row);
  }

  /** Operator creates a category (slug generated from name when omitted). */
  async createCategory(
    userId: string,
    dto: CreateBlogCategoryDto,
    ipAddress?: string,
  ): Promise<BlogCategoryDto> {
    const slug = dto.slug?.trim() || (await this.uniqueCategorySlug(dto.name));
    try {
      const created = await this.prisma.blogCategory.create({
        data: {
          slug,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: CATEGORY_SELECT,
      });
      await this.audit.log({
        userId,
        action: 'BLOG_CATEGORY_CREATED',
        entity: 'BlogCategory',
        entityId: created.id,
        after: { slug },
        ipAddress,
      });
      void this.storefrontCache.invalidate([BLOG_CATEGORIES_TAG]);
      return toCategoryDto(created);
    } catch (error) {
      if (this.isUniqueViolation(error, 'BlogCategory')) {
        throw new ConflictException('دسته‌بندی با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /** Operator updates a category. */
  async updateCategory(
    userId: string,
    id: string,
    dto: UpdateBlogCategoryDto,
    ipAddress?: string,
  ): Promise<BlogCategoryDto> {
    await this.requireCategory(id);
    try {
      const updated = await this.prisma.blogCategory.update({
        where: { id },
        data: {
          ...(dto.slug ? { slug: dto.slug.trim() } : {}),
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        select: CATEGORY_SELECT,
      });
      await this.audit.log({
        userId,
        action: 'BLOG_CATEGORY_UPDATED',
        entity: 'BlogCategory',
        entityId: id,
        after: { slug: updated.slug },
        ipAddress,
      });
      void this.storefrontCache.invalidate([BLOG_CATEGORIES_TAG]);
      return toCategoryDto(updated);
    } catch (error) {
      if (this.isUniqueViolation(error, 'BlogCategory')) {
        throw new ConflictException('دسته‌بندی با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /** Operator deletes a category (blocked while posts reference it). */
  async deleteCategory(
    userId: string,
    id: string,
    ipAddress?: string,
  ): Promise<{ id: string }> {
    const row = await this.requireCategory(id);
    const referencing = await this.prisma.blogPost.count({
      where: { categoryId: id },
    });
    if (referencing > 0) {
      throw new ConflictException(
        'این دسته‌بندی دارای مطلب است؛ ابتدا مطالب را منتقل کنید.',
      );
    }
    await this.prisma.blogCategory.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'BLOG_CATEGORY_DELETED',
      entity: 'BlogCategory',
      entityId: id,
      before: { slug: row.slug },
      ipAddress,
    });
    void this.storefrontCache.invalidate([BLOG_CATEGORIES_TAG]);
    return { id };
  }

  /** Operator creates an article (DRAFT unless published explicitly). */
  async createPost(
    userId: string,
    dto: CreateBlogPostDto,
    ipAddress?: string,
  ): Promise<BlogPostDetailDto> {
    const categoryId = await this.resolveCategoryId(dto.categoryId);
    const slug = dto.slug?.trim() || (await this.uniquePostSlug(dto.title));
    const status = dto.status ?? BlogStatus.DRAFT;
    const publishedAt = this.resolvePublishedAt(status, dto.publishedAt);
    try {
      const created = await this.prisma.blogPost.create({
        data: {
          slug,
          categoryId,
          title: dto.title.trim(),
          excerpt: dto.excerpt?.trim() || null,
          content: sanitizeRichText(dto.content),
          coverImageUrl: dto.coverImageUrl?.trim() || null,
          authorName: dto.authorName?.trim() || null,
          metaTitle: dto.metaTitle?.trim() || null,
          metaDescription: dto.metaDescription?.trim() || null,
          status,
          publishedAt,
          createdBy: userId,
        },
        select: POST_DETAIL_SELECT,
      });
      await this.audit.log({
        userId,
        action: 'BLOG_POST_CREATED',
        entity: 'BlogPost',
        entityId: created.id,
        after: { slug, status },
        ipAddress,
      });
      void this.storefrontCache.invalidate([BLOG_POSTS_TAG]);
      return toDetailDto(created);
    } catch (error) {
      if (this.isUniqueViolation(error, 'BlogPost')) {
        throw new ConflictException('مطلب با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /** Operator updates an article (slug stays stable unless given). */
  async updatePost(
    userId: string,
    id: string,
    dto: UpdateBlogPostDto,
    ipAddress?: string,
  ): Promise<BlogPostDetailDto> {
    const existing = await this.requirePost(id);
    const categoryId =
      dto.categoryId === undefined
        ? undefined
        : await this.resolveCategoryId(dto.categoryId);
    // First-time publish without an explicit timestamp stamps now so the
    // row orders with the newest; otherwise timestamps stay untouched
    // unless publishedAt is given explicitly.
    let publishedAt: Date | null | undefined;
    if (dto.publishedAt === undefined) {
      publishedAt =
        dto.status === BlogStatus.PUBLISHED &&
        existing.status !== BlogStatus.PUBLISHED &&
        existing.publishedAt === null
          ? new Date()
          : undefined;
    } else {
      publishedAt = this.resolvePublishedAt(
        dto.status ?? existing.status,
        dto.publishedAt,
      );
    }
    try {
      const updated = await this.prisma.blogPost.update({
        where: { id },
        data: {
          ...(dto.slug ? { slug: dto.slug.trim() } : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(dto.title ? { title: dto.title.trim() } : {}),
          ...(dto.excerpt !== undefined
            ? { excerpt: dto.excerpt?.trim() || null }
            : {}),
          ...(dto.content !== undefined
            ? { content: sanitizeRichText(dto.content) }
            : {}),
          ...(dto.coverImageUrl !== undefined
            ? { coverImageUrl: dto.coverImageUrl?.trim() || null }
            : {}),
          ...(dto.authorName !== undefined
            ? { authorName: dto.authorName?.trim() || null }
            : {}),
          ...(dto.metaTitle !== undefined
            ? { metaTitle: dto.metaTitle?.trim() || null }
            : {}),
          ...(dto.metaDescription !== undefined
            ? { metaDescription: dto.metaDescription?.trim() || null }
            : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(publishedAt !== undefined ? { publishedAt } : {}),
          updatedBy: userId,
        },
        select: POST_DETAIL_SELECT,
      });
      await this.audit.log({
        userId,
        action: 'BLOG_POST_UPDATED',
        entity: 'BlogPost',
        entityId: id,
        before: { slug: existing.slug, status: existing.status },
        after: { slug: updated.slug, status: updated.status },
        ipAddress,
      });
      const tags = [BLOG_POSTS_TAG, blogPostTag(updated.slug)];
      if (existing.slug !== updated.slug) {
        tags.push(blogPostTag(existing.slug));
      }
      void this.storefrontCache.invalidate(tags);
      return toDetailDto(updated);
    } catch (error) {
      if (this.isUniqueViolation(error, 'BlogPost')) {
        throw new ConflictException('مطلب با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /**
   * Operator archives an article (→ DRAFT, invisible publicly; the row and
   * its publish record stay for the SS-240 admin UI).
   */
  async archivePost(
    userId: string,
    id: string,
    ipAddress?: string,
  ): Promise<BlogPostDetailDto> {
    const existing = await this.requirePost(id);
    const archived = await this.prisma.blogPost.update({
      where: { id },
      data: { status: BlogStatus.DRAFT, updatedBy: userId },
      select: POST_DETAIL_SELECT,
    });
    await this.audit.log({
      userId,
      action: 'BLOG_POST_ARCHIVED',
      entity: 'BlogPost',
      entityId: id,
      before: { slug: existing.slug, status: existing.status },
      after: { slug: archived.slug, status: BlogStatus.DRAFT },
      ipAddress,
    });
    void this.storefrontCache.invalidate([
      BLOG_POSTS_TAG,
      blogPostTag(archived.slug),
    ]);
    return toDetailDto(archived);
  }

  private async requireCategory(id: string): Promise<CategoryRow> {
    const row = await this.prisma.blogCategory.findUnique({
      where: { id },
      select: CATEGORY_SELECT,
    });
    if (!row) {
      throw new NotFoundException('دسته‌بندی وبلاگ یافت نشد.');
    }
    return row;
  }

  private async requirePost(
    id: string,
  ): Promise<{ slug: string; status: BlogStatus; publishedAt: Date | null }> {
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { slug: true, status: true, publishedAt: true },
    });
    if (!row) {
      throw new NotFoundException('مطلب وبلاگ یافت نشد.');
    }
    return row;
  }

  private async resolveCategoryId(
    categoryId?: string | null,
  ): Promise<string | null | undefined> {
    if (categoryId === undefined) {
      return undefined;
    }
    if (categoryId === null) {
      return null;
    }
    await this.requireCategory(categoryId);
    return categoryId;
  }

  private async uniquePostSlug(title: string): Promise<string> {
    const { slug } = await ensureUniqueSlug(title, 'post', async (candidate) => {
      const row = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return row !== null;
    });
    return slug;
  }

  private async uniqueCategorySlug(name: string): Promise<string> {
    const base = slugify(name);
    if (base.length === 0) {
      const { slug } = await ensureUniqueSlug(name, 'blog-category', async () => false);
      return slug;
    }
    const { slug } = await ensureUniqueSlug(
      name,
      'blog-category',
      async (candidate) => {
        const row = await this.prisma.blogCategory.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return row !== null;
      },
    );
    return slug;
  }

  /**
   * Publishing without an explicit timestamp stamps now; clearing the
   * timestamp (null) keeps the row ordered by creation. Invalid ISO input
   * is a 400 with a Persian message.
   */
  private resolvePublishedAt(
    status: BlogStatus,
    publishedAt?: string | null,
  ): Date | null | undefined {
    if (publishedAt === undefined) {
      return status === BlogStatus.PUBLISHED ? new Date() : undefined;
    }
    if (publishedAt === null) {
      return null;
    }
    const parsed = new Date(publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('publishedAt باید تاریخ معتبر باشد.');
    }
    return parsed;
  }

  private isUniqueViolation(error: unknown, model: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta as { modelName?: string } | undefined)?.modelName === model
    );
  }
}

function toCategoryDto(row: CategoryRow): BlogCategoryDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
  };
}

function toCardDto(row: PostCardRow): BlogPostCardDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverImageUrl: row.coverImageUrl,
    category: row.category
      ? { slug: row.category.slug, name: row.category.name }
      : null,
    authorName: row.authorName,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toDetailDto(row: PostDetailRow): BlogPostDetailDto {
  return {
    ...toCardDto(row),
    content: row.content,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    status: row.status,
    statusFa: BLOG_STATUS_FA[row.status],
  };
}

function toAdminItemDto(row: PostAdminRow): AdminBlogPostListItemDto {
  return {
    ...toCardDto(row),
    status: row.status,
    statusFa: BLOG_STATUS_FA[row.status],
  };
}
