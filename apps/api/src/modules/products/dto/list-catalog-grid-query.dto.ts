import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PriceStatus, ProductCondition, ProductStatus } from '@prisma/client';
import { PRICE_12_2_PATTERN } from './create-variant.dto';

/**
 * SS-257 catalog grid list query. Variant-keyed rows with server-side
 * pagination; `sku` is the dedicated SKU filter, `search` is the global
 * search across product name/slug, brand, category and SKU. Multi-select
 * filters arrive comma-separated (`brandIds=1,2`). Stock status and stock
 * sort are aggregate-backed (cheap at the 1,100-row catalog scale).
 */
export class ListCatalogGridQueryDto {
  @ApiPropertyOptional({ description: 'Page number, starting at 1.', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size. Maximum 100.', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit باید حداکثر ۱۰۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Global search: product name/slug, brand name/nameEn, category name, SKU.',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'search باید رشته باشد.' })
  @MaxLength(64, { message: 'search باید حداکثر ۶۴ کاراکتر باشد.' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Dedicated SKU filter (case-insensitive contains).',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'sku باید رشته باشد.' })
  @MaxLength(64, { message: 'sku باید حداکثر ۶۴ کاراکتر باشد.' })
  sku?: string;

  @ApiPropertyOptional({ enum: ProductStatus, description: 'Filter by product status.' })
  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status معتبر نیست.' })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Filter by category id.' })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId باید شناسه UUID معتبر باشد.' })
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by brand id.' })
  @IsOptional()
  @IsUUID('all', { message: 'brandId باید شناسه UUID معتبر باشد.' })
  brandId?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated product statuses (multi-select).',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === 'string' && value.trim() !== ''
      ? value.split(',').map((part) => part.trim())
      : undefined;
  })
  @IsArray({ message: 'statuses باید آرایه باشد.' })
  @IsEnum(ProductStatus, { each: true, message: 'statuses معتبر نیست.' })
  statuses?: ProductStatus[];

  @ApiPropertyOptional({
    description: 'Comma-separated category ids (multi-select).',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === 'string' && value.trim() !== ''
      ? value.split(',').map((part) => part.trim())
      : undefined;
  })
  @IsArray({ message: 'categoryIds باید آرایه باشد.' })
  @IsUUID('all', { each: true, message: 'categoryIds باید شناسه UUID معتبر باشد.' })
  categoryIds?: string[];

  @ApiPropertyOptional({
    description: 'Comma-separated brand ids (multi-select).',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === 'string' && value.trim() !== ''
      ? value.split(',').map((part) => part.trim())
      : undefined;
  })
  @IsArray({ message: 'brandIds باید آرایه باشد.' })
  @IsUUID('all', { each: true, message: 'brandIds باید شناسه UUID معتبر باشد.' })
  brandIds?: string[];

  @ApiPropertyOptional({ enum: PriceStatus, description: 'Filter by variant price status.' })
  @IsOptional()
  @IsEnum(PriceStatus, { message: 'priceStatus معتبر نیست.' })
  priceStatus?: PriceStatus;

  @ApiPropertyOptional({ enum: ProductCondition, description: 'Filter by product condition.' })
  @IsOptional()
  @IsEnum(ProductCondition, { message: 'condition معتبر نیست.' })
  condition?: ProductCondition;

  @ApiPropertyOptional({ description: 'Inclusive minimum variant price (Decimal(12,2)).' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, {
    message: 'minPrice باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  minPrice?: string;

  @ApiPropertyOptional({ description: 'Inclusive maximum variant price (Decimal(12,2)).' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, {
    message: 'maxPrice باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  maxPrice?: string;

  @ApiPropertyOptional({
    enum: ['IN_STOCK', 'OUT_OF_STOCK'],
    description: 'Aggregate-stock bucket across qualifying warehouses.',
  })
  @IsOptional()
  @IsIn(['IN_STOCK', 'OUT_OF_STOCK'], { message: 'stockStatus معتبر نیست.' })
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK';

  @ApiPropertyOptional({
    enum: ['name', 'sku', 'price', 'compareAtPrice', 'createdAt', 'stock'],
    description: 'Sort field.',
  })
  @IsOptional()
  @IsIn(['name', 'sku', 'price', 'compareAtPrice', 'createdAt', 'stock'], {
    message: 'sortBy معتبر نیست.',
  })
  sortBy?: 'name' | 'sku' | 'price' | 'compareAtPrice' | 'createdAt' | 'stock';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sort direction.' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortDir معتبر نیست.' })
  sortDir?: 'asc' | 'desc';
}
