import { randomInt, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';

const OTP_FAILED_REASON_INVALID_CODE = 'INVALID_CODE';
const OTP_FAILED_REASON_EXPIRED = 'EXPIRED';
const OTP_FAILED_REASON_MAX_ATTEMPTS = 'MAX_ATTEMPTS';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 120;
/**
 * Failed verification attempts allowed for a single issued OTP code.
 * Deliberately below the cross-code window (MAX_FAILURES) so a code is
 * invalidated early enough that "request a new OTP" is an accurate and
 * usable recovery path, while the window remains the hard brute-force bound.
 */
const MAX_VERIFICATION_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_SECONDS = 60;
/**
 * OTP requests allowed per mobile number per rolling 60-second window.
 */
const RATE_LIMIT_MAX_REQUESTS = 3;
/**
 * OTP requests allowed per client IP per rolling 60-second window,
 * across all mobile numbers.
 */
const IP_RATE_LIMIT_MAX_REQUESTS = 15;
const FAILURE_WINDOW_SECONDS = 600;
/**
 * Failed verification attempts allowed per mobile number per rolling
 * 10-minute window, across all OTP requests. Requesting a new OTP never
 * resets this counter.
 */
const MAX_FAILURES = 5;
/**
 * Failed verification attempts allowed per client IP per rolling
 * 10-minute window, across all mobile numbers.
 */
const IP_MAX_FAILURES = 10;

/**
 * Development-only deterministic OTP.
 *
 * Deliberately not configurable: it activates exclusively when
 * NODE_ENV === 'development' (a hard-coded gate), so it cannot be switched
 * on in production through any environment variable.
 */
const DEV_OTP_CODE = '123456';

function otpKey(mobile: string): string {
  return `auth:otp:${mobile}`;
}

/**
 * Attempt counter scoped to the currently issued OTP. Reset whenever a new
 * OTP is requested: a fresh code gets a fresh budget of failed attempts.
 */
function attemptsKey(mobile: string): string {
  return `auth:otp:attempts:${mobile}`;
}

/**
 * Cross-code failure window for a mobile. Never reset by requestOtp; cleared
 * only on successful verification or when the rolling window expires.
 */
function failureKey(mobile: string): string {
  return `auth:otp:fail:${mobile}`;
}

function rateLimitKey(mobile: string): string {
  return `auth:otp:rate:${mobile}`;
}

function ipRateLimitKey(ip: string): string {
  return `auth:otp:rate:ip:${ip}`;
}

function ipFailureKey(ip: string): string {
  return `auth:otp:fail:ip:${ip}`;
}

export interface RequestOtpResult {
  sent: boolean;
  expiresIn: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly isDevelopment: boolean;

  constructor(
    private readonly redis: RedisService,
    configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const nodeEnv = configService.get<string>('NODE_ENV');
    this.isDevelopment = nodeEnv === 'development';
  }

  async requestOtp(mobile: string, ipAddress?: string): Promise<RequestOtpResult> {
    const mobilePipeline = this.redis.multi();
    mobilePipeline.incr(rateLimitKey(mobile));
    mobilePipeline.expire(rateLimitKey(mobile), RATE_LIMIT_WINDOW_SECONDS);
    const mobileResults = (await mobilePipeline.exec()) ?? [];

    if (this.resultCount(mobileResults[0]) > RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        'Too many OTP requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ipAddress) {
      const ipPipeline = this.redis.multi();
      ipPipeline.incr(ipRateLimitKey(ipAddress));
      ipPipeline.expire(ipRateLimitKey(ipAddress), RATE_LIMIT_WINDOW_SECONDS);
      const ipResults = (await ipPipeline.exec()) ?? [];

      if (this.resultCount(ipResults[0]) > IP_RATE_LIMIT_MAX_REQUESTS) {
        throw new HttpException(
          'Too many OTP requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.isDevelopment ? DEV_OTP_CODE : this.generateCode();
    const codePipeline = this.redis.multi();
    codePipeline.set(otpKey(mobile), code, 'EX', OTP_TTL_SECONDS);
    codePipeline.del(attemptsKey(mobile));
    await codePipeline.exec();

    this.logger.log(`OTP requested for mobile ${mobile}`);
    await this.audit('OTP_REQUESTED', mobile, ipAddress);

    return {
      sent: true,
      expiresIn: OTP_TTL_SECONDS,
    };
  }

  async verifyOtp(mobile: string, code: string, ipAddress?: string): Promise<void> {
    const storedCode = await this.redis.get(otpKey(mobile));
    if (!storedCode) {
      await this.audit(
        'OTP_FAILED',
        mobile,
        ipAddress,
        OTP_FAILED_REASON_EXPIRED,
      );
      throw new GoneException('OTP has expired. Request a new OTP.');
    }

    if (!this.safeEqual(storedCode, code)) {
      const pipeline = this.redis.multi();
      pipeline.incr(attemptsKey(mobile));
      pipeline.expire(attemptsKey(mobile), OTP_TTL_SECONDS);
      pipeline.incr(failureKey(mobile));
      pipeline.expire(failureKey(mobile), FAILURE_WINDOW_SECONDS);
      if (ipAddress) {
        pipeline.incr(ipFailureKey(ipAddress));
        pipeline.expire(ipFailureKey(ipAddress), FAILURE_WINDOW_SECONDS);
      }
      const results = (await pipeline.exec()) ?? [];

      const attemptCount = this.resultCount(results[0]);
      const failureCount = this.resultCount(results[2]);
      const ipFailureCount = ipAddress ? this.resultCount(results[4]) : 0;

      if (
        attemptCount > MAX_VERIFICATION_ATTEMPTS ||
        failureCount > MAX_FAILURES ||
        ipFailureCount > IP_MAX_FAILURES
      ) {
        await this.redis.del(otpKey(mobile));
        await this.audit(
          'OTP_FAILED',
          mobile,
          ipAddress,
          OTP_FAILED_REASON_MAX_ATTEMPTS,
        );
        throw new HttpException(
          'Too many verification attempts. Request a new OTP.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.audit(
        'OTP_FAILED',
        mobile,
        ipAddress,
        OTP_FAILED_REASON_INVALID_CODE,
      );
      throw new BadRequestException('Invalid OTP code.');
    }

    const cleanup = this.redis.multi();
    cleanup.del(otpKey(mobile));
    cleanup.del(attemptsKey(mobile));
    cleanup.del(failureKey(mobile));
    if (ipAddress) {
      cleanup.del(ipFailureKey(ipAddress));
    }
    await cleanup.exec();

    this.logger.log(`OTP verified for mobile ${mobile}`);
    await this.audit('OTP_VERIFIED', mobile, ipAddress);
  }

  /**
   * Best-effort audit: OTP state lives in Redis, so a Postgres audit failure
   * must never block the OTP flow or strand a consumed code. Failures are
   * logged as application errors, never propagated (SS-022).
   */
  private async audit(
    action: string,
    mobile: string,
    ipAddress?: string,
    reason?: string,
  ): Promise<void> {
    try {
      await this.auditService.log({
        action,
        entity: 'User',
        after: reason ? { mobile, reason } : { mobile },
        ipAddress,
      });
    } catch (error) {
      this.logger.error(
        `Failed to audit ${action} for mobile ${mobile}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Extracts an integer counter from an ioredis pipeline result pair.
   * A failed command yields 0 so a Redis hiccup never falsely blocks a
   * caller; the counter itself still lives in Redis.
   */
  private resultCount(
    result: [Error | null, unknown] | null | undefined,
  ): number {
    const value = result?.[1];
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private generateCode(): string {
    return randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return timingSafeEqual(aBuffer, bBuffer);
  }
}
