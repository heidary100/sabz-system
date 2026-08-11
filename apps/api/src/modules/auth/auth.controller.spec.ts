import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUser } from './interfaces/auth-user.interface';
import { REFRESH_TOKEN_COOKIE } from './refresh-token-cookie';
import { RolesService } from './roles/roles.service';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    getOrCreateUserByMobile: jest.Mock;
    markMobileVerified: jest.Mock;
    findUserById: jest.Mock;
  };
  let otpService: { verifyOtp: jest.Mock };
  let tokenService: {
    createSession: jest.Mock;
    refreshSession: jest.Mock;
    revokeSession: jest.Mock;
    refreshLifetimeMs: number;
  };
  let rolesService: { findRoleNamesByUserId: jest.Mock };
  let configService: { get: jest.Mock };
  let res: {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      getOrCreateUserByMobile: jest.fn(),
      markMobileVerified: jest.fn(),
      findUserById: jest.fn(),
    };
    otpService = { verifyOtp: jest.fn() };
    tokenService = {
      createSession: jest.fn(),
      refreshSession: jest.fn(),
      revokeSession: jest.fn(),
      refreshLifetimeMs: 30 * 24 * 60 * 60 * 1000,
    };
    rolesService = { findRoleNamesByUserId: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('development') };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };

    controller = new AuthController(
      authService as unknown as AuthService,
      otpService as unknown as OtpService,
      tokenService as unknown as TokenService,
      rolesService as unknown as RolesService,
      configService as unknown as ConfigService,
    );
  });

  describe('verifyOtp', () => {
    it('issues tokens and sets the refresh token cookie after verifying the mobile number', async () => {
      otpService.verifyOtp.mockResolvedValue(undefined);
      authService.getOrCreateUserByMobile.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'PENDING_OTP',
      });
      authService.markMobileVerified.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'ACTIVE',
      });
      tokenService.createSession.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await controller.verifyOtp(
        { mobile: '+989123456789', code: '123456' },
        '1.2.3.4',
        'device-1',
        res as unknown as Response,
      );

      expect(otpService.verifyOtp).toHaveBeenCalledWith(
        '+989123456789',
        '123456',
      );
      expect(tokenService.createSession).toHaveBeenCalledWith('user-1', {
        ipAddress: '1.2.3.4',
        deviceId: 'device-1',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        'refresh-token',
        expect.objectContaining({ httpOnly: true, secure: false }),
      );
      expect(result).toEqual({
        verified: true,
        user: {
          id: 'user-1',
          mobile: '+989123456789',
          status: 'ACTIVE',
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('sets the refresh token cookie with Secure in production', async () => {
      configService.get.mockReturnValue('production');
      otpService.verifyOtp.mockResolvedValue(undefined);
      authService.getOrCreateUserByMobile.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'PENDING_OTP',
      });
      authService.markMobileVerified.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'ACTIVE',
      });
      tokenService.createSession.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await controller.verifyOtp(
        { mobile: '+989123456789', code: '123456' },
        '1.2.3.4',
        undefined,
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        'refresh-token',
        expect.objectContaining({ httpOnly: true, secure: true }),
      );
    });
  });

  describe('refresh', () => {
    it('refreshes using the refresh token from the request body', async () => {
      tokenService.refreshSession.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await controller.refresh(
        { refreshToken: 'raw-refresh' },
        {} as Request,
        res as unknown as Response,
      );

      expect(tokenService.refreshSession).toHaveBeenCalledWith('raw-refresh');
      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        'new-refresh-token',
        expect.objectContaining({ httpOnly: true, secure: false }),
      );
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('falls back to the refresh token cookie when the body is empty', async () => {
      tokenService.refreshSession.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const req = {
        cookies: { [REFRESH_TOKEN_COOKIE]: 'cookie-refresh' },
      } as unknown as Request;

      const result = await controller.refresh(
        {},
        req,
        res as unknown as Response,
      );

      expect(tokenService.refreshSession).toHaveBeenCalledWith('cookie-refresh');
      expect(result.accessToken).toBe('new-access-token');
    });

    it('throws 401 when no refresh token is provided', async () => {
      const req = { cookies: {} } as unknown as Request;

      await expect(
        controller.refresh({}, req, res as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokenService.refreshSession).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the current session and clears the refresh token cookie', async () => {
      tokenService.revokeSession.mockResolvedValue(undefined);
      const user: AuthUser = {
        userId: 'user-1',
        sessionId: 'session-1',
        mobile: '+989123456789',
      };

      const result = await controller.logout(
        user,
        res as unknown as Response,
      );

      expect(tokenService.revokeSession).toHaveBeenCalledWith('session-1');
      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        expect.objectContaining({ httpOnly: true, secure: false }),
      );
      expect(result).toEqual({ loggedOut: true });
    });
  });

  describe('me', () => {
    it('returns the current user with their roles', async () => {
      authService.findUserById.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'ACTIVE',
      });
      rolesService.findRoleNamesByUserId.mockResolvedValue([
        'OPERATOR',
        'ADMIN',
      ]);

      const user: AuthUser = {
        userId: 'user-1',
        sessionId: 'session-1',
        mobile: '+989123456789',
      };

      const result = await controller.me(user);

      expect(authService.findUserById).toHaveBeenCalledWith('user-1');
      expect(rolesService.findRoleNamesByUserId).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'ACTIVE',
        roles: ['OPERATOR', 'ADMIN'],
      });
    });
  });
});
