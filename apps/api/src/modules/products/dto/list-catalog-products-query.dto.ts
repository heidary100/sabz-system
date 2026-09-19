import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductCondition } from '@prisma/client';

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
}
