import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BrandAliasKind, Prisma } from '@prisma/client';
import type { BrandSummary, PaginatedResult } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_BRANDS_TAG,
  CATALOG_PRODUCTS_TAG,
} from '../../common/storefront-cache/catalog-tags';
import { generateSlug } from './slug';
import {
  BrandAliasConflictError,
  addBrandAlias,
  ensureBrandAliases,
  findBrandNameOwner,
} from './brand-alias';
import { brandNameKeys } from './brand-normalize';
import {
  CreateBrandDto,
  ListBrandsQueryDto,
  UpdateBrandDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const BRAND_NAME_CONFLICT_MESSAGE =
  'برندی با این نام یا نام مشابه قبلاً ثبت شده است.';
const BRAND_SLUG_CONFLICT_MESSAGE = 'یک برند با این slug قبلاً وجود دارد.';

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isFeatured: true,
  nameEn: true,
  deletedAt: true,
} satisfies Prisma.BrandSelect;

type SummaryRow = Prisma.BrandGetPayload<{ select: typeof summarySelect }>;

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storefrontCache: StorefrontCacheService,
  ) {}

  async list(query: ListBrandsQueryDto): Promise<PaginatedResult<BrandSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.BrandWhereInput = { deletedAt: null };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        select: summarySelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      limit,
    };
  }

  async getDetail(brandId: string): Promise<BrandSummary> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: summarySelect,
    });

    if (!brand || brand.deletedAt !== null) {
      throw new NotFoundException('برند یافت نشد.');
    }

    return this.toSummary(brand);
  }

  async create(
    dto: CreateBrandDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<BrandSummary> {
    const name = dto.name.trim();
    const nameEn = dto.nameEn ?? null;
    const { nameKey, keys } = brandNameKeys(name, nameEn);
    if (name.length === 0 || nameKey === null) {
      throw new BadRequestException('نام برند معتبر نیست.');
    }
    const slug = dto.slug ?? generateSlug(name, 'brand');

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        for (const key of keys) {
          const owner = await findBrandNameOwner(tx, key);
          if (owner !== null) {
            throw new ConflictException(BRAND_NAME_CONFLICT_MESSAGE);
          }
        }

        const row = await tx.brand.create({
          data: {
            name,
            slug,
            description: dto.description ?? null,
            isFeatured: dto.isFeatured ?? false,
            nameEn,
            createdBy: actorId,
          } satisfies Prisma.BrandUncheckedCreateInput,
          select: summarySelect,
        });

        await ensureBrandAliases(tx, {
          brandId: row.id,
          name: row.name,
          nameEn: row.nameEn,
          createdBy: actorId,
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'BRAND_CREATED',
            entity: 'Brand',
            entityId: row.id,
            before: null,
            after: {
              name: row.name,
              slug: row.slug,
              description: row.description,
              isFeatured: row.isFeatured,
              nameEn: row.nameEn,
            },
            ipAddress,
          },
          tx,
        );

        return row;
      });

      void this.storefrontCache.invalidate([CATALOG_BRANDS_TAG]);
      return this.toSummary(created);
    } catch (error) {
      if (
        error instanceof BrandAliasConflictError ||
        this.isBrandAliasUniqueViolation(error)
      ) {
        throw new ConflictException(BRAND_NAME_CONFLICT_MESSAGE);
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(BRAND_SLUG_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }

  async update(
    brandId: string,
    dto: UpdateBrandDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<BrandSummary> {
    if (dto.name !== undefined && dto.name.trim().length === 0) {
      throw new BadRequestException('نام برند معتبر نیست.');
    }
    const data = this.buildUpdateData(dto);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const target = await tx.brand.findUnique({
          where: { id: brandId },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            isFeatured: true,
            nameEn: true,
            deletedAt: true,
          },
        });

        if (!target || target.deletedAt !== null) {
          throw new NotFoundException('برند یافت نشد.');
        }

        const before = this.businessDelta(target, data, 'before');
        const after = this.businessDelta(target, data, 'after');

        if (Object.keys(data).length === 0) {
          const current = await tx.brand.findUnique({
            where: { id: brandId },
            select: summarySelect,
          });
          if (!current || current.deletedAt !== null) {
            throw new NotFoundException('برند یافت نشد.');
          }
          return current;
        }

        const nextName = data.name ?? target.name;
        const nextNameEn =
          'nameEn' in data ? (data.nameEn ?? null) : target.nameEn;
        const identityChanged =
          nextName !== target.name || nextNameEn !== target.nameEn;
        const { nameKey, keys } = brandNameKeys(nextName, nextNameEn);
        if (identityChanged && nameKey === null) {
          throw new BadRequestException('نام برند معتبر نیست.');
        }
        if (identityChanged) {
          for (const key of keys) {
            const owner = await findBrandNameOwner(tx, key, brandId);
            if (owner !== null) {
              throw new ConflictException(BRAND_NAME_CONFLICT_MESSAGE);
            }
          }
        }

        const updatedRows = await tx.brand.updateMany({
          where: { id: brandId, deletedAt: null },
          data: {
            ...data,
            updatedBy: actorId,
          } as Prisma.BrandUncheckedUpdateManyInput,
        });
        if (updatedRows.count === 0) {
          throw new NotFoundException('برند یافت نشد.');
        }

        if (identityChanged) {
          await ensureBrandAliases(tx, {
            brandId,
            name: nextName,
            nameEn: nextNameEn,
            createdBy: actorId,
          });
          await addBrandAlias(tx, {
            brandId,
            rawName: target.name,
            kind: BrandAliasKind.LEGACY,
            createdBy: actorId,
          });
          if (target.nameEn !== null) {
            await addBrandAlias(tx, {
              brandId,
              rawName: target.nameEn,
              kind: BrandAliasKind.LEGACY,
              createdBy: actorId,
            });
          }
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'BRAND_UPDATED',
            entity: 'Brand',
            entityId: brandId,
            before,
            after,
            ipAddress,
          },
          tx,
        );

        return tx.brand.findUnique({
          where: { id: brandId },
          select: summarySelect,
        });
      });

      if (!updated) {
        throw new NotFoundException('برند یافت نشد.');
      }
      void this.storefrontCache.invalidate([
        CATALOG_BRANDS_TAG,
        CATALOG_PRODUCTS_TAG,
      ]);
      return this.toSummary(updated);
    } catch (error) {
      if (
        error instanceof BrandAliasConflictError ||
        this.isBrandAliasUniqueViolation(error)
      ) {
        throw new ConflictException(BRAND_NAME_CONFLICT_MESSAGE);
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(BRAND_SLUG_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }

  async softDelete(
    brandId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<BrandSummary> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const target = await tx.brand.findUnique({
        where: { id: brandId },
        select: { id: true, deletedAt: true },
      });

      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('برند یافت نشد.');
      }

      const activeProductCount = await tx.product.count({
        where: { brandId, deletedAt: null },
      });
      if (activeProductCount > 0) {
        throw new ConflictException(
          'این برند توسط محصولات فعال استفاده میشود و قابل حذف نیست.',
        );
      }

      const deletedAt = new Date();

      const updated = await tx.brand.updateMany({
        where: { id: brandId, deletedAt: null },
        data: { deletedAt, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new NotFoundException('برند یافت نشد.');
      }

      const row = await tx.brand.findUnique({
        where: { id: brandId },
        select: summarySelect,
      });

      await this.auditService.log(
        {
          userId: actorId,
          action: 'BRAND_DELETED',
          entity: 'Brand',
          entityId: brandId,
          before: { deletedAt: null },
          after: { deletedAt: deletedAt.toISOString() },
          ipAddress,
        },
        tx,
      );

      return row;
    });

    if (!deleted) {
      throw new NotFoundException('برند یافت نشد.');
    }
    // A deleted brand changes which products match the storefront brand
    // filter, so listings need dropping too — not just the facet list.
    void this.storefrontCache.invalidate([CATALOG_BRANDS_TAG, CATALOG_PRODUCTS_TAG]);
    return this.toSummary(deleted);
  }

  private buildUpdateData(dto: UpdateBrandDto): BrandUpdateData {
    const data: BrandUpdateData = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;
    return data;
  }

  private businessDelta(
    target: UpdateTargetRow,
    data: BrandUpdateData,
    side: 'before' | 'after',
  ): Record<string, string | boolean | null> {
    const delta: Record<string, string | boolean | null> = {};
    const changed = (key: keyof BrandUpdateData) => key in data;

    if (changed('name'))
      delta.name = side === 'before' ? target.name : (data.name as string);
    if (changed('slug'))
      delta.slug = side === 'before' ? target.slug : (data.slug as string);
    if (changed('description'))
      delta.description = side === 'before' ? target.description : (data.description as string | null);
    if (changed('isFeatured'))
      delta.isFeatured = side === 'before' ? target.isFeatured : (data.isFeatured as boolean);
    if (changed('nameEn'))
      delta.nameEn = side === 'before' ? target.nameEn : (data.nameEn as string | null);

    return delta;
  }

  private toSummary(row: SummaryRow): BrandSummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isFeatured: row.isFeatured,
      nameEn: row.nameEn,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.modelName === 'Brand' ||
        this.p2002TargetIncludes(error, 'slug'))
    );
  }

  private isBrandAliasUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.modelName === 'BrandAlias' ||
        this.p2002TargetIncludes(error, 'normalizedKey'))
    );
  }

  private p2002TargetIncludes(
    error: Prisma.PrismaClientKnownRequestError,
    column: string,
  ): boolean {
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes(column);
    }
    return typeof target === 'string' && target.includes(column);
  }
}

interface UpdateTargetRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isFeatured: boolean;
  nameEn: string | null;
  deletedAt: Date | null;
}

interface BrandUpdateData {
  name?: string;
  slug?: string;
  description?: string | null;
  isFeatured?: boolean;
  nameEn?: string | null;
}
