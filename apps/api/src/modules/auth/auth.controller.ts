import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { RefreshTokenDto, RequestOtpDto, VerifyOtpDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUser } from './interfaces/auth-user.interface';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
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
  @ApiOperation({ summary: 'Verify an OTP, activate the number, and issue tokens' })
  @ApiResponse({ status: 200, description: 'OTP verified and tokens issued.' })
  @ApiResponse({ status: 400, description: 'Invalid OTP code.' })
  @ApiResponse({ status: 410, description: 'OTP expired.' })
  @ApiResponse({ status: 429, description: 'Too many attempts.' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ipAddress: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    await this.otpService.verifyOtp(dto.mobile, dto.code);
    const user = await this.authService.getOrCreateUserByMobile(dto.mobile);
    const verified = await this.authService.markMobileVerified(user);
    const tokens = await this.tokenService.createSession(verified.id, {
      deviceId,
      ipAddress,
    });

    return {
      verified: true,
      user: {
        id: verified.id,
        mobile: verified.mobile,
        status: verified.status,
      },
      ...tokens,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiResponse({ status: 200, description: 'New token pair issued.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.tokenService.refreshSession(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiResponse({ status: 200, description: 'Session revoked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logout(@CurrentUser() user: AuthUser) {
    await this.tokenService.revokeSession(user.sessionId);
    return { loggedOut: true };
  }
}
