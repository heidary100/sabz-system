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
    get: jest.Mock;
    del: jest.Mock;
    multi: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let exec: jest.Mock;
  let pipelines: Array<{
    set: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
    exec: jest.Mock;
  }>;

  const configService = {
    get: jest.fn((key: string) =>
      key === 'NODE_ENV' ? 'development' : undefined,
    ),
  } as unknown as ConfigService;

  const mobile = '+989123456789';
  const ip = '1.2.3.4';

  beforeEach(() => {
    pipelines = [];
    exec = jest.fn().mockResolvedValue([]);
    redis = {
      get: jest.fn(),
      del: jest.fn(),
      multi: jest.fn(() => {
        const pipeline = {
          set: jest.fn(),
          del: jest.fn(),
          incr: jest.fn(),
          expire: jest.fn(),
          exec,
        };
        pipelines.push(pipeline);
        return pipeline;
      }),
    };
    auditService = { log: jest.fn() };
    service = new OtpService(
      redis as unknown as RedisService,
      configService,
      auditService as unknown as AuditService,
    );
  });

  describe('requestOtp', () => {
    it('stores a six digit code with a 120 second TTL and resets per-code attempts', async () => {
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);

      const result = await service.requestOtp(mobile);

      expect(pipelines[0]!.incr).toHaveBeenCalledWith(`auth:otp:rate:${mobile}`);
      expect(pipelines[0]!.expire).toHaveBeenCalledWith(
        `auth:otp:rate:${mobile}`,
        60,
      );
      expect(pipelines[1]!.set).toHaveBeenCalledWith(
        `auth:otp:${mobile}`,
        '123456',
        'EX',
        120,
      );
      expect(pipelines[1]!.del).toHaveBeenCalledWith(
        `auth:otp:attempts:${mobile}`,
      );
      expect(result.sent).toBe(true);
      expect(result.expiresIn).toBe(120);
      expect(result).not.toHaveProperty('code');
      expect(result).not.toHaveProperty('devCode');
    });

    it('stores the deterministic development code when NODE_ENV is development', async () => {
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);
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

      expect(pipelines[1]!.set).toHaveBeenCalledWith(
        `auth:otp:${mobile}`,
        '123456',
        'EX',
        120,
      );
    });

    it.each(['development', 'test', 'production'])(
      'never returns the OTP code when NODE_ENV is %s',
      async (nodeEnv) => {
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

    it('throws a 429 response when the per-mobile request limit is exceeded', async () => {
      exec.mockResolvedValueOnce([
        [null, 4],
        [null, 1],
      ]);

      await expect(service.requestOtp(mobile)).rejects.toMatchObject({
        status: 429,
      });
    });

    it('throws a 429 response when the per-IP request limit is exceeded', async () => {
      exec
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 16],
          [null, 1],
        ]);

      await expect(service.requestOtp(mobile, ip)).rejects.toMatchObject({
        status: 429,
      });
    });

    it('enforces the per-IP request limit across different mobile numbers', async () => {
      exec
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 16],
          [null, 1],
        ]);

      await expect(service.requestOtp('+989000000001', ip)).rejects.toMatchObject(
        {
          status: 429,
        },
      );
      expect(pipelines[1]!.incr).toHaveBeenCalledWith(`auth:otp:rate:ip:${ip}`);
    });

    it('does not consume the shared per-IP budget when the per-mobile limit blocks the request', async () => {
      exec.mockResolvedValueOnce([
        [null, 4],
        [null, 1],
      ]);

      await expect(service.requestOtp(mobile, ip)).rejects.toMatchObject({
        status: 429,
      });
      expect(pipelines[0]!.incr).toHaveBeenCalledWith(
        `auth:otp:rate:${mobile}`,
      );
      expect(pipelines[0]!.incr).not.toHaveBeenCalledWith(
        `auth:otp:rate:ip:${ip}`,
      );
      expect(pipelines).toHaveLength(1);
    });

    it('skips the per-IP request limit when no IP address is available', async () => {
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);

      await service.requestOtp(mobile);

      expect(pipelines[0]!.incr).toHaveBeenCalledTimes(1);
    });

    it('resets the per-code attempt counter but never the cross-code failure window', async () => {
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);

      await service.requestOtp(mobile);

      const delCalls = pipelines.flatMap((p) => p.del.mock.calls);
      expect(delCalls).toContainEqual([`auth:otp:attempts:${mobile}`]);
      expect(delCalls).not.toContainEqual([`auth:otp:fail:${mobile}`]);
    });

    it('audit logs OTP_REQUESTED with the mobile and IP only', async () => {
      exec
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ]);

      await service.requestOtp(mobile, ip);

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_REQUESTED',
        entity: 'User',
        after: { mobile },
        ipAddress: ip,
      });
      expect(auditService.log.mock.calls[0][0].after).toEqual({ mobile });
    });

    it('does not audit a rate-limited OTP request', async () => {
      exec.mockResolvedValueOnce([
        [null, 4],
        [null, 1],
      ]);

      await expect(service.requestOtp(mobile)).rejects.toMatchObject({
        status: 429,
      });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('never fails the OTP request when the audit write fails', async () => {
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);
      auditService.log.mockRejectedValue(new Error('audit db down'));

      await expect(service.requestOtp(mobile)).resolves.toMatchObject({
        sent: true,
      });
    });
  });

  describe('verifyOtp', () => {
    const withStoredCode = (code = '123456') => {
      redis.get.mockResolvedValue(code);
    };

    it('deletes the code, per-code attempts and cross-code failure keys on success', async () => {
      withStoredCode();

      await service.verifyOtp(mobile, '123456');

      const delCalls = pipelines.flatMap((p) => p.del.mock.calls);
      expect(delCalls).toContainEqual([`auth:otp:${mobile}`]);
      expect(delCalls).toContainEqual([`auth:otp:attempts:${mobile}`]);
      expect(delCalls).toContainEqual([`auth:otp:fail:${mobile}`]);
    });

    it('clears the per-IP failure window on success when an IP is present', async () => {
      withStoredCode();

      await service.verifyOtp(mobile, '123456', ip);

      const delCalls = pipelines.flatMap((p) => p.del.mock.calls);
      expect(delCalls).toContainEqual([`auth:otp:fail:ip:${ip}`]);
    });

    it('audit logs OTP_VERIFIED with the mobile and IP only', async () => {
      withStoredCode();

      await service.verifyOtp(mobile, '123456', ip);

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_VERIFIED',
        entity: 'User',
        after: { mobile },
        ipAddress: ip,
      });
    });

    it('throws BadRequestException and increments the counters on a mismatch', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321', ip)).rejects.toThrow(
        BadRequestException,
      );

      expect(pipelines[0]!.incr).toHaveBeenCalledWith(
        `auth:otp:attempts:${mobile}`,
      );
      expect(pipelines[0]!.incr).toHaveBeenCalledWith(
        `auth:otp:fail:${mobile}`,
      );
      expect(pipelines[0]!.incr).toHaveBeenCalledWith(`auth:otp:fail:ip:${ip}`);
      expect(pipelines[0]!.expire).toHaveBeenCalledWith(
        `auth:otp:attempts:${mobile}`,
        120,
      );
      expect(pipelines[0]!.expire).toHaveBeenCalledWith(
        `auth:otp:fail:${mobile}`,
        600,
      );
      expect(pipelines[0]!.expire).toHaveBeenCalledWith(
        `auth:otp:fail:ip:${ip}`,
        600,
      );
    });

    it('audit logs OTP_FAILED with an INVALID_CODE reason and never the submitted code', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);

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

    it('does not count an expired OTP as a failed verification attempt', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.verifyOtp(mobile, '123456')).rejects.toThrow(
        GoneException,
      );

      expect(redis.multi).not.toHaveBeenCalled();
    });

    it('throws a 429 response once the per-code attempt limit is exceeded', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 4],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321')).rejects.toMatchObject({
        status: 429,
      });
      expect(redis.del).toHaveBeenCalledWith(`auth:otp:${mobile}`);
    });

    it('audit logs OTP_FAILED with a MAX_ATTEMPTS reason on attempt exhaustion', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 4],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321')).rejects.toMatchObject({
        status: 429,
      });

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_FAILED',
        entity: 'User',
        after: { mobile, reason: 'MAX_ATTEMPTS' },
        ipAddress: undefined,
      });
    });

    it('throws a 429 when the cross-code failure window is exhausted', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
        [null, 6],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321', ip)).rejects.toMatchObject(
        {
          status: 429,
        },
      );
      expect(redis.del).toHaveBeenCalledWith(`auth:otp:${mobile}`);
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'OTP_FAILED',
        entity: 'User',
        after: { mobile, reason: 'MAX_ATTEMPTS' },
        ipAddress: ip,
      });
    });

    it('throws a 429 when the per-IP failure window is exhausted', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 11],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321', ip)).rejects.toMatchObject(
        {
          status: 429,
        },
      );
      expect(redis.del).toHaveBeenCalledWith(`auth:otp:${mobile}`);
    });

    it('enforces the cross-code failure window regardless of the client IP', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
        [null, 6],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321')).rejects.toMatchObject({
        status: 429,
      });
    });

    it('skips the per-IP failure counters when no IP address is available', async () => {
      withStoredCode();
      exec.mockResolvedValueOnce([
        [null, 1],
        [null, 1],
      ]);

      await expect(service.verifyOtp(mobile, '654321')).rejects.toThrow(
        BadRequestException,
      );

      const incrCalls = pipelines[0]!.incr.mock.calls.map((call) => call[0]);
      expect(incrCalls).not.toContain(`auth:otp:fail:ip:${ip}`);
      expect(pipelines[0]!.incr).toHaveBeenCalledTimes(2);
    });

    it('bounds interleaved guesses: counters are incremented before limits are enforced', async () => {
      withStoredCode();
      exec
        .mockResolvedValueOnce([
          [null, 2],
          [null, 1],
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 3],
          [null, 1],
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 4],
          [null, 1],
          [null, 1],
          [null, 1],
        ]);

      await expect(service.verifyOtp(mobile, '654321')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(mobile, '654322')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(mobile, '654323')).rejects.toMatchObject({
        status: 429,
      });
    });

    it('allows a correct code even after failed guesses consumed the per-code budget', async () => {
      withStoredCode();
      exec
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 2],
          [null, 1],
          [null, 1],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 3],
          [null, 1],
          [null, 1],
          [null, 1],
        ]);

      await expect(service.verifyOtp(mobile, '654321')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(mobile, '654322')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(mobile, '654323')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.verifyOtp(mobile, '123456')).resolves.toBeUndefined();
    });

    it('never changes the OTP outcome when the audit write fails', async () => {
      auditService.log.mockRejectedValue(new Error('audit db down'));
      withStoredCode();

      await expect(service.verifyOtp(mobile, '123456')).resolves.toBeUndefined();
    });
  });
});
