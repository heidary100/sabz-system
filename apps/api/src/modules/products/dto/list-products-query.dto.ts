import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class ListProductsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, starting at 1.',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({
    description: 'Page size. Maximum 100.',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit باید حداکثر ۱۰۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Search term matched against name or slug.',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'search باید رشته باشد.' })
  @MaxLength(64, { message: 'search باید حداکثر ۶۴ کاراکتر باشد.' })
  search?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Filter by product status.',
  })
  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status معتبر نیست.' })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Filter by category id.' })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId باید شناسه UUID معتبر باشد.' })
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by brand id.' })
  @IsOptional()
  @IsUUID('all', { message: 'brandId باید شناسه UUID معتبر باشد.' })
  brandId?: string;
}
