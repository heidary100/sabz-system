import {
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let redis: {
    incr: jest.Mock;
    expire: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    multi: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'NODE_ENV' ? 'development' : undefined,
    ),
  } as unknown as ConfigService;

  const mobile = '+989123456789';

  const exec = jest.fn().mockResolvedValue(null);

  beforeEach(() => {
    exec.mockResolvedValue(null);
    redis = {
      incr: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      multi: jest.fn(() => ({
        set: jest.fn(),
        del: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        exec,
      })),
    };
    auditService = { log: jest.fn() };
    service = new OtpService(
      redis as unknown as RedisService,
      configService,
      auditService as unknown as AuditService,
    );
  });

  describe('requestOtp', () => {
    it('stores a six digit code with a 120 second TTL and resets attempts', async () => {
      redis.incr.mockResolvedValue(1);

      const result = await service.requestOtp(mobile);

      expect(redis.incr).toHaveBeenCalledWith(`auth:otp:rate:${mobile}`);
      expect(redis.expire).toHaveBeenCalledWith(`auth:otp:rate:${mobile}`, 60);
      expect(redis.multi).toHaveBeenCalled();
      expect(exec).toHaveBeenCalled();
      expect(result.sent).toBe(true);
      expect(result.expiresIn).toBe(120);
      expect(result).not.toHaveProperty('code');
      expect(result).not.toHaveProperty('devCode');
    });

    it('stores the deterministic development code when NODE_ENV is development', async () => {
      redis.incr.mockResolvedValue(1);
      const config = {
        get: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'development' : undefined,
        ),
      } as unknown as ConfigService;
      service = new OtpService(
        redis as unknown as RedisService,
        config,
        auditService as unknown as AuditService,
      );

      await service.requestOtp(mobile);

      const pipeline = redis.multi.mock.results[0]?.value as {
        set: jest.Mock;
      };
      expect(pipeline.set).toHaveBeenCalledWith(
        `auth:otp:${mobile}`,
        '123456',
        'EX',
        120,
      );
    });

    it.each(['development', 'test', 'production'])(
      'never returns the OTP code when NODE_ENV is %s',
      async (nodeEnv) => {
        redis.incr.mockResolvedValue(1);
        const config = {
          get: jest.fn((key: string) =>
            key === 'NODE_ENV' ? nodeEnv : undefined,
          ),
        } as unknown as ConfigService;
        service = new OtpService(
          redis as unknown as RedisService,
          config,
          auditService as unknown as AuditService,
        );

        const result = await service.requestOtp(mobile);

        expect(result).not.toHaveProperty('code');
        expect(result).not.toHaveProperty('devCode');
      },
    );

    it('throws a 429 response when the rate limit is exceeded', async () => {
      redis.incr.mockResolvedValue(6);

      await expect(service.requestOtp(mobile)).rejects.toMatchObject({
        status: 429,
      });
    });

    it('audit logs OTP_REQUESTED with the mobile and IP only', async () => {
      redis.incr.mockResolvedValue(1);

      await service.requestOtp(mobile, '1.2.3.4');

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_REQUESTED',
        entity: 'User',
        after: { mobile },
        ipAddress: '1.2.3.4',
      });
      expect(auditService.log.mock.calls[0][0].after).toEqual({ mobile });
    });

    it('does not audit a rate-limited OTP request', async () => {
      redis.incr.mockResolvedValue(6);

      await expect(service.requestOtp(mobile)).rejects.toMatchObject({
        status: 429,
      });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('never fails the OTP request when the audit write fails', async () => {
      redis.incr.mockResolvedValue(1);
      auditService.log.mockRejectedValue(new Error('audit db down'));

      await expect(service.requestOtp(mobile)).resolves.toMatchObject({
        sent: true,
      });
    });
  });

  describe('verifyOtp', () => {
    it('deletes the code and attempts keys on success', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return null;
        }
        return '123456';
      });

      await service.verifyOtp(mobile, '123456');

      expect(redis.multi).toHaveBeenCalled();
      expect(exec).toHaveBeenCalled();
    });

    it('audit logs OTP_VERIFIED with the mobile and IP only', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return null;
        }
        return '123456';
      });

      await service.verifyOtp(mobile, '123456', '1.2.3.4');

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_VERIFIED',
        entity: 'User',
        after: { mobile },
        ipAddress: '1.2.3.4',
      });
      expect(auditService.log.mock.calls[0][0].after).toEqual({ mobile });
    });

    it('throws BadRequestException and increments attempts on a mismatch', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return null;
        }
        return '123456';
      });

      await expect(service.verifyOtp(mobile, '654321')).rejects.toThrow(
        BadRequestException,
      );
      expect(redis.multi).toHaveBeenCalled();
      expect(exec).toHaveBeenCalled();
    });

    it('audit logs OTP_FAILED with an INVALID_CODE reason and never the submitted code', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return null;
        }
        return '123456';
      });

      await expect(service.verifyOtp(mobile, '654321')).rejects.toThrow(
        BadRequestException,
      );

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_FAILED',
        entity: 'User',
        after: { mobile, reason: 'INVALID_CODE' },
        ipAddress: undefined,
      });
      const serialized = JSON.stringify(auditService.log.mock.calls[0][0]);
      expect(serialized).not.toContain('654321');
      expect(serialized).not.toContain('code');
    });

    it('throws GoneException when no code is stored', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.verifyOtp(mobile, '123456')).rejects.toThrow(
        GoneException,
      );
    });

    it('audit logs OTP_FAILED with an EXPIRED reason when no code is stored', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.verifyOtp(mobile, '123456')).rejects.toThrow(
        GoneException,
      );

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_FAILED',
        entity: 'User',
        after: { mobile, reason: 'EXPIRED' },
        ipAddress: undefined,
      });
    });

    it('throws a 429 response after five failed attempts', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return '5';
        }
        return '123456';
      });

      await expect(service.verifyOtp(mobile, '123456')).rejects.toMatchObject({
        status: 429,
      });
      expect(redis.del).toHaveBeenCalledWith(`auth:otp:${mobile}`);
    });

    it('audit logs OTP_FAILED with a MAX_ATTEMPTS reason on attempt exhaustion', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return '5';
        }
        return '123456';
      });

      await expect(service.verifyOtp(mobile, '123456')).rejects.toMatchObject({
        status: 429,
      });

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_FAILED',
        entity: 'User',
        after: { mobile, reason: 'MAX_ATTEMPTS' },
        ipAddress: undefined,
      });
    });

    it('never changes the OTP outcome when the audit write fails', async () => {
      auditService.log.mockRejectedValue(new Error('audit db down'));
      redis.get.mockImplementation((key: string) => {
        if (key === `auth:otp:attempts:${mobile}`) {
          return null;
        }
        return '123456';
      });

      await expect(service.verifyOtp(mobile, '123456')).resolves.toBeUndefined();
    });
  });
});
