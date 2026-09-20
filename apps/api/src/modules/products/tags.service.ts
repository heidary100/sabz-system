import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import type { TagDto } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { SLUG_PATTERN } from './dto/create-product.dto';
import { normalizeTagName } from './tags-normalize';

/**
 * Tag domain service (SS-203).
 *
 * Service-only layer (no HTTP routes in v1; admin tag UI is deferred —
 * same standing as AttributesService). The future importer (SS-206/207) is
 * the primary caller: it upserts tags idempotently by normalized key and
 * assigns them in source order.
 *
 * No AuditLog writes here: importer volume would spam the log; per-row
 * provenance lives in ImportRecord (ADR-004).
 */

const SLUG_MAX = 120;

const tagSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.TagSelect;

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent tag upsert by normalized key (importer hot path). The first
   * display form and slug win and are never renamed by later variants —
   * renaming is a deliberate future admin action, not an import side effect.
   */
  async upsertTag(rawName: string, slug: string): Promise<TagDto> {
    const normalized = normalizeTagName(rawName);
    if (!normalized) {
      throw new BadRequestException('نام برچسب معتبر نیست.');
    }
    const cleanSlug = requireSlug(slug);

    const existing = await this.prisma.tag.findUnique({
      where: { key: normalized.key },
      select: tagSelect,
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.tag.create({
        data: { name: normalized.name, key: normalized.key, slug: cleanSlug },
        select: tagSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'Tag')) {
        throw new ConflictException('برچسب با این نام یا slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /**
   * Assign a tag to a product in source order. Re-assigning the same tag is
   * a 409 (importer treats it as skip).
   */
  async assignTag(
    productId: string,
    rawName: string,
    slug: string,
    sortOrder = 0,
  ): Promise<void> {
    await this.assertProductForMutation(productId);
    const tag = await this.upsertTag(rawName, slug);
    try {
      await this.prisma.productTag.create({
        data: { productId, tagId: tag.id, sortOrder },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'ProductTag')) {
        throw new ConflictException('این برچسب قبلاً برای محصول ثبت شده است.');
      }
      throw error;
    }
  }

  async unassignTag(productId: string, tagId: string): Promise<void> {
    await this.prisma.productTag.deleteMany({
      where: { productId, tagId },
    });
  }

  /** Ordered tags of a product with display data. */
  async listProductTags(productId: string): Promise<TagDto[]> {
    const rows = await this.prisma.productTag.findMany({
      where: { productId },
      select: { tag: { select: tagSelect } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => row.tag);
  }

  /** Hard delete, guarded: tags assigned to products cannot be deleted. */
  async deleteTag(id: string): Promise<void> {
    const used = await this.prisma.productTag.count({
      where: { tagId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'این برچسب به محصول‌ها اختصاص دارد و قابل حذف نیست.',
      );
    }
    const deleted = await this.prisma.tag.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new NotFoundException('برچسب یافت نشد.');
    }
  }

  private async assertProductForMutation(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
  }
}

function requireSlug(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('slug برچسب الزامی است.');
  }
  const slug = value.trim().toLowerCase();
  if (slug.length === 0 || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'slug برچسب باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.',
    );
  }
  return slug;
}

function isUniqueViolation(error: unknown, model: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    error.meta?.modelName === model
  );
}
