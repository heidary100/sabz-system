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
const MAX_VERIFICATION_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 5;

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

function attemptsKey(mobile: string): string {
  return `auth:otp:attempts:${mobile}`;
}

function rateLimitKey(mobile: string): string {
  return `auth:otp:rate:${mobile}`;
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
    const rateKey = rateLimitKey(mobile);
    const requestCount = await this.redis.incr(rateKey);
    if (requestCount === 1) {
      await this.redis.expire(rateKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (requestCount > RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        'Too many OTP requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.isDevelopment ? DEV_OTP_CODE : this.generateCode();
    const pipeline = this.redis.multi();
    pipeline.set(otpKey(mobile), code, 'EX', OTP_TTL_SECONDS);
    pipeline.del(attemptsKey(mobile));
    await pipeline.exec();

    this.logger.log(`OTP requested for mobile ${mobile}`);
    await this.audit('OTP_REQUESTED', mobile, ipAddress);

    return {
      sent: true,
      expiresIn: OTP_TTL_SECONDS,
    };
  }

  async verifyOtp(mobile: string, code: string, ipAddress?: string): Promise<void> {
    const attemptKey = attemptsKey(mobile);
    const attemptCount = Number((await this.redis.get(attemptKey)) ?? 0);

    if (attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
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
      pipeline.incr(attemptKey);
      pipeline.expire(attemptKey, OTP_TTL_SECONDS);
      await pipeline.exec();
      await this.audit(
        'OTP_FAILED',
        mobile,
        ipAddress,
        OTP_FAILED_REASON_INVALID_CODE,
      );
      throw new BadRequestException('Invalid OTP code.');
    }

    const pipeline = this.redis.multi();
    pipeline.del(otpKey(mobile));
    pipeline.del(attemptKey);
    await pipeline.exec();

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
