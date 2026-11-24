import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ali', description: 'First name' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'نام باید رشته باشد.' })
  @IsNotEmpty({ message: 'نام نمی‌تواند خالی باشد.' })
  @MaxLength(100, { message: 'نام حداکثر ۱۰۰ کاراکتر است.' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Ahmadi', description: 'Last name' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'نام خانوادگی باید رشته باشد.' })
  @IsNotEmpty({ message: 'نام خانوادگی نمی‌تواند خالی باشد.' })
  @MaxLength(100, { message: 'نام خانوادگی حداکثر ۱۰۰ کاراکتر است.' })
  lastName?: string;

  @ApiPropertyOptional({ example: 'Tehran, Iran', description: 'Address' })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'نشانی باید رشته باشد.' })
  @MaxLength(500, { message: 'نشانی حداکثر ۵۰۰ کاراکتر است.' })
  address?: string;

  @ApiPropertyOptional({
    example: '6059926746',
    description:
      'Personal Iranian National ID (کد ملی). Accepts ASCII, Persian and ' +
      'Arabic-Indic digits; stored as 10 ASCII digits. Omit to preserve; ' +
      'empty/null values are rejected.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'کد ملی باید رشته باشد.' })
  @MaxLength(64, { message: 'کد ملی معتبر نیست.' })
  nationalId?: string;
}
