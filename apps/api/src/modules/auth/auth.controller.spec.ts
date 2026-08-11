import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUser } from './interfaces/auth-user.interface';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    getOrCreateUserByMobile: jest.Mock;
    markMobileVerified: jest.Mock;
  };
  let otpService: { verifyOtp: jest.Mock };
  let tokenService: {
    createSession: jest.Mock;
    refreshSession: jest.Mock;
    revokeSession: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      getOrCreateUserByMobile: jest.fn(),
      markMobileVerified: jest.fn(),
    };
    otpService = { verifyOtp: jest.fn() };
    tokenService = {
      createSession: jest.fn(),
      refreshSession: jest.fn(),
      revokeSession: jest.fn(),
    };

    controller = new AuthController(
      authService as unknown as AuthService,
      otpService as unknown as OtpService,
      tokenService as unknown as TokenService,
    );
  });

  describe('verifyOtp', () => {
    it('issues tokens after verifying and activating the mobile number', async () => {
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
      );

      expect(otpService.verifyOtp).toHaveBeenCalledWith(
        '+989123456789',
        '123456',
      );
      expect(tokenService.createSession).toHaveBeenCalledWith('user-1', {
        ipAddress: '1.2.3.4',
        deviceId: 'device-1',
      });
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
  });

  describe('refresh', () => {
    it('returns the new token pair from the token service', async () => {
      tokenService.refreshSession.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await controller.refresh({ refreshToken: 'raw-refresh' });

      expect(tokenService.refreshSession).toHaveBeenCalledWith('raw-refresh');
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });
  });

  describe('logout', () => {
    it('revokes the current session', async () => {
      tokenService.revokeSession.mockResolvedValue(undefined);
      const user: AuthUser = {
        userId: 'user-1',
        sessionId: 'session-1',
        mobile: '+989123456789',
      };

      const result = await controller.logout(user);

      expect(tokenService.revokeSession).toHaveBeenCalledWith('session-1');
      expect(result).toEqual({ loggedOut: true });
    });
  });
});
