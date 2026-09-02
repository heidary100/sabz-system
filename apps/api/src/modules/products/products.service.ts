import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import type {
  PaginatedResult,
  ProductDetail,
  ProductSummary,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateSlug } from './slug';
import {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function escapeLike(search: string): string {
  return search.replace(/[\\%_]/g, '\\$&');
}

const listSelect = {
  id: true,
  name: true,
  slug: true,
  condition: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  brand: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isFeatured: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      isVisible: true,
    },
  },
} satisfies Prisma.ProductSelect;

const detailSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  description: true,
  warranty: true,
  condition: true,
  status: true,
  weightKg: true,
  widthCm: true,
  heightCm: true,
  depthCm: true,
  originCountry: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  brand: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isFeatured: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      isVisible: true,
    },
  },
  variants: {
    where: { deletedAt: null },
    select: {
      id: true,
      productId: true,
      sku: true,
      barcode: true,
      name: true,
      price: true,
      stockQuantity: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  media: {
    where: { deletedAt: null },
    select: {
      id: true,
      productId: true,
      variantId: true,
      mediaType: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      sortOrder: true,
      isPrimary: true,
      createdAt: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.ProductSelect;

type ListRow = Prisma.ProductGetPayload<{ select: typeof listSelect }>;
type DetailRow = Prisma.ProductGetPayload<{ select: typeof detailSelect }>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    query: ListProductsQueryDto,
  ): Promise<PaginatedResult<ProductSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
      ...(query.brandId !== undefined ? { brandId: query.brandId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: escapeLike(search), mode: 'insensitive' } },
              { slug: { contains: escapeLike(search), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  async getDetail(productId: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: detailSelect,
    });

    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }

    return this.toDetail(product);
  }

  async create(
    dto: CreateProductDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<ProductDetail> {
    if (dto.status !== undefined && dto.status !== ProductStatus.DRAFT) {
      throw new BadRequestException(
        'محصول جدید باید با وضعیت DRAFT ایجاد شود؛ انتشار از طریق مسیر publish انجام میشود.',
      );
    }

    const slug = dto.slug ?? generateSlug(dto.name, 'product');

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        await this.assertBrandAndCategory(tx, dto.brandId, dto.categoryId);

        const created = await tx.product.create({
          data: {
            name: dto.name,
            slug,
            shortDescription: dto.shortDescription ?? null,
            description: dto.description ?? null,
            brandId: dto.brandId,
            categoryId: dto.categoryId,
            warranty: dto.warranty ?? null,
            condition: dto.condition,
            status: ProductStatus.DRAFT,
            weightKg: dto.weightKg,
            widthCm: dto.widthCm,
            heightCm: dto.heightCm,
            depthCm: dto.depthCm,
            originCountry: dto.originCountry ?? null,
            createdBy: actorId,
          } satisfies Prisma.ProductUncheckedCreateInput,
          select: detailSelect,
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'PRODUCT_CREATED',
            entity: 'Product',
            entityId: created.id,
            before: null,
            after: {
              name: created.name,
              slug: created.slug,
              condition: created.condition,
              status: created.status,
              brandId: dto.brandId,
              categoryId: dto.categoryId,
            },
            ipAddress,
          },
          tx,
        );

        return created;
      });

      return this.toDetail(product);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک محصول با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async update(
    productId: string,
    dto: UpdateProductDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<ProductDetail> {
    const data = this.buildUpdateData(dto);

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const target = await tx.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            status: true,
            deletedAt: true,
            name: true,
            slug: true,
            shortDescription: true,
            description: true,
            brandId: true,
            categoryId: true,
            warranty: true,
            condition: true,
            weightKg: true,
            widthCm: true,
            heightCm: true,
            depthCm: true,
            originCountry: true,
          },
        });

        if (!target || target.deletedAt !== null) {
          throw new NotFoundException('محصول یافت نشد.');
        }
        if (target.status === ProductStatus.ARCHIVED) {
          throw new ConflictException(
            'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
          );
        }

        if (data.brandId !== undefined || data.categoryId !== undefined) {
          const brandId = data.brandId ?? target.brandId;
          const categoryId = data.categoryId ?? target.categoryId;
          await this.assertBrandAndCategory(tx, brandId, categoryId);
        }

        const before = this.businessDelta(target, data, 'before');
        const after = this.businessDelta(target, data, 'after');

        if (Object.keys(data).length === 0) {
          return tx.product.findUnique({
            where: { id: productId },
            select: detailSelect,
          });
        }

        const updated = await tx.product.updateMany({
          where: {
            id: productId,
            deletedAt: null,
            status: { not: ProductStatus.ARCHIVED },
          },
          data: {
            ...data,
            updatedBy: actorId,
          } as Prisma.ProductUncheckedUpdateManyInput,
        });
        if (updated.count === 0) {
          throw new ConflictException(
            'وضعیت محصول تغییر کرده است؛ مجدد تلاش کنید.',
          );
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'PRODUCT_UPDATED',
            entity: 'Product',
            entityId: productId,
            before,
            after,
            ipAddress,
          },
          tx,
        );

        return tx.product.findUnique({
          where: { id: productId },
          select: detailSelect,
        });
      });

      if (!product) {
        throw new NotFoundException('محصول یافت نشد.');
      }
      return this.toDetail(product);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک محصول با این slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async publish(
    productId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<ProductDetail> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.readLifecycleTarget(tx, productId);
      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('محصول یافت نشد.');
      }
      if (target.status !== ProductStatus.DRAFT) {
        throw new ConflictException(
          'تنها محصولات DRAFT قابل انتشار هستند؛ وضعیت محصول تغییر کرده است.',
        );
      }

      const variantCount = await tx.productVariant.count({
        where: { productId, deletedAt: null },
      });
      if (variantCount === 0) {
        throw new ConflictException(
          'پیش از انتشار باید حداقل یک واریانت برای محصول ثبت شود.',
        );
      }

      const updated = await tx.product.updateMany({
        where: { id: productId, status: ProductStatus.DRAFT, deletedAt: null },
        data: { status: ProductStatus.PUBLISHED, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'وضعیت محصول تغییر کرده است؛ مجدد تلاش کنید.',
        );
      }

      await this.auditService.log(
        {
          userId: actorId,
          action: 'PRODUCT_PUBLISHED',
          entity: 'Product',
          entityId: productId,
          before: { status: ProductStatus.DRAFT },
          after: { status: ProductStatus.PUBLISHED },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(productId);
  }

  async archive(
    productId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<ProductDetail> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.readLifecycleTarget(tx, productId);
      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('محصول یافت نشد.');
      }
      if (target.status !== ProductStatus.PUBLISHED) {
        throw new ConflictException(
          'تنها محصولات PUBLISHED قابل آرشیو شدن هستند؛ وضعیت محصول تغییر کرده است.',
        );
      }

      const updated = await tx.product.updateMany({
        where: {
          id: productId,
          status: ProductStatus.PUBLISHED,
          deletedAt: null,
        },
        data: { status: ProductStatus.ARCHIVED, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'وضعیت محصول تغییر کرده است؛ مجدد تلاش کنید.',
        );
      }

      await this.auditService.log(
        {
          userId: actorId,
          action: 'PRODUCT_ARCHIVED',
          entity: 'Product',
          entityId: productId,
          before: { status: ProductStatus.PUBLISHED },
          after: { status: ProductStatus.ARCHIVED },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(productId);
  }

  async softDelete(
    productId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<ProductDetail> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const target = await this.readLifecycleTarget(tx, productId);
      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('محصول یافت نشد.');
      }
      if (target.status !== ProductStatus.ARCHIVED) {
        throw new ConflictException(
          'تنها محصولات آرشیوشده قابل حذف هستند؛ ابتدا محصول را آرشیو کنید.',
        );
      }

      const updated = await tx.product.updateMany({
        where: {
          id: productId,
          status: ProductStatus.ARCHIVED,
          deletedAt: null,
        },
        data: { deletedAt: new Date(), updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new NotFoundException('محصول یافت نشد.');
      }

      const detailRow = await tx.product.findUnique({
        where: { id: productId },
        select: detailSelect,
      });

      await this.auditService.log(
        {
          userId: actorId,
          action: 'PRODUCT_DELETED',
          entity: 'Product',
          entityId: productId,
          before: { status: ProductStatus.ARCHIVED },
          after: { deletedAt: new Date().toISOString() },
          ipAddress,
        },
        tx,
      );

      return detailRow;
    });

    if (!deleted) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    return this.toDetail(deleted);
  }

  private toSummary(row: ListRow): ProductSummary {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      condition: row.condition,
      status: row.status,
      brand: row.brand,
      category: row.category,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: DetailRow): ProductDetail {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      brand: row.brand,
      category: row.category,
      warranty: row.warranty,
      condition: row.condition,
      status: row.status,
      weightKg: row.weightKg?.toString() ?? null,
      widthCm: row.widthCm?.toString() ?? null,
      heightCm: row.heightCm?.toString() ?? null,
      depthCm: row.depthCm?.toString() ?? null,
      originCountry: row.originCountry,
      variants: row.variants.map((variant) => ({
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        barcode: variant.barcode,
        name: variant.name,
        price: variant.price.toString(),
        stockQuantity: variant.stockQuantity,
      })),
      media: row.media.map((media) => ({
        id: media.id,
        productId: media.productId,
        variantId: media.variantId,
        mediaType: media.mediaType,
        originalName: media.originalName,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        sortOrder: media.sortOrder,
        isPrimary: media.isPrimary,
        createdAt: media.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async readLifecycleTarget(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<{ id: string; status: ProductStatus; deletedAt: Date | null } | null> {
    return tx.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, deletedAt: true },
    });
  }

  private async assertBrandAndCategory(
    tx: Prisma.TransactionClient,
    brandId: string,
    categoryId: string,
  ): Promise<void> {
    const [brand, category] = await Promise.all([
      tx.brand.findUnique({
        where: { id: brandId },
        select: { id: true, deletedAt: true },
      }),
      tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true, deletedAt: true },
      }),
    ]);

    if (!brand || brand.deletedAt !== null) {
      throw new NotFoundException('برند یافت نشد.');
    }
    if (!category || category.deletedAt !== null) {
      throw new NotFoundException('دسته بندی یافت نشد.');
    }
  }

  private buildUpdateData(dto: UpdateProductDto): ProductUpdateData {
    const data: ProductUpdateData = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.brandId !== undefined) data.brandId = dto.brandId;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.warranty !== undefined) data.warranty = dto.warranty;
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.weightKg !== undefined) data.weightKg = dto.weightKg;
    if (dto.widthCm !== undefined) data.widthCm = dto.widthCm;
    if (dto.heightCm !== undefined) data.heightCm = dto.heightCm;
    if (dto.depthCm !== undefined) data.depthCm = dto.depthCm;
    if (dto.originCountry !== undefined) data.originCountry = dto.originCountry;
    return data;
  }

  private businessDelta(
    target: UpdateTargetRow,
    data: ProductUpdateData,
    side: 'before' | 'after',
  ): Record<string, string | null> {
    const pick = (key: keyof UpdateTargetRow): string | null => {
      const value = target[key] as Prisma.Decimal | string | null | undefined;
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'string') {
        return value;
      }
      return (value as { toString(): string }).toString();
    };

    const delta: Record<string, string | null> = {};
    const changed = (key: keyof ProductUpdateData) => key in data;

    if (changed('name')) delta.name = side === 'before' ? target.name : (data.name as string);
    if (changed('slug')) delta.slug = side === 'before' ? target.slug : (data.slug as string);
    if (changed('shortDescription'))
      delta.shortDescription = side === 'before' ? target.shortDescription ?? null : (data.shortDescription as string | null);
    if (changed('description'))
      delta.description = side === 'before' ? target.description ?? null : (data.description as string | null);
    if (changed('brandId'))
      delta.brandId = side === 'before' ? target.brandId : (data.brandId as string);
    if (changed('categoryId'))
      delta.categoryId = side === 'before' ? target.categoryId : (data.categoryId as string);
    if (changed('warranty'))
      delta.warranty = side === 'before' ? target.warranty ?? null : (data.warranty as string | null);
    if (changed('condition'))
      delta.condition = side === 'before' ? target.condition : (data.condition as string);
    if (changed('weightKg'))
      delta.weightKg = side === 'before' ? pick('weightKg') : (data.weightKg as string | null);
    if (changed('widthCm'))
      delta.widthCm = side === 'before' ? pick('widthCm') : (data.widthCm as string | null);
    if (changed('heightCm'))
      delta.heightCm = side === 'before' ? pick('heightCm') : (data.heightCm as string | null);
    if (changed('depthCm'))
      delta.depthCm = side === 'before' ? pick('depthCm') : (data.depthCm as string | null);
    if (changed('originCountry'))
      delta.originCountry = side === 'before' ? target.originCountry ?? null : (data.originCountry as string | null);

    return delta;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      error.meta?.modelName === 'Product'
    );
  }
}

interface UpdateTargetRow {
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  brandId: string;
  categoryId: string;
  warranty: string | null;
  condition: string;
  weightKg: Prisma.Decimal | null;
  widthCm: Prisma.Decimal | null;
  heightCm: Prisma.Decimal | null;
  depthCm: Prisma.Decimal | null;
  originCountry: string | null;
}

interface ProductUpdateData {
  name?: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  brandId?: string;
  categoryId?: string;
  warranty?: string | null;
  condition?: string;
  weightKg?: string | null;
  widthCm?: string | null;
  heightCm?: string | null;
  depthCm?: string | null;
  originCountry?: string | null;
}
