import { ApiPropertyOptional } from '@nestjs/swagger';
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
 * Partial address-book update (SS-233). Every field is optional; `null`
 * clears a nullable column (`label` clears to null via the create-mirror
 * normalize, then explicit null handling in the service). `isDefault: true`
 * promotes (siblings demoted); `isDefault: false` demotes only when this
 * row is currently the default and a sibling default exists — otherwise
 * the user keeps exactly one default.
 */
export class UpdateAddressDto {
  @ApiPropertyOptional({ maxLength: LABEL_MAX })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @IsString({ message: 'برچسب باید رشته باشد.' })
  @MaxLength(LABEL_MAX, { message: `برچسب حداکثر ${LABEL_MAX} نویسه است.` })
  label?: string | null;

  @ApiPropertyOptional({ maxLength: NAME_MAX })
  @IsOptional()
  @IsString({ message: 'نام و نام خانوادگی باید رشته باشد.' })
  @MinLength(2, { message: 'نام و نام خانوادگی حداقل ۲ نویسه است.' })
  @MaxLength(NAME_MAX, { message: `نام و نام خانوادگی حداکثر ${NAME_MAX} نویسه است.` })
  fullName?: string;

  @ApiPropertyOptional({ example: '09123456789' })
  @IsOptional()
  @IsMobilePhone('fa-IR', undefined, {
    message: 'شماره موبایل معتبر نیست.',
  })
  phone?: string;

  @ApiPropertyOptional({ maxLength: CITY_MAX })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @IsString({ message: 'استان باید رشته باشد.' })
  @MaxLength(CITY_MAX, { message: `استان حداکثر ${CITY_MAX} نویسه است.` })
  province?: string | null;

  @ApiPropertyOptional({ maxLength: CITY_MAX })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @IsString({ message: 'شهر باید رشته باشد.' })
  @MaxLength(CITY_MAX, { message: `شهر حداکثر ${CITY_MAX} نویسه است.` })
  city?: string | null;

  @ApiPropertyOptional({ maxLength: ADDRESS_MAX })
  @IsOptional()
  @IsString({ message: 'نشانی باید رشته باشد.' })
  @MinLength(ADDRESS_MIN, { message: `نشانی حداقل ${ADDRESS_MIN} نویسه است.` })
  @MaxLength(ADDRESS_MAX, { message: `نشانی حداکثر ${ADDRESS_MAX} نویسه است.` })
  address?: string;

  @ApiPropertyOptional({ example: '4814938662' })
  @IsOptional()
  @Transform(({ value }) => trimNullable(value))
  @Matches(/^\d{10}$/, { message: 'کد پستی باید ۱۰ رقم باشد.' })
  postalCode?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'isDefault باید بولین باشد.' })
  isDefault?: boolean;
}
