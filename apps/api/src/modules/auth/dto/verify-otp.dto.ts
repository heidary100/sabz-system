import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { IRANIAN_MOBILE_REGEX } from './request-otp.dto';

export class VerifyOtpDto {
  @ApiProperty({ example: '+989123456789', description: 'Iranian mobile number' })
  @Matches(IRANIAN_MOBILE_REGEX, {
    message: 'mobile must be a valid Iranian mobile number',
  })
  mobile!: string;

  @ApiProperty({ example: '123456', description: 'Six digit OTP code' })
  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  @Matches(/^\d+$/, { message: 'code must contain only digits' })
  code!: string;
}
