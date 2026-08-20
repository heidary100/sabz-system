import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-TEH-01', description: 'Unique warehouse code' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'code باید رشته باشد.' })
  @IsNotEmpty({ message: 'code الزامی است.' })
  @MaxLength(100, { message: 'code باید حداکثر ۱۰۰ کاراکتر باشد.' })
  code!: string;

  @ApiProperty({ example: 'انبار تهران', description: 'Warehouse name' })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'name باید رشته باشد.' })
  @IsNotEmpty({ message: 'name الزامی است.' })
  @MaxLength(255, { message: 'name باید حداکثر ۲۵۵ کاراکتر باشد.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Warehouse address' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'address باید رشته باشد.' })
  @MaxLength(1000, { message: 'address باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  address?: string;

  @ApiPropertyOptional({ description: 'Warehouse contact person name' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'contactName باید رشته باشد.' })
  @MaxLength(255, { message: 'contactName باید حداکثر ۲۵۵ کاراکتر باشد.' })
  contactName?: string;

  @ApiPropertyOptional({ description: 'Warehouse contact phone' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'contactPhone باید رشته باشد.' })
  @MaxLength(100, { message: 'contactPhone باید حداکثر ۱۰۰ کاراکتر باشد.' })
  contactPhone?: string;
}