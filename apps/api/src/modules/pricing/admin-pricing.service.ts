import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromotionType } from '@prisma/client';
import type {
  CategoryPriceRuleDto,
  CategoryPriceRuleListResponse,
  ProductPriceOverrideDto,
  ProductPriceOverrideListResponse,
  PromotionDto,
  PromotionListResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCategoryPriceRuleDto,
  CreateProductPriceOverrideDto,
  CreatePromotionDto,
  PricingListQueryDto,
  UpdateCategoryPriceRuleDto,
  UpdateProductPriceOverrideDto,
  UpdatePromotionDto,
} from './dto/admin-pricing.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

type RuleRow = Prisma.CategoryPriceRuleGetPayload<{
  include: { category: { select: { name: true } } };
}>;

type OverrideRow = Prisma.ProductPriceOverrideGetPayload<{
  include: { product: { select: { name: true } } };
}>;

type PromotionRow = Prisma.PromotionGetPayload<Record<string, never>>;

/**
 * Operator pricing management (SS-240B). CRUD for the three models that
 * feed `PricingService.resolveLine` — CategoryPriceRule, ProductPriceOverride
 * and Promotion — behind OPERATOR/ADMIN guards (see
 * `AdminPricingController`). The engine itself is untouched: this service
 * only validates admin input (FK existence, Decimal ranges, window order,
 * uniqueness) and writes one audit event per mutation.
 *
 * NOTE: bulk tiers stay hardcoded in `BULK_DISCOUNT_TIERS`
 * (`pricing.service.ts`) — no admin surface for them in this ticket.
 */
@Injectable()
export class AdminPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Category rules
  // -------------------------------------------------------------------------

  async listRules(query: PricingListQueryDto): Promise<CategoryPriceRuleListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.CategoryPriceRuleWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.categoryPriceRule.count({ where }),
      this.prisma.categoryPriceRule.findMany({
        where,
        include: { category: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((row) => this.toRuleDto(row)),
      total,
      page,
      limit,
    };
  }

  async getRule(id: string): Promise<CategoryPriceRuleDto> {
    const row = await this.prisma.categoryPriceRule.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    });
    if (!row) {
      throw new NotFoundException('قانون قیمت‌گذاری یافت نشد.');
    }
    return this.toRuleDto(row);
  }

  async createRule(
    operatorId: string,
    dto: CreateCategoryPriceRuleDto,
    ipAddress?: string,
  ): Promise<CategoryPriceRuleDto> {
    await this.requireLiveCategory(dto.categoryId);
    this.assertValidValue(dto.type, dto.value);
    const { startsAt, endsAt } = this.parseWindow(dto.startsAt, dto.endsAt);
    this.assertValidWindow(startsAt, endsAt);
    const row = await this.prisma.categoryPriceRule.create({
      data: {
        categoryId: dto.categoryId,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        isActive: dto.isActive ?? true,
        startsAt,
        endsAt,
        priority: dto.priority ?? 0,
        createdBy: operatorId,
      },
      include: { category: { select: { name: true } } },
    });
    const created = this.toRuleDto(row);
    await this.audit.log({
      userId: operatorId,
      action: 'CATEGORY_PRICE_RULE_CREATED',
      entity: 'CategoryPriceRule',
      entityId: row.id,
      before: null,
      after: created as unknown as Prisma.InputJsonValue,
      ipAddress,
    });
    return created;
  }

  async updateRule(
    operatorId: string,
    id: string,
    dto: UpdateCategoryPriceRuleDto,
    ipAddress?: string,
  ): Promise<CategoryPriceRuleDto> {
    const existing = await this.prisma.categoryPriceRule.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('قانون قیمت‌گذاری یافت نشد.');
    }
    const before = this.toRuleDto(existing);
    if (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId) {
      await this.requireLiveCategory(dto.categoryId);
    }
    const type = dto.type ?? existing.type;
    const value = dto.value ?? existing.value.toString();
    this.assertValidValue(type, value);
    const { startsAt, endsAt } = this.parseNullableWindow(
      dto.startsAt,
      dto.endsAt,
      existing.startsAt,
      existing.endsAt,
      'startsAt' in dto,
      'endsAt' in dto,
    );
    this.assertValidWindow(startsAt, endsAt);
    const row = await this.prisma.categoryPriceRule.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...('startsAt' in dto ? { startsAt } : {}),
        ...('endsAt' in dto ? { endsAt } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        updatedBy: operatorId,
      },
      include: { category: { select: { name: true } } },
    });
    const after = this.toRuleDto(row);
    await this.audit.log({
      userId: operatorId,
      action: 'CATEGORY_PRICE_RULE_UPDATED',
      entity: 'CategoryPriceRule',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
      ipAddress,
    });
    return after;
  }

  async deleteRule(
    operatorId: string,
    id: string,
    ipAddress?: string,
  ): Promise<CategoryPriceRuleDto> {
    const existing = await this.prisma.categoryPriceRule.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('قانون قیمت‌گذاری یافت نشد.');
    }
    const before = this.toRuleDto(existing);
    await this.prisma.categoryPriceRule.delete({ where: { id } });
    await this.audit.log({
      userId: operatorId,
      action: 'CATEGORY_PRICE_RULE_DELETED',
      entity: 'CategoryPriceRule',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: null,
      ipAddress,
    });
    return before;
  }

  // -------------------------------------------------------------------------
  // Product overrides
  // -------------------------------------------------------------------------

  async listOverrides(
    query: PricingListQueryDto,
  ): Promise<ProductPriceOverrideListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ProductPriceOverrideWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productPriceOverride.count({ where }),
      this.prisma.productPriceOverride.findMany({
        where,
        include: { product: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((row) => this.toOverrideDto(row)),
      total,
      page,
      limit,
    };
  }

  async getOverride(id: string): Promise<ProductPriceOverrideDto> {
    const row = await this.prisma.productPriceOverride.findUnique({
      where: { id },
      include: { product: { select: { name: true } } },
    });
    if (!row) {
      throw new NotFoundException('اورراید قیمت یافت نشد.');
    }
    return this.toOverrideDto(row);
  }

  async createOverride(
    operatorId: string,
    dto: CreateProductPriceOverrideDto,
    ipAddress?: string,
  ): Promise<ProductPriceOverrideDto> {
    await this.requireLiveProduct(dto.productId);
    const duplicate = await this.prisma.productPriceOverride.findUnique({
      where: { productId: dto.productId },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('برای این محصول قبلاً اورراید قیمت ثبت شده است.');
    }
    this.assertValidValue(dto.type, dto.value);
    const { startsAt, endsAt } = this.parseWindow(dto.startsAt, dto.endsAt);
    this.assertValidWindow(startsAt, endsAt);
    let row: OverrideRow;
    try {
      row = await this.prisma.productPriceOverride.create({
        data: {
          productId: dto.productId,
          type: dto.type,
          value: new Prisma.Decimal(dto.value),
          isActive: dto.isActive ?? true,
          startsAt,
          endsAt,
          createdBy: operatorId,
        },
        include: { product: { select: { name: true } } },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('برای این محصول قبلاً اورراید قیمت ثبت شده است.');
      }
      throw error;
    }
    const created = this.toOverrideDto(row);
    await this.audit.log({
      userId: operatorId,
      action: 'PRODUCT_PRICE_OVERRIDE_CREATED',
      entity: 'ProductPriceOverride',
      entityId: row.id,
      before: null,
      after: created as unknown as Prisma.InputJsonValue,
      ipAddress,
    });
    return created;
  }

  async updateOverride(
    operatorId: string,
    id: string,
    dto: UpdateProductPriceOverrideDto,
    ipAddress?: string,
  ): Promise<ProductPriceOverrideDto> {
    const existing = await this.prisma.productPriceOverride.findUnique({
      where: { id },
      include: { product: { select: { name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('اورراید قیمت یافت نشد.');
    }
    const before = this.toOverrideDto(existing);
    const type = dto.type ?? existing.type;
    const value = dto.value ?? existing.value.toString();
    this.assertValidValue(type, value);
    const { startsAt, endsAt } = this.parseNullableWindow(
      dto.startsAt,
      dto.endsAt,
      existing.startsAt,
      existing.endsAt,
      'startsAt' in dto,
      'endsAt' in dto,
    );
    this.assertValidWindow(startsAt, endsAt);
    const row = await this.prisma.productPriceOverride.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...('startsAt' in dto ? { startsAt } : {}),
        ...('endsAt' in dto ? { endsAt } : {}),
        updatedBy: operatorId,
      },
      include: { product: { select: { name: true } } },
    });
    const after = this.toOverrideDto(row);
    await this.audit.log({
      userId: operatorId,
      action: 'PRODUCT_PRICE_OVERRIDE_UPDATED',
      entity: 'ProductPriceOverride',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
      ipAddress,
    });
    return after;
  }

  async deleteOverride(
    operatorId: string,
    id: string,
    ipAddress?: string,
  ): Promise<ProductPriceOverrideDto> {
    const existing = await this.prisma.productPriceOverride.findUnique({
      where: { id },
      include: { product: { select: { name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('اورراید قیمت یافت نشد.');
    }
    const before = this.toOverrideDto(existing);
    await this.prisma.productPriceOverride.delete({ where: { id } });
    await this.audit.log({
      userId: operatorId,
      action: 'PRODUCT_PRICE_OVERRIDE_DELETED',
      entity: 'ProductPriceOverride',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: null,
      ipAddress,
    });
    return before;
  }

  // -------------------------------------------------------------------------
  // Promotions
  // -------------------------------------------------------------------------

  async listPromotions(query: PricingListQueryDto): Promise<PromotionListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.PromotionWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.promotion.count({ where }),
      this.prisma.promotion.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((row) => this.toPromotionDto(row)),
      total,
      page,
      limit,
    };
  }

  async getPromotion(id: string): Promise<PromotionDto> {
    const row = await this.prisma.promotion.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('پروموشن یافت نشد.');
    }
    return this.toPromotionDto(row);
  }

  async createPromotion(
    operatorId: string,
    dto: CreatePromotionDto,
    ipAddress?: string,
  ): Promise<PromotionDto> {
    const code = dto.code.trim();
    const duplicate = await this.prisma.promotion.findUnique({
      where: { code },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('این کد پروموشن قبلاً ثبت شده است.');
    }
    this.assertValidValue(dto.type, dto.value);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertValidWindow(startsAt, endsAt);
    let row: PromotionRow;
    try {
      row = await this.prisma.promotion.create({
        data: {
          code,
          titleFa: dto.titleFa.trim(),
          type: dto.type,
          value: new Prisma.Decimal(dto.value),
          startsAt,
          endsAt,
          isActive: dto.isActive ?? true,
          productId: dto.productId ?? null,
          categoryId: dto.categoryId ?? null,
          brandId: dto.brandId ?? null,
          minQuantity: dto.minQuantity ?? 1,
          createdBy: operatorId,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('این کد پروموشن قبلاً ثبت شده است.');
      }
      throw error;
    }
    const created = this.toPromotionDto(row);
    await this.audit.log({
      userId: operatorId,
      action: 'PROMOTION_CREATED',
      entity: 'Promotion',
      entityId: row.id,
      before: null,
      after: created as unknown as Prisma.InputJsonValue,
      ipAddress,
    });
    return created;
  }

  async updatePromotion(
    operatorId: string,
    id: string,
    dto: UpdatePromotionDto,
    ipAddress?: string,
  ): Promise<PromotionDto> {
    const existing = await this.prisma.promotion.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('پروموشن یافت نشد.');
    }
    const before = this.toPromotionDto(existing);
    const code = dto.code !== undefined ? dto.code.trim() : existing.code;
    if (dto.code !== undefined && code !== existing.code) {
      const duplicate = await this.prisma.promotion.findUnique({
        where: { code },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('این کد پروموشن قبلاً ثبت شده است.');
      }
    }
    const type = dto.type ?? existing.type;
    const value = dto.value ?? existing.value.toString();
    this.assertValidValue(type, value);
    const startsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt !== undefined ? new Date(dto.endsAt) : existing.endsAt;
    this.assertValidWindow(startsAt, endsAt);
    let row: PromotionRow;
    try {
      row = await this.prisma.promotion.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code } : {}),
          ...(dto.titleFa !== undefined ? { titleFa: dto.titleFa.trim() } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
          ...(dto.startsAt !== undefined ? { startsAt } : {}),
          ...(dto.endsAt !== undefined ? { endsAt } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...('productId' in dto ? { productId: dto.productId ?? null } : {}),
          ...('categoryId' in dto ? { categoryId: dto.categoryId ?? null } : {}),
          ...('brandId' in dto ? { brandId: dto.brandId ?? null } : {}),
          ...(dto.minQuantity !== undefined ? { minQuantity: dto.minQuantity } : {}),
          updatedBy: operatorId,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('این کد پروموشن قبلاً ثبت شده است.');
      }
      throw error;
    }
    const after = this.toPromotionDto(row);
    await this.audit.log({
      userId: operatorId,
      action: 'PROMOTION_UPDATED',
      entity: 'Promotion',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
      ipAddress,
    });
    return after;
  }

  async deletePromotion(
    operatorId: string,
    id: string,
    ipAddress?: string,
  ): Promise<PromotionDto> {
    const existing = await this.prisma.promotion.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('پروموشن یافت نشد.');
    }
    const before = this.toPromotionDto(existing);
    await this.prisma.promotion.delete({ where: { id } });
    await this.audit.log({
      userId: operatorId,
      action: 'PROMOTION_DELETED',
      entity: 'Promotion',
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: null,
      ipAddress,
    });
    return before;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireLiveCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد.');
    }
  }

  private async requireLiveProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('محصول یافت نشد.');
    }
  }

  /**
   * Decimal range gate shared by all three resources (mirrors the engine's
   * `isValidAdjustment`: PERCENT is 0–100, FIXED is any positive Rial
   * amount). Invalid input 400s here instead of being silently ignored.
   */
  private assertValidValue(type: PromotionType, value: string): void {
    let parsed: Prisma.Decimal;
    try {
      parsed = new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException('مبلغ تخفیف معتبر نیست.');
    }
    if (!parsed.isFinite() || parsed.lessThanOrEqualTo(0)) {
      throw new BadRequestException('مبلغ تخفیف باید بزرگ‌تر از صفر باشد.');
    }
    if (type === PromotionType.PERCENT && parsed.greaterThan(100)) {
      throw new BadRequestException('درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.');
    }
  }

  private parseWindow(
    startsAt: string | undefined,
    endsAt: string | undefined,
  ): { startsAt: Date | null; endsAt: Date | null } {
    return {
      startsAt: startsAt !== undefined ? new Date(startsAt) : null,
      endsAt: endsAt !== undefined ? new Date(endsAt) : null,
    };
  }

  /**
   * Update-window merge: an explicitly-passed key (even null) overwrites the
   * stored bound; an absent key keeps it. `in` checks distinguish
   * "clear the bound" (null) from "leave it" (absent).
   */
  private parseNullableWindow(
    startsAt: string | null | undefined,
    endsAt: string | null | undefined,
    storedStartsAt: Date | null,
    storedEndsAt: Date | null,
    hasStartsAt: boolean,
    hasEndsAt: boolean,
  ): { startsAt: Date | null; endsAt: Date | null } {
    return {
      startsAt: hasStartsAt
        ? startsAt === null || startsAt === undefined
          ? null
          : new Date(startsAt)
        : storedStartsAt,
      endsAt: hasEndsAt
        ? endsAt === null || endsAt === undefined
          ? null
          : new Date(endsAt)
        : storedEndsAt,
    };
  }

  private assertValidWindow(startsAt: Date | null, endsAt: Date | null): void {
    if (startsAt !== null && endsAt !== null && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد.');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  private toRuleDto(row: RuleRow): CategoryPriceRuleDto {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      type: row.type as CategoryPriceRuleDto['type'],
      value: row.value.toString(),
      isActive: row.isActive,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      priority: row.priority,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toOverrideDto(row: OverrideRow): ProductPriceOverrideDto {
    return {
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      type: row.type as ProductPriceOverrideDto['type'],
      value: row.value.toString(),
      isActive: row.isActive,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPromotionDto(row: PromotionRow): PromotionDto {
    return {
      id: row.id,
      code: row.code,
      titleFa: row.titleFa,
      type: row.type as PromotionDto['type'],
      value: row.value.toString(),
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      isActive: row.isActive,
      productId: row.productId,
      categoryId: row.categoryId,
      brandId: row.brandId,
      minQuantity: row.minQuantity,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
