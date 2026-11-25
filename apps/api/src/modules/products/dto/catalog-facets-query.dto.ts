import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CatalogFacetsQueryDto {
  @ApiPropertyOptional({ description: 'Category slug (facets are category-aware)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'دسته‌بندی معتبر نیست.' })
  @MaxLength(200)
  @Matches(SLUG, { message: 'دسته‌بندی معتبر نیست.' })
  category?: string;
}

export class CatalogCompareQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated product slugs (max 4)' })
  @IsString({ message: 'فهرست محصولات معتبر نیست.' })
  @MaxLength(1000)
  slugs!: string;
}
