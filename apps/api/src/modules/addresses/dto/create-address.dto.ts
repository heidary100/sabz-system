import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsMobilePhone,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const LABEL_MAX = 50;
const NAME_MAX = 100;
const ADDRESS_MIN = 10;
const ADDRESS_MAX = 500;
const CITY_MAX = 100;

function trimOptional(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

function trimNullable(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value;
}

/**
 * Customer address-book entry input (SS-233). `phone` is an Iranian mobile
 * (server mirrors the storefront `isValidIranianMobile` gate); `postalCode`
 * is the Iranian 10-digit format. Empty strings are normalized to
 * absent/null so "clear the field" and "omit the field" behave alike.
 */
export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'خانه', maxLength: LABEL_MAX })
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString({ message: 'برچسب باید رشته باشد.' })
  @MaxLength(LABEL_MAX, { message: `برچسب حداکثر ${LABEL_MAX} نویسه است.` })
  label?: string;

  @ApiProperty({ example: 'علی احمدی', maxLength: NAME_MAX })
  @IsString({ message: 'نام و نام خانوادگی الزامی است.' })
  @MinLength(2, { message: 'نام و نام خانوادگی حداقل ۲ نویسه است.' })
  @MaxLength(NAME_MAX, { message: `نام و نام خانوادگی حداکثر ${NAME_MAX} نویسه است.` })
  fullName!: string;

  @ApiProperty({ example: '09123456789' })
  @IsMobilePhone('fa-IR', undefined, {
    message: 'شماره موبایل معتبر نیست.',
  })
  phone!: string;

  @ApiPropertyOptional({ example: 'مازندران', maxLength: CITY_MAX })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @IsString({ message: 'استان باید رشته باشد.' })
  @MaxLength(CITY_MAX, { message: `استان حداکثر ${CITY_MAX} نویسه است.` })
  province?: string | null;

  @ApiPropertyOptional({ example: 'ساری', maxLength: CITY_MAX })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @IsString({ message: 'شهر باید رشته باشد.' })
  @MaxLength(CITY_MAX, { message: `شهر حداکثر ${CITY_MAX} نویسه است.` })
  city?: string | null;

  @ApiProperty({ example: 'ساری، بلوار پاسداران، ...', maxLength: ADDRESS_MAX })
  @IsString({ message: 'نشانی الزامی است.' })
  @MinLength(ADDRESS_MIN, { message: `نشانی حداقل ${ADDRESS_MIN} نویسه است.` })
  @MaxLength(ADDRESS_MAX, { message: `نشانی حداکثر ${ADDRESS_MAX} نویسه است.` })
  address!: string;

  @ApiPropertyOptional({ example: '4814938662' })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @Matches(/^\d{10}$/, { message: 'کد پستی باید ۱۰ رقم باشد.' })
  postalCode?: string | null;

  @ApiPropertyOptional({
    description: 'When true, this address becomes the default (siblings demoted).',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDefault باید بولین باشد.' })
  isDefault?: boolean;
}
