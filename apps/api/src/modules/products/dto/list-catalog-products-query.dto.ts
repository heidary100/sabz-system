import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductCondition } from '@prisma/client';
import { PRICE_12_2_PATTERN } from './create-variant.dto';

/** Whitelisted public sort options (contract: CatalogProductSort). */
export const CATALOG_PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name',
] as const;

export class ListCatalogProductsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, starting at 1.',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({
    description: 'Page size. Maximum 50.',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(50, { message: 'limit باید حداکثر ۵۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Free-text search matched against product name or slug.',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'q باید رشته باشد.' })
  @MaxLength(64, { message: 'q باید حداکثر ۶۴ کاراکتر باشد.' })
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by category slug.' })
  @IsOptional()
  @IsString({ message: 'category باید رشته باشد.' })
  @MaxLength(128, { message: 'category باید حداکثر ۱۲۸ کاراکتر باشد.' })
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by brand slug.' })
  @IsOptional()
  @IsString({ message: 'brand باید رشته باشد.' })
  @MaxLength(128, { message: 'brand باید حداکثر ۱۲۸ کاراکتر باشد.' })
  brand?: string;

  @ApiPropertyOptional({
    enum: ProductCondition,
    description: 'Filter by product condition.',
  })
  @IsOptional()
  @IsEnum(ProductCondition, { message: 'condition معتبر نیست.' })
  condition?: ProductCondition;

  @ApiPropertyOptional({
    enum: CATALOG_PRODUCT_SORTS,
    description: 'Sort order. Default: newest.',
    default: 'newest',
  })
  @IsOptional()
  @IsIn(CATALOG_PRODUCT_SORTS, { message: 'sort معتبر نیست.' })
  sort?: (typeof CATALOG_PRODUCT_SORTS)[number];

  @ApiPropertyOptional({
    example: '1500000',
    description:
      'Minimum price in Toman (SS-213). Matches products with at least one PRICED, live variant priced at or above this value. CALL_FOR_PRICE rows never contribute.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'priceFrom باید رشته باشد.' })
  @Matches(PRICE_12_2_PATTERN, {
    message: 'priceFrom باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  priceFrom?: string;

  @ApiPropertyOptional({
    example: '20000000',
    description:
      'Maximum price in Toman (SS-213). Matches products with at least one PRICED, live variant priced at or below this value. With both bounds present, the SAME variant must satisfy the range (normalized by swapping when inverted).',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'priceTo باید رشته باشد.' })
  @Matches(PRICE_12_2_PATTERN, {
    message: 'priceTo باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  priceTo?: string;

  @ApiPropertyOptional({
    description:
      'When true, only products with at least one genuinely available variant (SS-213, inventory aggregate truth).',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'inStockOnly باید مقدار بولی باشد.' })
  inStockOnly?: boolean;
}
