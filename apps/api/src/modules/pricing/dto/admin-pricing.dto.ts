import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PromotionType } from '@prisma/client';
import { PRICE_12_2_PATTERN } from '../../products/dto/create-variant.dto';

const UUID_MESSAGE = 'شناسه باید یک UUID معتبر نسخه ۴ باشد.';
const VALUE_MESSAGE = 'value باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.';
const DATE_MESSAGE = 'باید یک زمان ISO 8601 معتبر باشد.';
const TYPE_MESSAGE = 'type باید یکی از PERCENT یا FIXED باشد.';

function normalizeOptional(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

function normalizeNullableOptional(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  return normalizeOptional(value);
}

function normalizeNullableDate(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  return normalizeOptional(value);
}

function toBoolean(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }
  }
  return value;
}

/**
 * Admin pricing DTOs (SS-240B). CRUD for the three pricing models that feed
 * `PricingService.resolveLine` (CategoryPriceRule, ProductPriceOverride,
 * Promotion). Range rules that need the stored row or a sibling field
 * (PERCENT ≤ 100, value > 0, endsAt > startsAt) are enforced in
 * `AdminPricingService` with Persian 400s; the DTOs below only pin shapes.
 * The engine itself (`PricingService.resolveLine`) is untouched.
 */
export class CreateCategoryPriceRuleDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID('4', { message: `categoryId ${UUID_MESSAGE}` })
  categoryId!: string;

  @ApiProperty({ enum: PromotionType, example: PromotionType.PERCENT })
  @IsEnum(PromotionType, { message: TYPE_MESSAGE })
  type!: PromotionType;

  @ApiProperty({
    example: '10.00',
    description: 'PERCENT: 0–100. FIXED: Rial amount off. Decimal(12,2) string.',
  })
  @IsString({ message: 'value باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, { message: VALUE_MESSAGE })
  value!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsDateString({}, { message: `startsAt ${DATE_MESSAGE}` })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsDateString({}, { message: `endsAt ${DATE_MESSAGE}` })
  endsAt?: string;

  @ApiPropertyOptional({ default: 0, description: 'Lower wins per category.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priority باید عدد صحیح باشد.' })
  priority?: number;
}

export class UpdateCategoryPriceRuleDto {
  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsOptional()
  @IsUUID('4', { message: `categoryId ${UUID_MESSAGE}` })
  categoryId?: string;

  @ApiPropertyOptional({ enum: PromotionType })
  @IsOptional()
  @IsEnum(PromotionType, { message: TYPE_MESSAGE })
  type?: PromotionType;

  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @IsString({ message: 'value باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, { message: VALUE_MESSAGE })
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableDate(value))
  @IsDateString({}, { message: `startsAt ${DATE_MESSAGE}` })
  startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableDate(value))
  @IsDateString({}, { message: `endsAt ${DATE_MESSAGE}` })
  endsAt?: string | null;

  @ApiPropertyOptional({ description: 'Lower wins per category.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priority باید عدد صحیح باشد.' })
  priority?: number;
}

export class CreateProductPriceOverrideDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID('4', { message: `productId ${UUID_MESSAGE}` })
  productId!: string;

  @ApiProperty({ enum: PromotionType, example: PromotionType.FIXED })
  @IsEnum(PromotionType, { message: TYPE_MESSAGE })
  type!: PromotionType;

  @ApiProperty({
    example: '5000.00',
    description: 'PERCENT: 0–100. FIXED: Rial amount off. Decimal(12,2) string.',
  })
  @IsString({ message: 'value باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, { message: VALUE_MESSAGE })
  value!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsDateString({}, { message: `startsAt ${DATE_MESSAGE}` })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsDateString({}, { message: `endsAt ${DATE_MESSAGE}` })
  endsAt?: string;
}

export class UpdateProductPriceOverrideDto {
  @ApiPropertyOptional({ enum: PromotionType })
  @IsOptional()
  @IsEnum(PromotionType, { message: TYPE_MESSAGE })
  type?: PromotionType;

  @ApiPropertyOptional({ example: '5000.00' })
  @IsOptional()
  @IsString({ message: 'value باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, { message: VALUE_MESSAGE })
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableDate(value))
  @IsDateString({}, { message: `startsAt ${DATE_MESSAGE}` })
  startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableDate(value))
  @IsDateString({}, { message: `endsAt ${DATE_MESSAGE}` })
  endsAt?: string | null;
}

export class CreatePromotionDto {
  @ApiProperty({ example: 'YALDA-10' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'code باید رشته باشد.' })
  @IsNotEmpty({ message: 'code الزامی است.' })
  @MaxLength(64, { message: 'code باید حداکثر ۶۴ کاراکتر باشد.' })
  code!: string;

  @ApiProperty({ example: 'فروش ویژه یلدا' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'titleFa باید رشته باشد.' })
  @IsNotEmpty({ message: 'titleFa الزامی است.' })
  @MaxLength(255, { message: 'titleFa باید حداکثر ۲۵۵ کاراکتر باشد.' })
  titleFa!: string;

  @ApiProperty({ enum: PromotionType, example: PromotionType.PERCENT })
  @IsEnum(PromotionType, { message: TYPE_MESSAGE })
  type!: PromotionType;

  @ApiProperty({
    example: '10.00',
    description: 'PERCENT: 0–100. FIXED: Rial amount off. Decimal(12,2) string.',
  })
  @IsString({ message: 'value باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, { message: VALUE_MESSAGE })
  value!: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString({}, { message: `startsAt ${DATE_MESSAGE}` })
  startsAt!: string;

  @ApiProperty({ example: '2026-12-31T00:00:00.000Z' })
  @IsDateString({}, { message: `endsAt ${DATE_MESSAGE}` })
  endsAt!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Product scope (omit for broader scopes; all null = sitewide).',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: `productId ${UUID_MESSAGE}` })
  productId?: string | null;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Category scope (omit for broader scopes; all null = sitewide).',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: `categoryId ${UUID_MESSAGE}` })
  categoryId?: string | null;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Brand scope (omit for broader scopes; all null = sitewide).',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: `brandId ${UUID_MESSAGE}` })
  brandId?: string | null;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minQuantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'minQuantity باید حداقل ۱ باشد.' })
  minQuantity?: number;
}

export class UpdatePromotionDto {
  @ApiPropertyOptional({ example: 'YALDA-10' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'code باید رشته باشد.' })
  @IsNotEmpty({ message: 'code نباید خالی باشد.' })
  @MaxLength(64, { message: 'code باید حداکثر ۶۴ کاراکتر باشد.' })
  code?: string;

  @ApiPropertyOptional({ example: 'فروش ویژه یلدا' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'titleFa باید رشته باشد.' })
  @IsNotEmpty({ message: 'titleFa نباید خالی باشد.' })
  @MaxLength(255, { message: 'titleFa باید حداکثر ۲۵۵ کاراکتر باشد.' })
  titleFa?: string;

  @ApiPropertyOptional({ enum: PromotionType })
  @IsOptional()
  @IsEnum(PromotionType, { message: TYPE_MESSAGE })
  type?: PromotionType;

  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @IsString({ message: 'value باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, { message: VALUE_MESSAGE })
  value?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsDateString({}, { message: `startsAt ${DATE_MESSAGE}` })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsDateString({}, { message: `endsAt ${DATE_MESSAGE}` })
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: `productId ${UUID_MESSAGE}` })
  productId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: `categoryId ${UUID_MESSAGE}` })
  categoryId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: `brandId ${UUID_MESSAGE}` })
  brandId?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minQuantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'minQuantity باید حداقل ۱ باشد.' })
  minQuantity?: number;
}

/**
 * Pricing list query (SS-240B). Newest-first paging plus an optional
 * `isActive` filter shared by all three resources.
 */
export class PricingListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit حداکثر ۱۰۰ است.' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by active flag.' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isActive باید بولین باشد.' })
  isActive?: boolean;
}
