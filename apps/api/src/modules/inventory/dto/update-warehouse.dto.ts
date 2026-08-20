import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ description: 'Unique warehouse code' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'code باید رشته باشد.' })
  @IsNotEmpty({ message: 'code نمیتواند خالی باشد.' })
  @MaxLength(100, { message: 'code باید حداکثر ۱۰۰ کاراکتر باشد.' })
  code?: string;

  @ApiPropertyOptional({ description: 'Warehouse name' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @IsNotEmpty({ message: 'name نمیتواند خالی باشد.' })
  @MaxLength(255, { message: 'name باید حداکثر ۲۵۵ کاراکتر باشد.' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Warehouse address. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'address باید رشته باشد.' })
  @MaxLength(1000, { message: 'address باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  address?: string | null;

  @ApiPropertyOptional({
    description: 'Warehouse contact person name. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'contactName باید رشته باشد.' })
  @MaxLength(255, { message: 'contactName باید حداکثر ۲۵۵ کاراکتر باشد.' })
  contactName?: string | null;

  @ApiPropertyOptional({
    description: 'Warehouse contact phone. Pass null to clear.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsString({ message: 'contactPhone باید رشته باشد.' })
  @MaxLength(100, { message: 'contactPhone باید حداکثر ۱۰۰ کاراکتر باشد.' })
  contactPhone?: string | null;
}