import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PRICE_12_2_PATTERN } from './create-variant.dto';

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
 * Like `normalizeOptional` but preserves an explicit `null` so a nullable
 * field (barcode/name) can be cleared.
 */
function normalizeNullableOptional(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  return normalizeOptional(value);
}

/**
 * Update input for a ProductVariant (SS-104). `productId` is intentionally
 * absent (re-parenting is forbidden), inventory fields are intentionally absent
 * (authority lives in the dedicated inventory endpoint), and
 * `deletedAt`/`createdBy`/`updatedBy` are server-owned and never accepted.
 */
export class UpdateVariantDto {
  @ApiPropertyOptional({ description: 'Globally unique SKU' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'sku باید رشته باشد.' })
  @MaxLength(SKU_MAX, { message: `sku باید حداکثر ${SKU_MAX} کاراکتر باشد.` })
  sku?: string;

  @ApiPropertyOptional({
    description: 'Barcode. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'barcode باید رشته باشد.' })
  @MaxLength(BARCODE_MAX, {
    message: `barcode باید حداکثر ${BARCODE_MAX} کاراکتر باشد.`,
  })
  barcode?: string | null;

  @ApiPropertyOptional({
    description: 'Display label only. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @MaxLength(NAME_MAX, { message: `name باید حداکثر ${NAME_MAX} کاراکتر باشد.` })
  name?: string | null;

  @ApiPropertyOptional({
    description: 'Retail/base price (Decimal(12,2), serialized as string)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, {
    message: 'price باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  price?: string;
}
