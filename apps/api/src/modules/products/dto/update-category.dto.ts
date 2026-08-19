import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
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

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Category name' })
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
    description: 'Parent category id. Pass null to move to root.',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('all', { message: 'parentId باید شناسه UUID معتبر باشد.' })
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'Display sort order (non-negative).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder باید عدد صحیح باشد.' })
  @Min(0, { message: 'sortOrder باید حداقل ۰ باشد.' })
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Whether the category is visible.' })
  @IsOptional()
  @IsBoolean({ message: 'isVisible باید مقدار بولین باشد.' })
  isVisible?: boolean;
}
