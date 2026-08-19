import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
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

export class CreateBrandDto {
  @ApiProperty({ example: 'دل', description: 'Brand name' })
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

  @ApiPropertyOptional({ description: 'Brand description' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'description باید رشته باشد.' })
  @MaxLength(1000, { message: 'description باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the brand is featured.' })
  @IsOptional()
  @IsBoolean({ message: 'isFeatured باید مقدار بولین باشد.' })
  isFeatured?: boolean;
}
