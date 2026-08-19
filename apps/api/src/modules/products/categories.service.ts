import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CategoryDetail,
  CategorySummary,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateSlug } from './slug';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  sortOrder: true,
  isVisible: true,
  deletedAt: true,
} satisfies Prisma.CategorySelect;

const detailSelect = {
  ...summarySelect,
  children: {
    where: { deletedAt: null },
    select: summarySelect,
    orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.CategorySelect;

type SummaryRow = Prisma.CategoryGetPayload<{ select: typeof summarySelect }>;
type DetailRow = Prisma.CategoryGetPayload<{ select: typeof detailSelect }>;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    query: ListCategoriesQueryDto,
  ): Promise<PaginatedResult<CategorySummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = { deletedAt: null };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        select: summarySelect,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
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

  async getDetail(categoryId: string): Promise<CategoryDetail> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: detailSelect,
    });

    if (!category || category.deletedAt !== null) {
      throw new NotFoundException('دستهبندی یافت نشد.');
    }

    return this.toDetail(category);
  }

  async create(
    dto: CreateCategoryDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<CategoryDetail> {
    const slug = dto.slug ?? generateSlug(dto.name, 'category');

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.parentId !== undefined && dto.parentId !== null) {
          await this.assertParent(tx, dto.parentId);
        }

        const row = await tx.category.create({
          data: {
            name: dto.name,
            slug,
            parentId: dto.parentId ?? null,
            sortOrder: dto.sortOrder ?? 0,
            isVisible: dto.isVisible ?? true,
            createdBy: actorId,
          } satisfies Prisma.CategoryUncheckedCreateInput,
          select: detailSelect,
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'CATEGORY_CREATED',
            entity: 'Category',
            entityId: row.id,
            before: null,
            after: {
              name: row.name,
              slug: row.slug,
              parentId: row.parentId,
              sortOrder: row.sortOrder,
              isVisible: row.isVisible,
            },
            ipAddress,
          },
          tx,
        );

        return row;
      });

      return this.toDetail(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک دستهبندی با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async update(
    categoryId: string,
    dto: UpdateCategoryDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<CategoryDetail> {
    const data = this.buildUpdateData(dto);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const target = await tx.category.findUnique({
          where: { id: categoryId },
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true,
            sortOrder: true,
            isVisible: true,
            deletedAt: true,
          },
        });

        if (!target || target.deletedAt !== null) {
          throw new NotFoundException('دستهبندی یافت نشد.');
        }

        if (data.parentId !== undefined) {
          const newParentId = data.parentId;
          if (newParentId === categoryId) {
            throw new ConflictException('یک دستهبندی نمیتواند والد خودش باشد.');
          }
          if (newParentId !== null) {
            await this.assertParent(tx, newParentId);
            await this.assertNoCycle(tx, categoryId, newParentId);
          }
        }

        const before = this.businessDelta(target, data, 'before');
        const after = this.businessDelta(target, data, 'after');

        if (Object.keys(data).length === 0) {
          const current = await tx.category.findUnique({
            where: { id: categoryId },
            select: detailSelect,
          });
          if (!current || current.deletedAt !== null) {
            throw new NotFoundException('دستهبندی یافت نشد.');
          }
          return current;
        }

        const updatedRows = await tx.category.updateMany({
          where: { id: categoryId, deletedAt: null },
          data: {
            ...data,
            updatedBy: actorId,
          } as Prisma.CategoryUncheckedUpdateManyInput,
        });
        if (updatedRows.count === 0) {
          throw new NotFoundException('دستهبندی یافت نشد.');
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'CATEGORY_UPDATED',
            entity: 'Category',
            entityId: categoryId,
            before,
            after,
            ipAddress,
          },
          tx,
        );

        return tx.category.findUnique({
          where: { id: categoryId },
          select: detailSelect,
        });
      });

      if (!updated) {
        throw new NotFoundException('دستهبندی یافت نشد.');
      }
      return this.toDetail(updated);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک دستهبندی با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async softDelete(
    categoryId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<CategoryDetail> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const target = await tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true, deletedAt: true },
      });

      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('دستهبندی یافت نشد.');
      }

      const childCount = await tx.category.count({
        where: { parentId: categoryId, deletedAt: null },
      });
      if (childCount > 0) {
        throw new ConflictException(
          'این دستهبندی دارای زیردسته فعال است؛ ابتدا زیردستهها را جابهجا یا حذف کنید.',
        );
      }

      const activeProductCount = await tx.product.count({
        where: { categoryId, deletedAt: null },
      });
      if (activeProductCount > 0) {
        throw new ConflictException(
          'این دستهبندی توسط محصولات فعال استفاده میشود و قابل حذف نیست.',
        );
      }

      const deletedAt = new Date();

      const updated = await tx.category.updateMany({
        where: { id: categoryId, deletedAt: null },
        data: { deletedAt, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new NotFoundException('دستهبندی یافت نشد.');
      }

      const row = await tx.category.findUnique({
        where: { id: categoryId },
        select: detailSelect,
      });

      await this.auditService.log(
        {
          userId: actorId,
          action: 'CATEGORY_DELETED',
          entity: 'Category',
          entityId: categoryId,
          before: { deletedAt: null },
          after: { deletedAt: deletedAt.toISOString() },
          ipAddress,
        },
        tx,
      );

      return row;
    });

    if (!deleted) {
      throw new NotFoundException('دستهبندی یافت نشد.');
    }
    return this.toDetail(deleted);
  }

  private async assertParent(
    tx: Prisma.TransactionClient,
    parentId: string,
  ): Promise<void> {
    const parent = await tx.category.findUnique({
      where: { id: parentId },
      select: { id: true, deletedAt: true },
    });
    if (!parent || parent.deletedAt !== null) {
      throw new NotFoundException('دستهبندی والد یافت نشد.');
    }
  }

  /**
   * Reject moving `categoryId` under `newParentId` if that would form a cycle
   * (i.e. the new parent is the category itself or one of its descendants).
   * Walks up from the new parent through the parent chain inside the
   * transaction.
   */
  private async assertNoCycle(
    tx: Prisma.TransactionClient,
    categoryId: string,
    newParentId: string,
  ): Promise<void> {
    const visited = new Set<string>([categoryId]);
    let current: string | null = newParentId;

    while (current !== null) {
      if (visited.has(current)) {
        throw new ConflictException(
          'جابهجایی باعث ایجاد چرخه در سلسلهمراتب دستهبندی میشود.',
        );
      }
      visited.add(current);

      const row: { parentId: string | null; deletedAt: Date | null } | null =
        await tx.category.findUnique({
          where: { id: current },
          select: { parentId: true, deletedAt: true },
        });
      if (!row || row.deletedAt !== null) {
        break;
      }
      current = row.parentId;
    }
  }

  private buildUpdateData(dto: UpdateCategoryDto): CategoryUpdateData {
    const data: CategoryUpdateData = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isVisible !== undefined) data.isVisible = dto.isVisible;
    return data;
  }

  private businessDelta(
    target: UpdateTargetRow,
    data: CategoryUpdateData,
    side: 'before' | 'after',
  ): Record<string, string | number | boolean | null> {
    const delta: Record<string, string | number | boolean | null> = {};
    const changed = (key: keyof CategoryUpdateData) => key in data;

    if (changed('name'))
      delta.name = side === 'before' ? target.name : (data.name as string);
    if (changed('slug'))
      delta.slug = side === 'before' ? target.slug : (data.slug as string);
    if (changed('parentId'))
      delta.parentId = side === 'before' ? target.parentId : (data.parentId as string | null);
    if (changed('sortOrder'))
      delta.sortOrder = side === 'before' ? target.sortOrder : (data.sortOrder as number);
    if (changed('isVisible'))
      delta.isVisible = side === 'before' ? target.isVisible : (data.isVisible as boolean);

    return delta;
  }

  private toSummary(row: SummaryRow): CategorySummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible,
    };
  }

  private toDetail(row: DetailRow): CategoryDetail {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible,
      children: row.children.map((child) => this.toSummary(child)),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      error.meta?.modelName === 'Category'
    );
  }
}

interface UpdateTargetRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isVisible: boolean;
  deletedAt: Date | null;
}

interface CategoryUpdateData {
  name?: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
}
