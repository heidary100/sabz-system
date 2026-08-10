import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto } from './dto';
import { OtpService } from './services/otp.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an OTP for the given mobile number' })
  @ApiResponse({ status: 200, description: 'OTP sent.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto.mobile);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an OTP and activate the mobile number' })
  @ApiResponse({ status: 200, description: 'OTP verified.' })
  @ApiResponse({ status: 400, description: 'Invalid OTP code.' })
  @ApiResponse({ status: 410, description: 'OTP expired.' })
  @ApiResponse({ status: 429, description: 'Too many attempts.' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.mobile, dto.code);
    const user = await this.authService.getOrCreateUserByMobile(dto.mobile);
    const verified = await this.authService.markMobileVerified(user);

    return {
      verified: true,
      user: {
        id: verified.id,
        mobile: verified.mobile,
        status: verified.status,
      },
    };
  }
}
