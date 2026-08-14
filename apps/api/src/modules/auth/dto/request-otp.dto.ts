import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { normalizeMobile } from '../utils/mobile.util';

export const IRANIAN_MOBILE_REGEX = /^(\+98|0)9\d{9}$/;

export class RequestOtpDto {
  @ApiProperty({ example: '+989123456789', description: 'Iranian mobile number' })
  @Transform(({ value }) => normalizeMobile(value))
  @Matches(IRANIAN_MOBILE_REGEX, {
    message: 'mobile must be a valid Iranian mobile number',
  })
  mobile!: string;
}
