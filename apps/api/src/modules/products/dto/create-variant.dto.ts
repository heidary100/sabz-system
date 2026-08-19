import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const PRICE_12_2_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

const SKU_MAX = 64;
const BARCODE_MAX = 64;
const NAME_MAX = 255;

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

/**
 * Create input for a ProductVariant (SS-104). The owning product is taken from
 * the route param and is never accepted in the body; `deletedAt`/`createdBy`/
 * `updatedBy` are server-owned and never accepted.
 */
export class CreateVariantDto {
  @ApiProperty({ example: 'XPS13-BASE', description: 'Globally unique SKU' })
  @IsString({ message: 'sku باید رشته باشد.' })
  @IsNotEmpty({ message: 'sku الزامی است.' })
  @Transform(({ value }) => normalizeOptional(value))
  @MaxLength(SKU_MAX, { message: `sku باید حداکثر ${SKU_MAX} کاراکتر باشد.` })
  sku!: string;

  @ApiPropertyOptional({ description: 'Barcode (optional)' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'barcode باید رشته باشد.' })
  @MaxLength(BARCODE_MAX, {
    message: `barcode باید حداکثر ${BARCODE_MAX} کاراکتر باشد.`,
  })
  barcode?: string;

  @ApiPropertyOptional({
    description: 'Display label only. Configurable attributes are deferred.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @MaxLength(NAME_MAX, { message: `name باید حداکثر ${NAME_MAX} کاراکتر باشد.` })
  name?: string;

  @ApiProperty({
    example: '1500.00',
    description: 'Retail/base price (Decimal(12,2), serialized as string)',
  })
  @IsString({ message: 'price باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, {
    message: 'price باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  price!: string;

  @ApiPropertyOptional({
    description:
      'Initial stock (M1 availability snapshot). Defaults to 0. Use the inventory endpoint for later changes.',
  })
  @IsOptional()
  @IsInt({ message: 'stockQuantity باید عدد صحیح باشد.' })
  @Min(0, { message: 'stockQuantity نمیتواند منفی باشد.' })
  stockQuantity?: number;
}
