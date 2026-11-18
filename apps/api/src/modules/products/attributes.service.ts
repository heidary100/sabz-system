import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttributeType,
  AttributeValueType,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import type {
  AttributeDto,
  AttributeValueDto,
  AttributeWithValuesDto,
  BulkAttributeApplyInput,
  BulkAttributeApplyResponse,
  BulkAttributeChange,
  BulkAttributeOperation,
  BulkAttributePreviewInput,
  BulkAttributePreviewResponse,
  BulkAttributeProductOutcome,
  CategoryAttributeDto,
  CategoryAttributeInput,
  CategoryAttributesResponse,
  ProductAttributeValueDto,
  ProductAttributeValueInput,
  ProductAttributesResponse,
  ProductSpecDto,
  SetProductAttributesInput,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { SLUG_PATTERN } from './dto/create-product.dto';

/**
 * Attribute/spec domain service (SS-202/ADR-005, extended SS-900).
 *
 * Definitions are reusable; category assignments decide applicability with
 * parent inheritance; product values are typed. Legacy importer rows keep
 * working: every existing ProductAttributeValue has an attributeId backfilled
 * from its option, and importer assignment paths still upsert definitions and
 * option values idempotently.
 *
 * Deliberately no AuditLog per-row writes for importer volume; admin writes
 * are audited by their controllers where meaningful (bulk outcomes are
 * returned to the operator and the product rows carry updatedBy).
 */

export const ATTRIBUTE_SOURCE_WOO_ATTR = 'WOO_ATTR';
export const ATTRIBUTE_SOURCE_WOO_CUSTOM = 'WOO_CUSTOM';
export const ATTRIBUTE_SOURCE_ADMIN = 'ADMIN';
export const ATTRIBUTE_SOURCE_BULK = 'BULK';

const NAME_MAX = 120;
const VALUE_MAX = 255;
const SLUG_MAX = 120;
const GROUP_MAX = 120;
const UNIT_MAX = 40;
const DESCRIPTION_MAX = 500;
const SOURCE_MAX = 64;
const MAX_BULK_PRODUCTS = 500;
const MAX_BULK_OPERATIONS = 20;
const CATEGORY_DEPTH_LIMIT = 32;

export interface AttributeInput {
  name: string;
  slug: string;
  type: AttributeType;
  group?: string;
  isFilterable?: boolean;
  isGlobal?: boolean;
  valueType?: AttributeValueType;
  unit?: string;
  description?: string;
  isComparable?: boolean;
}

export interface AttributeValueInput {
  value: string;
  slug: string;
  normalizedValue?: string;
  numericValue?: string;
  sortOrder?: number;
  isActive?: boolean;
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
  valueType: true,
  unit: true,
  description: true,
  isComparable: true,
} satisfies Prisma.AttributeSelect;

const attributeValueSelect = {
  id: true,
  attributeId: true,
  value: true,
  slug: true,
  normalizedValue: true,
  numericValue: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.AttributeValueSelect;

const attributeWithValuesSelect = {
  ...attributeSelect,
  values: {
    select: attributeValueSelect,
    orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
  },
} satisfies Prisma.AttributeSelect;

type AttributeRow = Prisma.AttributeGetPayload<{ select: typeof attributeSelect }>;
type AttributeWithValuesRow = Prisma.AttributeGetPayload<{
  select: typeof attributeWithValuesSelect;
}>;
type AttributeValueRow = Prisma.AttributeValueGetPayload<{
  select: typeof attributeValueSelect;
}>;

const productValueSelect = {
  id: true,
  productId: true,
  attributeId: true,
  sortOrder: true,
  source: true,
  valueText: true,
  valueNumber: true,
  valueBoolean: true,
  updatedBy: true,
  attribute: { select: attributeSelect },
  attributeValue: { select: attributeValueSelect },
} satisfies Prisma.ProductAttributeValueSelect;

type ProductValueRow = Prisma.ProductAttributeValueGetPayload<{
  select: typeof productValueSelect;
}>;

interface ResolvedAssignment {
  attribute: AttributeWithValuesRow;
  sortOrder: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  inheritedFromCategoryId: string | null;
  inheritedFromCategoryName: string | null;
}

interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface NormalizedValue {
  attribute: AttributeWithValuesDto;
  optionIds: string[];
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBoolean: boolean | null;
}

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Definitions
  // ---------------------------------------------------------------------

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
      const updated = await this.prisma.attribute.update({
        where: { id: existing.id },
        data: {
          ...(group !== undefined ? { group } : {}),
          ...(input.isFilterable !== undefined
            ? { isFilterable: input.isFilterable }
            : {}),
          ...(input.isGlobal !== undefined ? { isGlobal: input.isGlobal } : {}),
          ...(input.valueType !== undefined
            ? { valueType: input.valueType }
            : {}),
          ...(input.unit !== undefined
            ? { unit: optionalText(input.unit, UNIT_MAX, 'واحد معتبر نیست.') }
            : {}),
          ...(input.description !== undefined
            ? {
                description: optionalText(
                  input.description,
                  DESCRIPTION_MAX,
                  'توضیح ویژگی معتبر نیست.',
                ),
              }
            : {}),
          ...(input.isComparable !== undefined
            ? { isComparable: input.isComparable }
            : {}),
        },
        select: attributeSelect,
      });
      return toAttributeDto(updated);
    }

    try {
      const created = await this.prisma.attribute.create({
        data: {
          name,
          slug,
          type: input.type,
          group: group ?? null,
          isFilterable: input.isFilterable ?? false,
          isGlobal: input.isGlobal ?? false,
          // Importer definitions carry option rows (assignSpec/option paths),
          // so SELECT is the faithful default for new reference data.
          valueType: input.valueType ?? AttributeValueType.SELECT,
          unit:
            input.unit !== undefined
              ? optionalText(input.unit, UNIT_MAX, 'واحد معتبر نیست.')
              : null,
          description:
            input.description !== undefined
              ? optionalText(
                  input.description,
                  DESCRIPTION_MAX,
                  'توضیح ویژگی معتبر نیست.',
                )
              : null,
          isComparable: input.isComparable ?? input.type === AttributeType.SPEC,
        },
        select: attributeSelect,
      });
      return toAttributeDto(created);
    } catch (error) {
      if (isUniqueViolation(error, 'Attribute')) {
        throw new ConflictException('ویژگی با این نام یا slug قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async listAttributes(): Promise<AttributeWithValuesDto[]> {
    const rows = await this.prisma.attribute.findMany({
      select: attributeWithValuesSelect,
      orderBy: [{ type: 'asc' }, { group: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toAttributeWithValuesDto);
  }

  async createAttribute(input: AttributeInput): Promise<AttributeWithValuesDto> {
    const dto = await this.upsertAttribute(input);
    const row = await this.prisma.attribute.findUniqueOrThrow({
      where: { id: dto.id },
      select: attributeWithValuesSelect,
    });
    return toAttributeWithValuesDto(row);
  }

  async updateAttribute(
    id: string,
    input: Partial<AttributeInput>,
  ): Promise<AttributeWithValuesDto> {
    const existing = await this.prisma.attribute.findUnique({
      where: { id },
      select: attributeWithValuesSelect,
    });
    if (!existing) {
      throw new NotFoundException('ویژگی یافت نشد.');
    }
    const nextType = input.type ?? existing.type;
    const nextValueType = input.valueType ?? existing.valueType;
    if (
      (input.type !== undefined && input.type !== existing.type) ||
      (input.valueType !== undefined && input.valueType !== existing.valueType)
    ) {
      await this.assertAttributeShapeChangeSafe(existing, nextType, nextValueType);
    }
    const data: Prisma.AttributeUpdateInput = {};
    if (input.name !== undefined) {
      data.name = requireText(input.name, NAME_MAX, 'نام ویژگی الزامی است.');
    }
    if (input.slug !== undefined) {
      data.slug = requireSlug(input.slug);
    }
    if (input.type !== undefined) {
      data.type = input.type;
    }
    if (input.valueType !== undefined) {
      data.valueType = input.valueType;
    }
    if (input.group !== undefined) {
      data.group = optionalText(input.group, GROUP_MAX, 'نام گروه معتبر نیست.');
    }
    if (input.unit !== undefined) {
      data.unit = optionalText(input.unit, UNIT_MAX, 'واحد معتبر نیست.');
    }
    if (input.description !== undefined) {
      data.description = optionalText(
        input.description,
        DESCRIPTION_MAX,
        'توضیح ویژگی معتبر نیست.',
      );
    }
    if (input.isFilterable !== undefined) {
      data.isFilterable = input.isFilterable;
    }
    if (input.isGlobal !== undefined) {
      data.isGlobal = input.isGlobal;
    }
    if (input.isComparable !== undefined) {
      data.isComparable = input.isComparable;
    }
    try {
      const row = await this.prisma.attribute.update({
        where: { id },
        data,
        select: attributeWithValuesSelect,
      });
      return toAttributeWithValuesDto(row);
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
      return toAttributeValueDto(existing);
    }
    try {
      const row = await this.prisma.attributeValue.create({
        data: {
          attributeId,
          value,
          slug,
          normalizedValue: input.normalizedValue ?? null,
          numericValue:
            input.numericValue !== undefined
              ? parseDecimal(input.numericValue, 'مقدار عددی معتبر نیست.')
              : null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
        select: attributeValueSelect,
      });
      return toAttributeValueDto(row);
    } catch (error) {
      if (isUniqueViolation(error, 'AttributeValue')) {
        throw new ConflictException('این مقدار برای ویژگی تکراری است.');
      }
      throw error;
    }
  }

  async createAttributeValue(
    attributeId: string,
    input: AttributeValueInput,
  ): Promise<AttributeValueDto> {
    const attribute = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
      select: attributeSelect,
    });
    if (!attribute) {
      throw new NotFoundException('ویژگی یافت نشد.');
    }
    if (
      attribute.valueType !== AttributeValueType.SELECT &&
      attribute.valueType !== AttributeValueType.MULTI_SELECT
    ) {
      throw new BadRequestException(
        'برای این نوع ویژگی مقدار انتخابی تعریف نمی‌شود.',
      );
    }
    return this.upsertAttributeValue(attributeId, input);
  }

  async updateAttributeValue(
    id: string,
    input: Partial<AttributeValueInput>,
  ): Promise<AttributeValueDto> {
    const existing = await this.prisma.attributeValue.findUnique({
      where: { id },
      select: attributeValueSelect,
    });
    if (!existing) {
      throw new NotFoundException('مقدار ویژگی یافت نشد.');
    }
    const data: Prisma.AttributeValueUpdateInput = {};
    if (input.value !== undefined) {
      data.value = requireText(input.value, VALUE_MAX, 'مقدار ویژگی الزامی است.');
    }
    if (input.slug !== undefined) {
      data.slug = requireSlug(input.slug);
    }
    if (input.normalizedValue !== undefined) {
      data.normalizedValue = input.normalizedValue.trim() || null;
    }
    if (input.numericValue !== undefined) {
      data.numericValue =
        input.numericValue === null || input.numericValue === ''
          ? null
          : parseDecimal(input.numericValue, 'مقدار عددی معتبر نیست.');
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = Math.max(0, Math.trunc(input.sortOrder));
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }
    try {
      const row = await this.prisma.attributeValue.update({
        where: { id },
        data,
        select: attributeValueSelect,
      });
      return toAttributeValueDto(row);
    } catch (error) {
      if (isUniqueViolation(error, 'AttributeValue')) {
        throw new ConflictException('این مقدار برای ویژگی تکراری است.');
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Category assignments (inheritance)
  // ---------------------------------------------------------------------

  async listCategoryAttributes(categoryId: string): Promise<CategoryAttributesResponse> {
    const chain = await this.categoryChain(categoryId);
    const resolved = await this.resolveAssignmentsForChain(chain);
    const available = await this.prisma.attribute.findMany({
      where: { type: AttributeType.SPEC },
      select: attributeWithValuesSelect,
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
    return {
      categoryId,
      items: resolved.map((row) => toCategoryAttributeDto(row)),
      availableAttributes: available.map(toAttributeWithValuesDto),
    };
  }

  /**
   * Replaces the explicit assignments on this category. Assignments inherited
   * from ancestors are untouched; an explicit row on this category overrides
   * the inherited configuration for the same definition.
   */
  async setCategoryAttributes(
    categoryId: string,
    inputs: CategoryAttributeInput[],
    userId: string,
  ): Promise<CategoryAttributesResponse> {
    await this.categoryChain(categoryId);
    const deduped = new Map<string, CategoryAttributeInput>();
    for (const input of inputs) {
      if (deduped.has(input.attributeId)) {
        throw new BadRequestException('ویژگی تکراری در فهرست وجود دارد.');
      }
      deduped.set(input.attributeId, input);
    }
    if (deduped.size > 0) {
      const attributes = await this.prisma.attribute.findMany({
        where: { id: { in: [...deduped.keys()] } },
        select: attributeSelect,
      });
      if (attributes.length !== deduped.size) {
        throw new BadRequestException('یکی از ویژگی‌های انتخاب‌شده یافت نشد.');
      }
      for (const attribute of attributes) {
        if (attribute.type !== AttributeType.SPEC) {
          throw new BadRequestException(
            `ویژگی «${attribute.name}» یک گزینه تنوع است و به مشخصات دسته اضافه نمی‌شود.`,
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryAttribute.deleteMany({ where: { categoryId } });
      if (deduped.size === 0) {
        return;
      }
      await tx.categoryAttribute.createMany({
        data: [...deduped.values()].map((input, index) => ({
          categoryId,
          attributeId: input.attributeId,
          sortOrder: Math.max(0, Math.trunc(input.sortOrder ?? index)),
          isRequired: input.isRequired ?? false,
          isFilterable: input.isFilterable ?? true,
          isComparable: input.isComparable ?? true,
          createdBy: userId,
          updatedBy: userId,
        })),
      });
    });
    return this.listCategoryAttributes(categoryId);
  }

  /**
   * Resolved applicable attributes for a category, root→leaf with child
   * overrides. Public/consumer safe.
   */
  async resolvedCategoryAttributes(categoryId: string): Promise<CategoryAttributeDto[]> {
    const chain = await this.categoryChain(categoryId);
    const resolved = await this.resolveAssignmentsForChain(chain);
    return resolved.map((row) => toCategoryAttributeDto(row));
  }

  // ---------------------------------------------------------------------
  // Product values
  // ---------------------------------------------------------------------

  async getProductAttributes(productId: string): Promise<ProductAttributesResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true, deletedAt: true },
    });
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    const applicable = await this.resolvedCategoryAttributes(product.categoryId);
    const applicableIds = new Set(applicable.map((row) => row.attribute.id));
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { productId },
      select: productValueSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const values = rows.map((row) => toProductValueDto(row, applicableIds));
    return {
      productId,
      categoryId: product.categoryId,
      applicable,
      values: values.filter((row) => row.isApplicable),
      incompatible: values.filter((row) => !row.isApplicable),
    };
  }

  /**
   * Replaces all applicable values for the product. Required attributes must
   * be present. Values whose attribute is no longer applicable are retained
   * unless `clearIncompatible` is explicitly true — a category change never
   * silently destroys data.
   */
  async setProductAttributes(
    productId: string,
    input: SetProductAttributesInput,
    userId: string,
  ): Promise<ProductAttributesResponse> {
    const product = await this.requireMutableProduct(productId);
    const applicable = await this.resolvedCategoryAttributes(product.categoryId);
    const assignmentByAttribute = new Map(
      applicable.map((row) => [row.attribute.id, row]),
    );
    const normalized = this.normalizeProductValues(
      input.values,
      assignmentByAttribute,
    );

    for (const assignment of applicable) {
      if (!assignment.isRequired) {
        continue;
      }
      if (!normalized.has(assignment.attribute.id)) {
        throw new BadRequestException(
          `مقدار ویژگی «${assignment.attribute.name}» الزامی است.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const applicableIds = [...assignmentByAttribute.keys()];
      await tx.productAttributeValue.deleteMany({
        where: { productId, attributeId: { in: applicableIds } },
      });
      for (const value of normalized.values()) {
        await createProductValueRows(tx, productId, value, ATTRIBUTE_SOURCE_ADMIN, userId);
      }
      if (input.clearIncompatible === true) {
        await tx.productAttributeValue.deleteMany({
          where: { productId, attributeId: { notIn: applicableIds } },
        });
      }
    });
    return this.getProductAttributes(productId);
  }

  async clearProductAttribute(
    productId: string,
    attributeId: string,
  ): Promise<ProductAttributesResponse> {
    const product = await this.requireMutableProduct(productId);
    const applicable = await this.resolvedCategoryAttributes(product.categoryId);
    const assignment = applicable.find((row) => row.attribute.id === attributeId);
    if (!assignment) {
      throw new BadRequestException('این ویژگی برای دسته محصول تعریف نشده است.');
    }
    if (assignment.isRequired) {
      throw new BadRequestException(
        `مقدار ویژگی «${assignment.attribute.name}» الزامی است و پاک نمی‌شود.`,
      );
    }
    await this.prisma.productAttributeValue.deleteMany({
      where: { productId, attributeId },
    });
    return this.getProductAttributes(productId);
  }

  // ---------------------------------------------------------------------
  // Bulk editing (preview → apply)
  // ---------------------------------------------------------------------

  async previewBulk(
    input: BulkAttributePreviewInput,
  ): Promise<BulkAttributePreviewResponse> {
    this.assertBulkShape(input);
    const products = await this.loadBulkProducts(input);
    const operations = await this.loadBulkOperations(input.operations);
    const changes: BulkAttributeChange[] = [];
    const warnings: string[] = [];
    const affected = new Set<string>();

    for (const product of products) {
      const applicable = await this.resolvedCategoryAttributes(product.categoryId);
      const assignmentByAttribute = new Map(
        applicable.map((row) => [row.attribute.id, row]),
      );
      for (const operation of operations) {
        const assignment = assignmentByAttribute.get(operation.attributeId);
        if (!assignment) {
          continue;
        }
        const existing = product.specs.filter(
          (spec) => spec.attributeId === operation.attributeId,
        );
        const before = formatExistingValue(assignment.attribute, existing);
        let after: string | null = before;
        let action: 'SET' | 'CLEAR' | 'UNCHANGED' = 'UNCHANGED';
        if (operation.kind === 'CLEAR') {
          if (assignment.isRequired) {
            warnings.push(
              `${product.name}: «${assignment.attribute.name}» الزامی است و پاک نخواهد شد.`,
            );
            continue;
          }
          after = null;
          action = before === null ? 'UNCHANGED' : 'CLEAR';
        } else {
          const next = formatOperationValue(operation, assignment.attribute);
          after = next;
          action = before === next ? 'UNCHANGED' : 'SET';
        }
        if (action !== 'UNCHANGED') {
          affected.add(product.id);
        }
        changes.push({
          productId: product.id,
          productName: product.name,
          attributeName: assignment.attribute.name,
          before,
          after,
          action,
        });
      }
    }

    const previewToken = this.bulkToken(input);
    return {
      affectedProducts: affected.size,
      unchangedProducts: products.length - affected.size,
      changes,
      previewToken,
      warnings: [...new Set(warnings)],
    };
  }

  async applyBulk(
    input: BulkAttributeApplyInput,
    userId: string,
  ): Promise<BulkAttributeApplyResponse> {
    this.assertBulkShape(input);
    const expectedToken = this.bulkToken(input);
    if (!safeTokenEqual(expectedToken, input.previewToken)) {
      throw new ConflictException(
        'پیش‌نمایش منقضی شده است؛ فهرست محصولات یا عملیات تغییر کرده است. دوباره پیش‌نمایش بگیرید.',
      );
    }
    const products = await this.loadBulkProducts(input);
    const operations = await this.loadBulkOperations(input.operations);
    const outcomes: BulkAttributeProductOutcome[] = [];

    for (const product of products) {
      const ref = input.products.find((row) => row.id === product.id);
      if (
        ref?.updatedAt !== undefined &&
        ref.updatedAt !== product.updatedAt.toISOString()
      ) {
        outcomes.push({
          productId: product.id,
          productName: product.name,
          status: 'CONFLICT',
          message: 'محصول پس از پیش‌نمایش تغییر کرده است؛ دوباره تلاش کنید.',
        });
        continue;
      }
      try {
        const applicable = await this.resolvedCategoryAttributes(product.categoryId);
        const assignmentByAttribute = new Map(
          applicable.map((row) => [row.attribute.id, row]),
        );
        const applicableOps = operations.filter((op) =>
          assignmentByAttribute.has(op.attributeId),
        );
        if (applicableOps.length === 0) {
          outcomes.push({
            productId: product.id,
            productName: product.name,
            status: 'SKIPPED',
            message: 'هیچ‌یک از ویژگی‌های انتخاب‌شده برای این دسته تعریف نشده است.',
          });
          continue;
        }
        await this.prisma.$transaction(async (tx) => {
          for (const operation of applicableOps) {
            const assignment = assignmentByAttribute.get(operation.attributeId)!;
            if (operation.kind === 'CLEAR') {
              if (assignment.isRequired) {
                throw new BadRequestException(
                  `ویژگی «${assignment.attribute.name}» برای این محصول الزامی است.`,
                );
              }
              await tx.productAttributeValue.deleteMany({
                where: { productId: product.id, attributeId: operation.attributeId },
              });
              continue;
            }
            const value = normalizeOperationValue(operation, assignment);
            await tx.productAttributeValue.deleteMany({
              where: { productId: product.id, attributeId: operation.attributeId },
            });
            await createProductValueRows(
              tx,
              product.id,
              value,
              ATTRIBUTE_SOURCE_BULK,
              userId,
            );
          }
        });
        outcomes.push({
          productId: product.id,
          productName: product.name,
          status: 'APPLIED',
          message: null,
        });
      } catch (error) {
        outcomes.push({
          productId: product.id,
          productName: product.name,
          status: 'FAILED',
          message:
            error instanceof BadRequestException
              ? extractMessage(error)
              : 'اعمال تغییرات ناموفق بود.',
        });
      }
    }

    return {
      applied: outcomes.filter((row) => row.status === 'APPLIED').length,
      skipped: outcomes.filter((row) => row.status === 'SKIPPED').length,
      failed: outcomes.filter(
        (row) => row.status === 'FAILED' || row.status === 'CONFLICT',
      ).length,
      outcomes,
    };
  }

  // ---------------------------------------------------------------------
  // Importer compatibility (variant options + legacy specs)
  // ---------------------------------------------------------------------

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
          attributeId: attribute.id,
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

  /** Ordered legacy specs of a product (option rows only). */
  async listProductSpecs(productId: string): Promise<ProductSpecDto[]> {
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { productId, attributeValueId: { not: null } },
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
            normalizedValue: true,
            numericValue: true,
            sortOrder: true,
            isActive: true,
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
    return rows
      .filter((row) => row.attributeValue !== null)
      .map((row) => ({
        id: row.id,
        sortOrder: row.sortOrder,
        source: row.source,
        attributeValue: {
          ...row.attributeValue!,
          numericValue: row.attributeValue!.numericValue?.toString() ?? null,
        },
      }));
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
      throw new NotFoundException('نوع یافت نشد.');
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

  /** Hard delete, guarded: values, assignments, or product values block it. */
  async deleteAttribute(id: string): Promise<void> {
    const [values, assignments, productValues] = await this.prisma.$transaction([
      this.prisma.attributeValue.count({ where: { attributeId: id } }),
      this.prisma.categoryAttribute.count({ where: { attributeId: id } }),
      this.prisma.productAttributeValue.count({ where: { attributeId: id } }),
    ]);
    if (values + assignments + productValues > 0) {
      throw new ConflictException(
        'این ویژگی در دسته‌ها یا محصولات استفاده شده و قابل حذف نیست.',
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

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private async categoryChain(categoryId: string): Promise<CategoryNode[]> {
    const chain: CategoryNode[] = [];
    let currentId: string | null = categoryId;
    while (currentId !== null) {
      if (chain.length >= CATEGORY_DEPTH_LIMIT) {
        throw new ConflictException('عمق درخت دسته‌بندی بیش از حد مجاز است.');
      }
      const row: CategoryNode | null = await this.prisma.category.findFirst({
        where: { id: currentId, deletedAt: null },
        select: { id: true, name: true, parentId: true },
      });
      if (!row) {
        throw new NotFoundException('دسته‌بندی یافت نشد.');
      }
      chain.push(row);
      currentId = row.parentId;
    }
    return chain.reverse();
  }

  private async resolveAssignmentsForChain(
    chain: CategoryNode[],
  ): Promise<ResolvedAssignment[]> {
    if (chain.length === 0) {
      return [];
    }
    const rows = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: chain.map((row) => row.id) } },
      select: {
        categoryId: true,
        attributeId: true,
        sortOrder: true,
        isRequired: true,
        isFilterable: true,
        isComparable: true,
        attribute: { select: attributeWithValuesSelect },
      },
    });
    const chainIndex = new Map(chain.map((row, index) => [row.id, index]));
    const byAttribute = new Map<
      string,
      { row: (typeof rows)[number]; categoryIndex: number }
    >();
    for (const row of rows) {
      const categoryIndex = chainIndex.get(row.categoryId) ?? -1;
      const previous = byAttribute.get(row.attributeId);
      if (!previous || categoryIndex >= previous.categoryIndex) {
        byAttribute.set(row.attributeId, { row, categoryIndex });
      }
    }
    const target = chain[chain.length - 1]!;
    return [...byAttribute.values()]
      .map(({ row, categoryIndex }) => {
        const source = chain[categoryIndex]!;
        const inherited = source.id !== target.id;
        return {
          attribute: row.attribute,
          sortOrder: row.sortOrder,
          isRequired: row.isRequired,
          isFilterable: row.isFilterable,
          isComparable: row.isComparable,
          inheritedFromCategoryId: inherited ? source.id : null,
          inheritedFromCategoryName: inherited ? source.name : null,
        };
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.attribute.name.localeCompare(b.attribute.name, 'fa'),
      );
  }

  private async assertAttributeShapeChangeSafe(
    existing: AttributeWithValuesRow,
    nextType: AttributeType,
    nextValueType: AttributeValueType,
  ): Promise<void> {
    if (existing.type !== nextType) {
      const used = await this.prisma.productAttributeValue.count({
        where: { attributeId: existing.id },
      });
      if (used > 0) {
        throw new ConflictException(
          'این ویژگی در محصولات استفاده شده و تغییر نوع آن مجاز نیست.',
        );
      }
    }
    if (existing.valueType === nextValueType) {
      return;
    }
    const optionLike =
      nextValueType === AttributeValueType.SELECT ||
      nextValueType === AttributeValueType.MULTI_SELECT;
    if (!optionLike && existing.values.length > 0) {
      throw new ConflictException(
        'این ویژگی مقدارهای انتخابی دارد و تغییر نوع آن‌ها را نامعتبر می‌کند.',
      );
    }
  }

  private normalizeProductValues(
    inputs: ProductAttributeValueInput[],
    assignmentByAttribute: Map<string, CategoryAttributeDto>,
  ): Map<string, NormalizedValue> {
    const grouped = new Map<string, ProductAttributeValueInput[]>();
    for (const input of inputs) {
      const assignment = assignmentByAttribute.get(input.attributeId);
      if (!assignment) {
        throw new BadRequestException(
          'یکی از ویژگی‌ها برای دسته فعلی محصول تعریف نشده است.',
        );
      }
      const list = grouped.get(input.attributeId) ?? [];
      list.push(input);
      grouped.set(input.attributeId, list);
    }
    const normalized = new Map<string, NormalizedValue>();
    for (const [attributeId, list] of grouped) {
      const assignment = assignmentByAttribute.get(attributeId)!;
      const attribute = assignment.attribute as AttributeWithValuesDto;
      const options = new Set<string>();
      let text: string | null = null;
      let number: Prisma.Decimal | null = null;
      let boolean: boolean | null = null;
      for (const input of list) {
        if ('optionIds' in input && Array.isArray(input.optionIds)) {
          input.optionIds.forEach((id) => options.add(id));
        } else if ('optionId' in input && typeof input.optionId === 'string') {
          options.add(input.optionId);
        } else if ('valueText' in input) {
          text = requireText(input.valueText, VALUE_MAX, 'مقدار متنی معتبر نیست.');
        } else if ('valueNumber' in input) {
          number = parseDecimal(input.valueNumber, 'مقدار عددی معتبر نیست.');
        } else if ('valueBoolean' in input) {
          boolean = Boolean(input.valueBoolean);
        }
      }
      if (attribute.valueType === AttributeValueType.MULTI_SELECT) {
        if (options.size === 0) {
          if (assignment.isRequired) {
            throw new BadRequestException(
              `حداقل یک مقدار برای «${attribute.name}» الزامی است.`,
            );
          }
          continue;
        }
        assertOptionOwnership(attribute, [...options]);
        normalized.set(attributeId, {
          attribute,
          optionIds: [...options],
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
        });
        continue;
      }
      if (attribute.valueType === AttributeValueType.SELECT) {
        if (options.size === 0) {
          if (assignment.isRequired) {
            throw new BadRequestException(
              `مقدار «${attribute.name}» الزامی است.`,
            );
          }
          continue;
        }
        if (options.size > 1) {
          throw new BadRequestException(
            `برای «${attribute.name}» فقط یک مقدار مجاز است.`,
          );
        }
        assertOptionOwnership(attribute, [...options]);
        normalized.set(attributeId, {
          attribute,
          optionIds: [...options],
          valueText: null,
          valueNumber: null,
          valueBoolean: null,
        });
        continue;
      }
      if (attribute.valueType === AttributeValueType.NUMBER) {
        if (number === null) {
          if (assignment.isRequired) {
            throw new BadRequestException(
              `مقدار عددی «${attribute.name}» الزامی است.`,
            );
          }
          continue;
        }
        normalized.set(attributeId, {
          attribute,
          optionIds: [],
          valueText: null,
          valueNumber: number,
          valueBoolean: null,
        });
        continue;
      }
      if (attribute.valueType === AttributeValueType.BOOLEAN) {
        if (boolean === null) {
          if (assignment.isRequired) {
            throw new BadRequestException(
              `مقدار «${attribute.name}» الزامی است.`,
            );
          }
          continue;
        }
        normalized.set(attributeId, {
          attribute,
          optionIds: [],
          valueText: null,
          valueNumber: null,
          valueBoolean: boolean,
        });
        continue;
      }
      if (text === null) {
        if (assignment.isRequired) {
          throw new BadRequestException(`مقدار «${attribute.name}» الزامی است.`);
        }
        continue;
      }
      normalized.set(attributeId, {
        attribute,
        optionIds: [],
        valueText: text,
        valueNumber: null,
        valueBoolean: null,
      });
    }
    return normalized;
  }

  private async loadBulkProducts(input: BulkAttributePreviewInput) {
    const productIds = input.products.map((row) => row.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        categoryId: true,
        status: true,
        updatedAt: true,
        specs: {
          select: {
            attributeId: true,
            valueText: true,
            valueNumber: true,
            valueBoolean: true,
            attributeValue: { select: { value: true } },
          },
        },
      },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('یکی از محصولات انتخاب‌شده یافت نشد.');
    }
    const archived = products.find((row) => row.status === ProductStatus.ARCHIVED);
    if (archived) {
      throw new ConflictException(
        `محصول «${archived.name}» آرشیو شده و قابل ویرایش نیست.`,
      );
    }
    return products;
  }

  private async loadBulkOperations(
    operations: BulkAttributeOperation[],
  ): Promise<BulkAttributeOperation[]> {
    const ids = [...new Set(operations.map((row) => row.attributeId))];
    const attributes = await this.prisma.attribute.findMany({
      where: { id: { in: ids } },
      select: attributeWithValuesSelect,
    });
    if (attributes.length !== ids.length) {
      throw new BadRequestException('یکی از ویژگی‌های انتخاب‌شده یافت نشد.');
    }
    const byId = new Map(attributes.map((row) => [row.id, row]));
    return operations.map((operation) => {
      const attribute = byId.get(operation.attributeId)!;
      if (operation.kind === 'CLEAR') {
        return operation;
      }
      if (attribute.valueType === AttributeValueType.SELECT) {
        if (!operation.optionId) {
          throw new BadRequestException(
            `برای «${attribute.name}» یک گزینه انتخاب کنید.`,
          );
        }
        assertOptionOwnership(toAttributeWithValuesDto(attribute), [
          operation.optionId,
        ]);
      } else if (attribute.valueType === AttributeValueType.MULTI_SELECT) {
        throw new BadRequestException(
          `ویرایش گروهی چندمقداری برای «${attribute.name}» پشتیبانی نمی‌شود؛ از ویرایش محصول استفاده کنید.`,
        );
      } else if (attribute.valueType === AttributeValueType.NUMBER) {
        if (operation.valueNumber === undefined) {
          throw new BadRequestException(`مقدار عددی «${attribute.name}» الزامی است.`);
        }
        parseDecimal(operation.valueNumber, 'مقدار عددی معتبر نیست.');
      } else if (attribute.valueType === AttributeValueType.BOOLEAN) {
        if (operation.valueBoolean === undefined) {
          throw new BadRequestException(`مقدار «${attribute.name}» الزامی است.`);
        }
      } else if (!operation.valueText?.trim()) {
        throw new BadRequestException(`مقدار «${attribute.name}» الزامی است.`);
      }
      return operation;
    });
  }

  private assertBulkShape(input: BulkAttributePreviewInput): void {
    if (
      !Array.isArray(input.products) ||
      input.products.length === 0 ||
      input.products.length > MAX_BULK_PRODUCTS
    ) {
      throw new BadRequestException(
        `تعداد محصولات انتخاب‌شده باید بین ۱ و ${MAX_BULK_PRODUCTS} باشد.`,
      );
    }
    if (
      !Array.isArray(input.operations) ||
      input.operations.length === 0 ||
      input.operations.length > MAX_BULK_OPERATIONS
    ) {
      throw new BadRequestException(
        `تعداد عملیات باید بین ۱ و ${MAX_BULK_OPERATIONS} باشد.`,
      );
    }
    const ids = new Set<string>();
    for (const product of input.products) {
      if (typeof product.id !== 'string' || ids.has(product.id)) {
        throw new BadRequestException('فهرست محصولات معتبر نیست.');
      }
      ids.add(product.id);
    }
    for (const operation of input.operations) {
      if (
        typeof operation.attributeId !== 'string' ||
        (operation.kind !== 'SET' && operation.kind !== 'CLEAR')
      ) {
        throw new BadRequestException('عملیات ویرایش گروهی معتبر نیست.');
      }
    }
  }

  private bulkToken(input: BulkAttributePreviewInput): string {
    const canonical = JSON.stringify({
      products: input.products
        .map((row) => ({ id: row.id, updatedAt: row.updatedAt ?? null }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      operations: input.operations,
    });
    const secret =
      process.env.PREVIEW_TOKEN_SECRET ??
      process.env.JWT_ACCESS_SECRET ??
      'dev-preview-token-secret';
    return createHmac('sha256', secret).update(canonical).digest('hex');
  }

  private async requireMutableProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true, status: true, deletedAt: true },
    });
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
    return product;
  }

  private async assertProductForMutation(productId: string): Promise<void> {
    await this.requireMutableProduct(productId);
  }
}

async function createProductValueRows(
  tx: Prisma.TransactionClient,
  productId: string,
  value: NormalizedValue,
  source: string,
  userId: string,
): Promise<void> {
  if (value.optionIds.length > 0) {
    await tx.productAttributeValue.createMany({
      data: value.optionIds.map((optionId, index) => ({
        productId,
        attributeId: value.attribute.id,
        attributeValueId: optionId,
        sortOrder: index,
        source,
        updatedBy: userId,
      })),
    });
    return;
  }
  await tx.productAttributeValue.create({
    data: {
      productId,
      attributeId: value.attribute.id,
      attributeValueId: null,
      valueText: value.valueText,
      valueNumber: value.valueNumber,
      valueBoolean: value.valueBoolean,
      source,
      updatedBy: userId,
    },
  });
}

function normalizeOperationValue(
  operation: Extract<BulkAttributeOperation, { kind: 'SET' }>,
  assignment: CategoryAttributeDto,
): NormalizedValue {
  const attribute = assignment.attribute as AttributeWithValuesDto;
  if (attribute.valueType === AttributeValueType.SELECT) {
    assertOptionOwnership(attribute, [operation.optionId!]);
    return {
      attribute,
      optionIds: [operation.optionId!],
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
    };
  }
  if (attribute.valueType === AttributeValueType.NUMBER) {
    return {
      attribute,
      optionIds: [],
      valueText: null,
      valueNumber: parseDecimal(operation.valueNumber!, 'مقدار عددی معتبر نیست.'),
      valueBoolean: null,
    };
  }
  if (attribute.valueType === AttributeValueType.BOOLEAN) {
    return {
      attribute,
      optionIds: [],
      valueText: null,
      valueNumber: null,
      valueBoolean: operation.valueBoolean ?? false,
    };
  }
  return {
    attribute,
    optionIds: [],
    valueText: requireText(operation.valueText, VALUE_MAX, 'مقدار متنی معتبر نیست.'),
    valueNumber: null,
    valueBoolean: null,
  };
}

function formatOperationValue(
  operation: Extract<BulkAttributeOperation, { kind: 'SET' }>,
  attribute: AttributeWithValuesDto,
): string | null {
  if (attribute.valueType === AttributeValueType.SELECT) {
    return (
      attribute.values.find((row) => row.id === operation.optionId)?.value ??
      null
    );
  }
  if (attribute.valueType === AttributeValueType.NUMBER) {
    return formatNumber(operation.valueNumber ?? null, attribute.unit);
  }
  if (attribute.valueType === AttributeValueType.BOOLEAN) {
    return operation.valueBoolean ? 'بله' : 'خیر';
  }
  return operation.valueText?.trim() || null;
}

function formatExistingValue(
  attribute: AttributeWithValuesDto,
  rows: Array<{
    valueText: string | null;
    valueNumber: Prisma.Decimal | null;
    valueBoolean: boolean | null;
    attributeValue: { value: string } | null;
  }>,
): string | null {
  if (rows.length === 0) {
    return null;
  }
  if (attribute.valueType === AttributeValueType.SELECT || attribute.valueType === AttributeValueType.MULTI_SELECT) {
    const values = rows
      .map((row) => row.attributeValue?.value)
      .filter((value): value is string => typeof value === 'string');
    return values.length > 0 ? values.join('، ') : null;
  }
  const row = rows[0]!;
  if (attribute.valueType === AttributeValueType.NUMBER) {
    return formatNumber(row.valueNumber?.toString() ?? null, attribute.unit);
  }
  if (attribute.valueType === AttributeValueType.BOOLEAN) {
    return row.valueBoolean === null ? null : row.valueBoolean ? 'بله' : 'خیر';
  }
  return row.valueText;
}

function formatNumber(value: string | null, unit: string | null): string | null {
  if (value === null || value === '') {
    return null;
  }
  return unit ? `${value} ${unit}` : value;
}

function assertOptionOwnership(
  attribute: AttributeWithValuesDto,
  optionIds: string[],
): void {
  const allowed = new Set(
    attribute.values.filter((row) => row.isActive).map((row) => row.id),
  );
  for (const id of optionIds) {
    if (!allowed.has(id)) {
      throw new BadRequestException(
        `مقدار انتخاب‌شده برای «${attribute.name}» معتبر نیست.`,
      );
    }
  }
}

function toAttributeDto(row: AttributeRow): AttributeDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    group: row.group,
    isFilterable: row.isFilterable,
    isGlobal: row.isGlobal,
    valueType: row.valueType,
    unit: row.unit,
    description: row.description,
    isComparable: row.isComparable,
  };
}

function toAttributeWithValuesDto(row: AttributeWithValuesRow): AttributeWithValuesDto {
  return {
    ...toAttributeDto(row),
    values: row.values.map(toAttributeValueDto),
  };
}

function toAttributeValueDto(row: AttributeValueRow): AttributeValueDto {
  return {
    id: row.id,
    attributeId: row.attributeId,
    value: row.value,
    slug: row.slug,
    normalizedValue: row.normalizedValue,
    numericValue: row.numericValue?.toString() ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function toCategoryAttributeDto(row: ResolvedAssignment): CategoryAttributeDto {
  return {
    attribute: toAttributeWithValuesDto(row.attribute),
    sortOrder: row.sortOrder,
    isRequired: row.isRequired,
    isFilterable: row.isFilterable,
    isComparable: row.isComparable,
    inheritedFromCategoryId: row.inheritedFromCategoryId,
    inheritedFromCategoryName: row.inheritedFromCategoryName,
  };
}

function toProductValueDto(
  row: ProductValueRow,
  applicableIds: Set<string>,
): ProductAttributeValueDto {
  return {
    id: row.id,
    attribute: toAttributeDto(row.attribute),
    option: row.attributeValue ? toAttributeValueDto(row.attributeValue) : null,
    valueText: row.valueText,
    valueNumber: row.valueNumber?.toString() ?? null,
    valueBoolean: row.valueBoolean,
    sortOrder: row.sortOrder,
    source: row.source,
    isApplicable: applicableIds.has(row.attributeId),
  };
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

function optionalText(value: unknown, max: number, message: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(message);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > max) {
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

function parseDecimal(value: string, message: string): Prisma.Decimal {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new BadRequestException(message);
  }
  if (!parsed.isFinite()) {
    throw new BadRequestException(message);
  }
  return parsed;
}

function extractMessage(error: BadRequestException): string {
  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }
  return 'اعمال تغییرات ناموفق بود.';
}

function safeTokenEqual(expected: string, actual: string): boolean {
  if (typeof actual !== 'string') {
    return false;
  }
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function isUniqueViolation(error: unknown, model: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    error.meta?.modelName === model
  );
}
