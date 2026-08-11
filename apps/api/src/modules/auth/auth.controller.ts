import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { RefreshTokenDto, RequestOtpDto, UpdateProfileDto, VerifyOtpDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUser } from './interfaces/auth-user.interface';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
  type RefreshTokenCookieOptions,
} from './refresh-token-cookie';
import { RolesService } from './roles/roles.service';
import { OtpService } from './services/otp.service';
import { ProfileService } from './services/profile.service';
import { TokenService } from './services/token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly configService: ConfigService;

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly rolesService: RolesService,
    private readonly profileService: ProfileService,
    configService: ConfigService,
  ) {
    this.configService = configService;
  }

  private get cookieOptions(): RefreshTokenCookieOptions {
    return {
      secure:
        this.configService.get<string>('NODE_ENV', 'development') ===
        'production',
    };
  }

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
    @Res({ passthrough: true }) res?: Response,
  ) {
    await this.otpService.verifyOtp(dto.mobile, dto.code);
    const user = await this.authService.getOrCreateUserByMobile(dto.mobile);
    const verified = await this.authService.markMobileVerified(user);
    const tokens = await this.tokenService.createSession(verified.id, {
      deviceId,
      ipAddress,
    });

    if (res) {
      setRefreshTokenCookie(
        res,
        tokens.refreshToken,
        this.tokenService.refreshLifetimeMs,
        this.cookieOptions,
      );
    }

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
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const refreshToken = dto.refreshToken ?? getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokens = await this.tokenService.refreshSession(refreshToken);
    if (res) {
      setRefreshTokenCookie(
        res,
        tokens.refreshToken,
        this.tokenService.refreshLifetimeMs,
        this.cookieOptions,
      );
    }

    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiResponse({ status: 200, description: 'Session revoked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res?: Response,
  ) {
    await this.tokenService.revokeSession(user.sessionId);
    if (res) {
      clearRefreshTokenCookie(res, this.cookieOptions);
    }
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user with their roles' })
  @ApiResponse({ status: 200, description: 'Current user returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.authService.findUserById(user.userId);
    const roles = await this.rolesService.findRoleNamesByUserId(user.userId);

    return {
      id: profile?.id,
      mobile: profile?.mobile,
      status: profile?.status,
      roles,
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user\'s profile' })
  @ApiResponse({ status: 200, description: 'Profile returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getProfile(@CurrentUser() user: AuthUser) {
    return this.profileService.getProfile(user.userId);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the authenticated user\'s profile' })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 400, description: 'Invalid update data.' })
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
    @Ip() ipAddress?: string,
  ) {
    return this.profileService.updateProfile(user.userId, dto, ipAddress);
  }
}
