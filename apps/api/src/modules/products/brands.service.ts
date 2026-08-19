import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BrandSummary, PaginatedResult } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateSlug } from './slug';
import {
  CreateBrandDto,
  ListBrandsQueryDto,
  UpdateBrandDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isFeatured: true,
  deletedAt: true,
} satisfies Prisma.BrandSelect;

type SummaryRow = Prisma.BrandGetPayload<{ select: typeof summarySelect }>;

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
    const slug = dto.slug ?? generateSlug(dto.name, 'brand');

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.brand.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description ?? null,
            isFeatured: dto.isFeatured ?? false,
            createdBy: actorId,
          } satisfies Prisma.BrandUncheckedCreateInput,
          select: summarySelect,
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
            },
            ipAddress,
          },
          tx,
        );

        return row;
      });

      return this.toSummary(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک برند با این slug قبلاً وجود دارد.');
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
      return this.toSummary(updated);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک برند با این slug قبلاً وجود دارد.');
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
    return this.toSummary(deleted);
  }

  private buildUpdateData(dto: UpdateBrandDto): BrandUpdateData {
    const data: BrandUpdateData = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
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

    return delta;
  }

  private toSummary(row: SummaryRow): BrandSummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isFeatured: row.isFeatured,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      error.meta?.modelName === 'Brand'
    );
  }
}

interface UpdateTargetRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isFeatured: boolean;
  deletedAt: Date | null;
}

interface BrandUpdateData {
  name?: string;
  slug?: string;
  description?: string | null;
  isFeatured?: boolean;
}
