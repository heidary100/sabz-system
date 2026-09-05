import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ProductCondition, ProductStatus } from '@prisma/client';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DECIMAL_8_3_PATTERN = /^\d{1,5}(?:\.\d{1,3})?$/;
export const DECIMAL_8_2_PATTERN = /^\d{1,6}(?:\.\d{1,2})?$/;

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

export class CreateProductDto {
  @ApiProperty({ example: 'لپتاپ دل XPS 13', description: 'Product name' })
  @IsString({ message: 'name باید رشته باشد.' })
  @IsNotEmpty({ message: 'name الزامی است.' })
  @MaxLength(255, { message: 'name باید حداکثر ۲۵۵ کاراکتر باشد.' })
  name!: string;

  @ApiPropertyOptional({
    description: 'SEO slug. Generated from name when omitted.',
  })
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

  @ApiProperty({ description: 'Brand id' })
  @IsUUID('all', { message: 'brandId باید شناسه UUID معتبر باشد.' })
  brandId!: string;

  @ApiProperty({ description: 'Category id' })
  @IsUUID('all', { message: 'categoryId باید شناسه UUID معتبر باشد.' })
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Warranty text' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'warranty باید رشته باشد.' })
  @MaxLength(255, { message: 'warranty باید حداکثر ۲۵۵ کاراکتر باشد.' })
  warranty?: string;

  @ApiProperty({ enum: ProductCondition, description: 'Product condition' })
  @IsEnum(ProductCondition, { message: 'condition معتبر نیست.' })
  condition!: ProductCondition;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description:
      'Ignored on create: every product starts as DRAFT. Non-DRAFT values are rejected.',
  })
  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status معتبر نیست.' })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Weight in kilograms (Decimal(8,3))' })
  @IsOptional()
  @Matches(DECIMAL_8_3_PATTERN, {
    message: 'weightKg باید عدد اعشاری معتبر با حداکثر ۳ رقم اعشار باشد.',
  })
  weightKg?: string;

  @ApiPropertyOptional({ description: 'Width in centimeters (Decimal(8,2))' })
  @IsOptional()
  @Matches(DECIMAL_8_2_PATTERN, {
    message: 'widthCm باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  widthCm?: string;

  @ApiPropertyOptional({ description: 'Height in centimeters (Decimal(8,2))' })
  @IsOptional()
  @Matches(DECIMAL_8_2_PATTERN, {
    message: 'heightCm باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  heightCm?: string;

  @ApiPropertyOptional({ description: 'Depth in centimeters (Decimal(8,2))' })
  @IsOptional()
  @Matches(DECIMAL_8_2_PATTERN, {
    message: 'depthCm باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  depthCm?: string;

  @ApiPropertyOptional({ description: 'Country of origin' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'originCountry باید رشته باشد.' })
  @MaxLength(100, { message: 'originCountry باید حداکثر ۱۰۰ کاراکتر باشد.' })
  originCountry?: string;
}
