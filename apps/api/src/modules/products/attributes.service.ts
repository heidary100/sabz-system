import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttributeType, Prisma, ProductStatus } from '@prisma/client';
import type {
  AttributeDto,
  AttributeValueDto,
  ProductSpecDto,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { SLUG_PATTERN } from './dto/create-product.dto';

/**
 * Attribute/spec domain service (SS-202, ADR-005).
 *
 * Service-only layer (no HTTP routes in v1; admin attribute UI is deferred).
 * The future importer (SS-206/207) is the primary caller: it upserts
 * definitions idempotently and assigns specs/options inside its own
 * per-product transactions via Prisma — this service covers standalone and
 * admin-driven writes with the same invariants.
 *
 * Deliberately no AuditLog writes here: importer volume would spam the log;
 * per-row provenance lives in ImportRecord (ADR-004).
 */

/** Importer parser provenance for ProductAttributeValue.source (open vocabulary). */
export const ATTRIBUTE_SOURCE_WOO_ATTR = 'WOO_ATTR';
export const ATTRIBUTE_SOURCE_WOO_CUSTOM = 'WOO_CUSTOM';

const NAME_MAX = 120;
const VALUE_MAX = 255;
const SLUG_MAX = 120;
const GROUP_MAX = 120;
const SOURCE_MAX = 64;

export interface AttributeInput {
  name: string;
  slug: string;
  type: AttributeType;
  group?: string;
  isFilterable?: boolean;
  isGlobal?: boolean;
}

export interface AttributeValueInput {
  value: string;
  slug: string;
}

export interface SpecAssignmentInput {
  attributeName: string;
  attributeSlug: string;
  group?: string;
  isGlobal?: boolean;
  value: string;
  valueSlug: string;
  sortOrder?: number;
  source: string;
}

export interface VariantOptionInput {
  attributeName: string;
  attributeSlug: string;
  value: string;
  valueSlug: string;
}

const attributeSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  group: true,
  isFilterable: true,
  isGlobal: true,
} satisfies Prisma.AttributeSelect;

const attributeValueSelect = {
  id: true,
  attributeId: true,
  value: true,
  slug: true,
} satisfies Prisma.AttributeValueSelect;

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent definition upsert by name (importer hot path). An existing
   * attribute is returned untouched except for explicit flag updates; a type
   * mismatch is a conflict (variant axes and display specs never share a
   * definition — the importer dry-run surfaces these).
   */
  async upsertAttribute(input: AttributeInput): Promise<AttributeDto> {
    const name = requireText(input.name, NAME_MAX, 'نام ویژگی الزامی است.');
    const slug = requireSlug(input.slug);
    const group =
      input.group === undefined
        ? undefined
        : requireText(input.group, GROUP_MAX, 'نام گروه معتبر نیست.');

    const existing = await this.prisma.attribute.findUnique({
      where: { name },
      select: attributeSelect,
    });
    if (existing) {
      if (existing.type !== input.type) {
        throw new ConflictException(
          `ویژگی «${name}» از نوع دیگری ثبت شده و قابل استفاده مجدد نیست.`,
        );
      }
      return this.prisma.attribute.update({
        where: { id: existing.id },
        data: {
          ...(group !== undefined ? { group } : {}),
          ...(input.isFilterable !== undefined
            ? { isFilterable: input.isFilterable }
            : {}),
          ...(input.isGlobal !== undefined ? { isGlobal: input.isGlobal } : {}),
        },
        select: attributeSelect,
      });
    }

    try {
      return await this.prisma.attribute.create({
        data: {
          name,
          slug,
          type: input.type,
          group: group ?? null,
          isFilterable: input.isFilterable ?? false,
          isGlobal: input.isGlobal ?? false,
        },
        select: attributeSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'Attribute')) {
        throw new ConflictException('ویژگی با این نام یا slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /** Idempotent value upsert within one attribute. */
  async upsertAttributeValue(
    attributeId: string,
    input: AttributeValueInput,
  ): Promise<AttributeValueDto> {
    const value = requireText(input.value, VALUE_MAX, 'مقدار ویژگی الزامی است.');
    const slug = requireSlug(input.slug);

    const existing = await this.prisma.attributeValue.findUnique({
      where: { attributeId_value: { attributeId, value } },
      select: attributeValueSelect,
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.attributeValue.create({
        data: { attributeId, value, slug },
        select: attributeValueSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'AttributeValue')) {
        throw new ConflictException('این مقدار برای ویژگی تکراری است.');
      }
      throw error;
    }
  }

  /**
   * Assign a display spec to a product. Re-assigning the same value is a
   * 409 (importer treats it as skip); use unassignSpec first to move a value.
   */
  async assignSpec(productId: string, input: SpecAssignmentInput) {
    await this.assertProductForMutation(productId);
    const source = requireText(input.source, SOURCE_MAX, 'منبع مشخصه الزامی است.');

    const attribute = await this.upsertAttribute({
      name: input.attributeName,
      slug: input.attributeSlug,
      type: AttributeType.SPEC,
      group: input.group,
      isGlobal: input.isGlobal,
    });
    const attributeValue = await this.upsertAttributeValue(attribute.id, {
      value: input.value,
      slug: input.valueSlug,
    });

    try {
      return await this.prisma.productAttributeValue.create({
        data: {
          productId,
          attributeValueId: attributeValue.id,
          sortOrder: input.sortOrder ?? 0,
          source,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'ProductAttributeValue')) {
        throw new ConflictException('این مشخصه قبلاً برای محصول ثبت شده است.');
      }
      throw error;
    }
  }

  async unassignSpec(productId: string, attributeValueId: string): Promise<void> {
    await this.prisma.productAttributeValue.deleteMany({
      where: { productId, attributeValueId },
    });
  }

  /** Ordered specs of a product with their attribute/value display data. */
  async listProductSpecs(productId: string): Promise<ProductSpecDto[]> {
    return this.prisma.productAttributeValue.findMany({
      where: { productId },
      select: {
        id: true,
        sortOrder: true,
        source: true,
        attributeValue: {
          select: {
            id: true,
            attributeId: true,
            value: true,
            slug: true,
            attribute: {
              select: {
                id: true,
                name: true,
                slug: true,
                group: true,
                isFilterable: true,
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Set semantics for the variant axis: assigning an option removes the
   * variant's other values of the same attribute, so a variant always holds
   * at most one value per VARIANT_OPTION attribute. Idempotent re-set of the
   * same value is a no-op returning the existing row.
   */
  async setVariantOption(variantId: string, input: VariantOptionInput) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        deletedAt: true,
        product: { select: { deletedAt: true, status: true } },
      },
    });
    if (!variant || variant.deletedAt !== null || variant.product.deletedAt !== null) {
      throw new NotFoundException('واریانت یافت نشد.');
    }
    if (variant.product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }

    const attribute = await this.upsertAttribute({
      name: input.attributeName,
      slug: input.attributeSlug,
      type: AttributeType.VARIANT_OPTION,
    });
    const attributeValue = await this.upsertAttributeValue(attribute.id, {
      value: input.value,
      slug: input.valueSlug,
    });

    const siblings = await this.prisma.variantAttributeValue.findMany({
      where: {
        variantId,
        attributeValue: { attributeId: attribute.id },
      },
      select: { id: true, attributeValueId: true },
    });
    if (
      siblings.length === 1 &&
      siblings[0]!.attributeValueId === attributeValue.id
    ) {
      return siblings[0]!;
    }
    if (siblings.length > 0) {
      await this.prisma.variantAttributeValue.deleteMany({
        where: { id: { in: siblings.map((row) => row.id) } },
      });
    }
    return this.prisma.variantAttributeValue.create({
      data: { variantId, attributeValueId: attributeValue.id },
    });
  }

  async clearVariantOption(variantId: string, attributeId: string): Promise<void> {
    await this.prisma.variantAttributeValue.deleteMany({
      where: { variantId, attributeValue: { attributeId } },
    });
  }

  /** Hard delete, guarded: attributes with values cannot be deleted. */
  async deleteAttribute(id: string): Promise<void> {
    const values = await this.prisma.attributeValue.count({
      where: { attributeId: id },
    });
    if (values > 0) {
      throw new ConflictException(
        'این ویژگی مقدار دارد و قابل حذف نیست؛ ابتدا مقدارها را حذف کنید.',
      );
    }
    const deleted = await this.prisma.attribute.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new NotFoundException('ویژگی یافت نشد.');
    }
  }

  /** Hard delete, guarded: values referenced by specs/options cannot be deleted. */
  async deleteAttributeValue(id: string): Promise<void> {
    const [specs, options] = await this.prisma.$transaction([
      this.prisma.productAttributeValue.count({ where: { attributeValueId: id } }),
      this.prisma.variantAttributeValue.count({ where: { attributeValueId: id } }),
    ]);
    if (specs + options > 0) {
      throw new ConflictException(
        'این مقدار در مشخصه‌ها استفاده شده و قابل حذف نیست.',
      );
    }
    const deleted = await this.prisma.attributeValue.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new NotFoundException('مقدار ویژگی یافت نشد.');
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

function requireText(value: unknown, max: number, message: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(message);
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > max) {
    throw new BadRequestException(message);
  }
  return trimmed;
}

function requireSlug(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('slug ویژگی الزامی است.');
  }
  const slug = value.trim().toLowerCase();
  if (slug.length === 0 || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'slug ویژگی باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.',
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
