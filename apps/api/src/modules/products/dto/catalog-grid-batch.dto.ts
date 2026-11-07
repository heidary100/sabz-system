import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PriceStatus } from '@prisma/client';
import { PRICE_12_2_PATTERN } from './create-variant.dto';

/**
 * SS-257 catalog-grid batch row. Request-level validation here covers shape
 * and value format; domain rules (compareAt > price, PRICED requirement) run
 * in the service through the shared SS-251 invariant. Duplicate variantIds
 * are rejected at request level in the service — an ambiguous repeated write
 * is never accepted.
 */
export class CatalogGridBatchRowDto {
  @ApiProperty({ description: 'Variant id (the grid row identity).' })
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId!: string;

  @ApiProperty({
    description:
      'ISO datetime the admin loaded the row with. The write is conditional on it.',
  })
  @IsDateString({}, { message: 'expectedUpdatedAt باید تاریخ و زمان معتبر ISO باشد.' })
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({
    description: 'Retail/base price (Decimal(12,2), serialized as string).',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, {
    message: 'price باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  price?: string;

  @ApiPropertyOptional({
    description: 'Pre-discount reference price. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  })
  @IsString({ message: 'compareAtPrice باید رشته باشد.' })
  @Matches(PRICE_12_2_PATTERN, {
    message: 'compareAtPrice باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  compareAtPrice?: string | null;

  @ApiPropertyOptional({ enum: PriceStatus })
  @IsOptional()
  @IsEnum(PriceStatus, { message: 'priceStatus معتبر نیست.' })
  priceStatus?: PriceStatus;

  @ApiPropertyOptional({
    description: 'Absolute desired quantityOnHand (single-warehouse variants only).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'stock باید عدد صحیح باشد.' })
  @Min(0, { message: 'stock نمیتواند منفی باشد.' })
  stock?: number;

  @ApiPropertyOptional({ description: 'Globally unique SKU (≤64 chars).' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  })
  @IsString({ message: 'sku باید رشته باشد.' })
  @MaxLength(64, { message: 'sku باید حداکثر ۶۴ کاراکتر باشد.' })
  sku?: string;

  @ApiPropertyOptional({ description: 'Barcode. Pass null to clear.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  })
  @IsString({ message: 'barcode باید رشته باشد.' })
  @MaxLength(64, { message: 'barcode باید حداکثر ۶۴ کاراکتر باشد.' })
  barcode?: string | null;

  @ApiPropertyOptional({ description: 'Variant display label. Pass null to clear.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  })
  @IsString({ message: 'variantName باید رشته باشد.' })
  @MaxLength(255, { message: 'variantName باید حداکثر ۲۵۵ کاراکتر باشد.' })
  variantName?: string | null;

  @ApiPropertyOptional({ description: 'Product name (SS-270 inline product edit).' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  })
  @IsString({ message: 'productName باید رشته باشد.' })
  @MaxLength(255, { message: 'productName باید حداکثر ۲۵۵ کاراکتر باشد.' })
  productName?: string;

  @ApiPropertyOptional({
    description: 'Brand id. Pass null to clear (mirrors PATCH /admin/products).',
  })
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : value))
  @IsUUID('all', { message: 'brandId باید شناسه UUID معتبر باشد.' })
  brandId?: string | null;

  @ApiPropertyOptional({ description: 'Category id (required non-null domain rule).' })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId باید شناسه UUID معتبر باشد.' })
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'ISO datetime of the product row the admin loaded with. Required when any product field is submitted; the product write is conditional on it.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'expectedProductUpdatedAt باید تاریخ و زمان معتبر ISO باشد.' })
  expectedProductUpdatedAt?: string;
}

export class CatalogGridBatchDto {
  @ApiProperty({ type: [CatalogGridBatchRowDto], maxItems: 50, minItems: 1 })
  @ArrayMinSize(1, { message: 'rows باید حداقل یک ردیف داشته باشد.' })
  @ArrayMaxSize(50, { message: 'حداکثر ۵۰ ردیف در هر درخواست مجاز است.' })
  @ValidateNested({ each: true })
  @Type(() => CatalogGridBatchRowDto)
  rows!: CatalogGridBatchRowDto[];
}
