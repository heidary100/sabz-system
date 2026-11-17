import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function toBoolean(value: unknown): unknown {
  if (value === 'true' || value === true || value === '1') return true;
  if (value === 'false' || value === false || value === '0') return false;
  return value;
}

export class ListMerchMediaQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(50, { message: 'limit باید حداکثر ۵۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Search filename or alt text.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'q باید رشته باشد.' })
  @MaxLength(255, { message: 'q باید حداکثر ۲۵۵ کاراکتر باشد.' })
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by publication eligibility gate.',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isPublished باید مقدار بولی باشد.' })
  isPublished?: boolean;
}
