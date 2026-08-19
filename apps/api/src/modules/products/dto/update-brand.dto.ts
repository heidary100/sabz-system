import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SLUG_PATTERN } from './create-product.dto';

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

export class UpdateBrandDto {
  @ApiPropertyOptional({ description: 'Brand name' })
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

  @ApiPropertyOptional({
    description: 'Brand description. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'description باید رشته باشد.' })
  @MaxLength(1000, { message: 'description باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Whether the brand is featured.' })
  @IsOptional()
  @IsBoolean({ message: 'isFeatured باید مقدار بولین باشد.' })
  isFeatured?: boolean;
}
