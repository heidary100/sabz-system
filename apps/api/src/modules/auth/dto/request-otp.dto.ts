import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export const IRANIAN_MOBILE_REGEX = /^(\+98|0)9\d{9}$/;

export class RequestOtpDto {
  @ApiProperty({ example: '+989123456789', description: 'Iranian mobile number' })
  @Matches(IRANIAN_MOBILE_REGEX, {
    message: 'mobile must be a valid Iranian mobile number',
  })
  mobile!: string;
}
