import {
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
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
    service = new OtpService(redis as unknown as RedisService, configService);
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
      expect(result.code).toMatch(/^\d{6}$/);
    });

    it('uses the deterministic development code when NODE_ENV is development', async () => {
      redis.incr.mockResolvedValue(1);
      const config = {
        get: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'development' : undefined,
        ),
      } as unknown as ConfigService;
      service = new OtpService(redis as unknown as RedisService, config);

      const result = await service.requestOtp(mobile);

      expect(result.code).toBe('123456');
    });

    it('returns the code in development but not in production', async () => {
      redis.incr.mockResolvedValue(1);
      const config = {
        get: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'production' : undefined,
        ),
      } as unknown as ConfigService;
      service = new OtpService(redis as unknown as RedisService, config);

      const result = await service.requestOtp(mobile);

      expect(result.code).toBeUndefined();
    });

    it('throws a 429 response when the rate limit is exceeded', async () => {
      redis.incr.mockResolvedValue(6);

      await expect(service.requestOtp(mobile)).rejects.toMatchObject({
        status: 429,
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

    it('throws GoneException when no code is stored', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.verifyOtp(mobile, '123456')).rejects.toThrow(
        GoneException,
      );
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
  });
});
