import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ProductCondition } from '@prisma/client';
import {
  DECIMAL_8_2_PATTERN,
  DECIMAL_8_3_PATTERN,
  SLUG_PATTERN,
} from './create-product.dto';

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
 * field can be cleared (sets to null) rather than silently ignored.
 */
function normalizeNullableOptional(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  return normalizeOptional(value);
}

/**
 * Update input for a product. The `status` field is intentionally absent:
 * lifecycle transitions (DRAFT → PUBLISHED → ARCHIVED) are only performed
 * through the dedicated publish/archive endpoints. This prevents clients from
 * jumping directly between states or resurrecting an archived product.
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product name' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @MaxLength(255, { message: 'name باید حداکثر ۲۵۵ کاراکتر باشد.' })
  name?: string;

  @ApiPropertyOptional({ description: 'SEO slug' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'slug باید رشته باشد.' })
  @Matches(SLUG_PATTERN, {
    message: 'slug باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.',
  })
  @MaxLength(255, { message: 'slug باید حداکثر ۲۵۵ کاراکتر باشد.' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Short description' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'shortDescription باید رشته باشد.' })
  @MaxLength(500, { message: 'shortDescription باید حداکثر ۵۰۰ کاراکتر باشد.' })
  shortDescription?: string;

  @ApiPropertyOptional({ description: 'Full description' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'description باید رشته باشد.' })
  @MaxLength(50000, { message: 'description باید حداکثر ۵۰۰۰۰ کاراکتر باشد.' })
  description?: string;

  @ApiPropertyOptional({ description: 'Brand id' })
  @IsOptional()
  @IsUUID('all', { message: 'brandId باید شناسه UUID معتبر باشد.' })
  brandId?: string;

  @ApiPropertyOptional({ description: 'Category id' })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId باید شناسه UUID معتبر باشد.' })
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Warranty text' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'warranty باید رشته باشد.' })
  @MaxLength(255, { message: 'warranty باید حداکثر ۲۵۵ کاراکتر باشد.' })
  warranty?: string;

  @ApiPropertyOptional({ enum: ProductCondition, description: 'Product condition' })
  @IsOptional()
  @IsEnum(ProductCondition, { message: 'condition معتبر نیست.' })
  condition?: ProductCondition;

  @ApiPropertyOptional({
    description: 'Weight in kilograms (Decimal(8,3)). Pass null to clear.',
  })
  @IsOptional()
  @Matches(DECIMAL_8_3_PATTERN, {
    message: 'weightKg باید عدد اعشاری معتبر با حداکثر ۳ رقم اعشار باشد.',
  })
  weightKg?: string | null;

  @ApiPropertyOptional({
    description: 'Width in centimeters (Decimal(8,2)). Pass null to clear.',
  })
  @IsOptional()
  @Matches(DECIMAL_8_2_PATTERN, {
    message: 'widthCm باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  widthCm?: string | null;

  @ApiPropertyOptional({
    description: 'Height in centimeters (Decimal(8,2)). Pass null to clear.',
  })
  @IsOptional()
  @Matches(DECIMAL_8_2_PATTERN, {
    message: 'heightCm باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  heightCm?: string | null;

  @ApiPropertyOptional({
    description: 'Depth in centimeters (Decimal(8,2)). Pass null to clear.',
  })
  @IsOptional()
  @Matches(DECIMAL_8_2_PATTERN, {
    message: 'depthCm باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  depthCm?: string | null;

  @ApiPropertyOptional({
    description: 'Country of origin. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'originCountry باید رشته باشد.' })
  @MaxLength(100, { message: 'originCountry باید حداکثر ۱۰۰ کاراکتر باشد.' })
  originCountry?: string | null;
}
