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
}

export class CatalogGridBatchDto {
  @ApiProperty({ type: [CatalogGridBatchRowDto], maxItems: 50, minItems: 1 })
  @ArrayMinSize(1, { message: 'rows باید حداقل یک ردیف داشته باشد.' })
  @ArrayMaxSize(50, { message: 'حداکثر ۵۰ ردیف در هر درخواست مجاز است.' })
  @ValidateNested({ each: true })
  @Type(() => CatalogGridBatchRowDto)
  rows!: CatalogGridBatchRowDto[];
}
