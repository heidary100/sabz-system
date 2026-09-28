import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BlogStatus } from '@prisma/client';

/** Shared slug rule (same as catalog brands/categories): lowercase latin, digits, hyphens. */
export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BLOG_SLUG_MESSAGE =
  'slug باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.';

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

export class CreateBlogCategoryDto {
  @ApiProperty({ example: 'راهنمای خرید', description: 'Category name (Persian)' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @IsNotEmpty({ message: 'name الزامی است.' })
  @MaxLength(255, { message: 'name باید حداکثر ۲۵۵ کاراکتر باشد.' })
  name!: string;

  @ApiPropertyOptional({ description: 'SEO slug. Generated from name when omitted.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'slug باید رشته باشد.' })
  @Matches(BLOG_SLUG_PATTERN, { message: BLOG_SLUG_MESSAGE })
  @MaxLength(255, { message: 'slug باید حداکثر ۲۵۵ کاراکتر باشد.' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Optional category description.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'description باید رشته باشد.' })
  @MaxLength(2000, { message: 'description باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  description?: string;

  @ApiPropertyOptional({ description: 'Display sort order (non-negative).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder باید عدد صحیح باشد.' })
  @Min(0, { message: 'sortOrder باید حداقل ۰ باشد.' })
  sortOrder?: number;
}

export class UpdateBlogCategoryDto {
  @ApiPropertyOptional({ example: 'راهنمای خرید' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @IsNotEmpty({ message: 'name نباید خالی باشد.' })
  @MaxLength(255, { message: 'name باید حداکثر ۲۵۵ کاراکتر باشد.' })
  name?: string;

  @ApiPropertyOptional({ description: 'SEO slug.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'slug باید رشته باشد.' })
  @Matches(BLOG_SLUG_PATTERN, { message: BLOG_SLUG_MESSAGE })
  @MaxLength(255, { message: 'slug باید حداکثر ۲۵۵ کاراکتر باشد.' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Optional category description (null clears).' })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'description باید رشته باشد.' })
  @MaxLength(2000, { message: 'description باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Display sort order (non-negative).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder باید عدد صحیح باشد.' })
  @Min(0, { message: 'sortOrder باید حداقل ۰ باشد.' })
  sortOrder?: number;
}

export class CreateBlogPostDto {
  @ApiProperty({ example: 'راهنمای خرید پاوربانک', description: 'Article title (Persian)' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'title باید رشته باشد.' })
  @IsNotEmpty({ message: 'title الزامی است.' })
  @MaxLength(255, { message: 'title باید حداکثر ۲۵۵ کاراکتر باشد.' })
  title!: string;

  @ApiPropertyOptional({ description: 'SEO slug. Generated from title when omitted.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'slug باید رشته باشد.' })
  @Matches(BLOG_SLUG_PATTERN, { message: BLOG_SLUG_MESSAGE })
  @MaxLength(255, { message: 'slug باید حداکثر ۲۵۵ کاراکتر باشد.' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Owning category id (omit for uncategorized).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsUUID('4', { message: 'categoryId باید یک شناسه معتبر باشد.' })
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Short teaser shown on cards (plain text).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'excerpt باید رشته باشد.' })
  @MaxLength(2000, { message: 'excerpt باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  excerpt?: string;

  @ApiProperty({ description: 'Article body HTML (allowlist-sanitized before storage).' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'content باید رشته باشد.' })
  @IsNotEmpty({ message: 'content الزامی است.' })
  content!: string;

  @ApiPropertyOptional({ description: 'Cover image URL (absolute https or API-relative path).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'coverImageUrl باید رشته باشد.' })
  @MaxLength(2000, { message: 'coverImageUrl باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  coverImageUrl?: string;

  @ApiPropertyOptional({ example: 'تحریریه سبز سیستم', description: 'Author byline (display string).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'authorName باید رشته باشد.' })
  @MaxLength(255, { message: 'authorName باید حداکثر ۲۵۵ کاراکتر باشد.' })
  authorName?: string;

  @ApiPropertyOptional({ description: 'SEO title (falls back to title).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'metaTitle باید رشته باشد.' })
  @MaxLength(255, { message: 'metaTitle باید حداکثر ۲۵۵ کاراکتر باشد.' })
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'SEO description (falls back to excerpt/body text).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'metaDescription باید رشته باشد.' })
  @MaxLength(500, { message: 'metaDescription باید حداکثر ۵۰۰ کاراکتر باشد.' })
  metaDescription?: string;

  @ApiPropertyOptional({ enum: BlogStatus, default: BlogStatus.DRAFT })
  @IsOptional()
  @IsEnum(BlogStatus, { message: 'status نامعتبر است.' })
  status?: BlogStatus;

  @ApiPropertyOptional({ description: 'ISO publish timestamp; auto-set on publish when omitted.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'publishedAt باید رشته تاریخ معتبر باشد.' })
  publishedAt?: string;
}

export class UpdateBlogPostDto {
  @ApiPropertyOptional({ example: 'راهنمای خرید پاوربانک' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'title باید رشته باشد.' })
  @IsNotEmpty({ message: 'title نباید خالی باشد.' })
  @MaxLength(255, { message: 'title باید حداکثر ۲۵۵ کاراکتر باشد.' })
  title?: string;

  @ApiPropertyOptional({ description: 'SEO slug.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'slug باید رشته باشد.' })
  @Matches(BLOG_SLUG_PATTERN, { message: BLOG_SLUG_MESSAGE })
  @MaxLength(255, { message: 'slug باید حداکثر ۲۵۵ کاراکتر باشد.' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Owning category id (null detaches).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('4', { message: 'categoryId باید یک شناسه معتبر باشد.' })
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Short teaser (null clears).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'excerpt باید رشته باشد.' })
  @MaxLength(2000, { message: 'excerpt باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  excerpt?: string | null;

  @ApiPropertyOptional({ description: 'Article body HTML (sanitized before storage).' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'content باید رشته باشد.' })
  @IsNotEmpty({ message: 'content نباید خالی باشد.' })
  content?: string;

  @ApiPropertyOptional({ description: 'Cover image URL (null clears).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'coverImageUrl باید رشته باشد.' })
  @MaxLength(2000, { message: 'coverImageUrl باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  coverImageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Author byline (null clears).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'authorName باید رشته باشد.' })
  @MaxLength(255, { message: 'authorName باید حداکثر ۲۵۵ کاراکتر باشد.' })
  authorName?: string | null;

  @ApiPropertyOptional({ description: 'SEO title (null clears).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'metaTitle باید رشته باشد.' })
  @MaxLength(255, { message: 'metaTitle باید حداکثر ۲۵۵ کاراکتر باشد.' })
  metaTitle?: string | null;

  @ApiPropertyOptional({ description: 'SEO description (null clears).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'metaDescription باید رشته باشد.' })
  @MaxLength(500, { message: 'metaDescription باید حداکثر ۵۰۰ کاراکتر باشد.' })
  metaDescription?: string | null;

  @ApiPropertyOptional({ enum: BlogStatus })
  @IsOptional()
  @IsEnum(BlogStatus, { message: 'status نامعتبر است.' })
  status?: BlogStatus;

  @ApiPropertyOptional({ description: 'ISO publish timestamp (null clears).', nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'publishedAt باید رشته تاریخ معتبر باشد.' })
  publishedAt?: string | null;
}

export class ListBlogPostsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(50, { message: 'limit حداکثر ۵۰ است.' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by category slug.' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'category باید رشته باشد.' })
  @MaxLength(255, { message: 'category باید حداکثر ۲۵۵ کاراکتر باشد.' })
  category?: string;
}
