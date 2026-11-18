import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttributeType, AttributeValueType } from '@prisma/client';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECIMAL = /^-?\d{1,16}(?:\.\d{1,4})?$/;

function trim(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

export class CreateAttributeDto {
  @ApiProperty()
  @IsString({ message: 'نام ویژگی الزامی است.' })
  @MaxLength(120, { message: 'نام ویژگی حداکثر ۱۲۰ کاراکتر است.' })
  name!: string;

  @ApiProperty()
  @IsString({ message: 'slug ویژگی الزامی است.' })
  @Matches(SLUG, {
    message: 'slug باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.',
  })
  @MaxLength(120)
  slug!: string;

  @ApiProperty({ enum: AttributeType })
  @IsEnum(AttributeType, { message: 'نوع ویژگی معتبر نیست.' })
  type!: AttributeType;

  @ApiPropertyOptional({ enum: AttributeValueType })
  @IsOptional()
  @IsEnum(AttributeValueType, { message: 'نوع مقدار ویژگی معتبر نیست.' })
  valueType?: AttributeValueType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(120)
  group?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isComparable?: boolean;
}

export class UpdateAttributeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(SLUG, {
    message: 'slug باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.',
  })
  slug?: string;

  @ApiPropertyOptional({ enum: AttributeType })
  @IsOptional()
  @IsEnum(AttributeType, { message: 'نوع ویژگی معتبر نیست.' })
  type?: AttributeType;

  @ApiPropertyOptional({ enum: AttributeValueType })
  @IsOptional()
  @IsEnum(AttributeValueType, { message: 'نوع مقدار ویژگی معتبر نیست.' })
  valueType?: AttributeValueType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(120)
  group?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isComparable?: boolean;
}

export class CreateAttributeValueDto {
  @ApiProperty()
  @IsString({ message: 'مقدار ویژگی الزامی است.' })
  @MaxLength(255)
  value!: string;

  @ApiProperty()
  @Matches(SLUG, {
    message: 'slug مقدار باید فقط شامل حروف انگلیسی کوچک، اعداد و خط تیره باشد.',
  })
  @MaxLength(120)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(255)
  normalizedValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DECIMAL, { message: 'مقدار عددی معتبر نیست.' })
  numericValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAttributeValueDto extends CreateAttributeValueDto {}

export class CategoryAttributeItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'شناسه ویژگی معتبر نیست.' })
  attributeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isComparable?: boolean;
}

export class SetCategoryAttributesDto {
  @ApiProperty({ type: [CategoryAttributeItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CategoryAttributeItemDto)
  attributes!: CategoryAttributeItemDto[];
}

export class ProductAttributeValueItemDto {
  @ApiProperty()
  @IsUUID('4', { message: 'شناسه ویژگی معتبر نیست.' })
  attributeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'شناسه گزینه معتبر نیست.' })
  optionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true, message: 'شناسه گزینه معتبر نیست.' })
  optionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  valueText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DECIMAL, { message: 'مقدار عددی معتبر نیست.' })
  valueNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  valueBoolean?: boolean;
}

export class SetProductAttributesDto {
  @ApiProperty({ type: [ProductAttributeValueItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeValueItemDto)
  values!: ProductAttributeValueItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clearIncompatible?: boolean;
}

export class BulkAttributeOperationDto {
  @ApiProperty({ enum: ['SET', 'CLEAR'] })
  @IsEnum(['SET', 'CLEAR'], { message: 'نوع عملیات معتبر نیست.' })
  kind!: 'SET' | 'CLEAR';

  @ApiProperty()
  @IsUUID('4', { message: 'شناسه ویژگی معتبر نیست.' })
  attributeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'شناسه گزینه معتبر نیست.' })
  optionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  valueText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DECIMAL, { message: 'مقدار عددی معتبر نیست.' })
  valueNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  valueBoolean?: boolean;
}

export class BulkAttributeProductRefDto {
  @ApiProperty()
  @IsUUID('4', { message: 'شناسه محصول معتبر نیست.' })
  id!: string;

  @ApiProperty({ description: 'Catalog-row optimistic concurrency token' })
  @IsString({ message: 'زمان آخرین تغییر محصول معتبر نیست.' })
  @IsISO8601({}, { message: 'زمان آخرین تغییر محصول معتبر نیست.' })
  updatedAt!: string;
}

export class BulkAttributePreviewDto {
  @ApiProperty({ type: [BulkAttributeProductRefDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkAttributeProductRefDto)
  products!: BulkAttributeProductRefDto[];

  @ApiProperty({ type: [BulkAttributeOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BulkAttributeOperationDto)
  operations!: BulkAttributeOperationDto[];
}

export class BulkAttributeApplyDto extends BulkAttributePreviewDto {
  @ApiProperty()
  @IsString({ message: 'توکن پیش‌نمایش الزامی است.' })
  @MaxLength(128)
  previewToken!: string;
}
