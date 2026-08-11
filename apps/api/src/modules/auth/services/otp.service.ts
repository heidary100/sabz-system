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
  code?: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly exposeCode: boolean;
  private readonly isDevelopment: boolean;

  constructor(
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    const nodeEnv = configService.get<string>('NODE_ENV');
    this.exposeCode = nodeEnv !== 'production';
    this.isDevelopment = nodeEnv === 'development';
  }

  async requestOtp(mobile: string): Promise<RequestOtpResult> {
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

    return {
      sent: true,
      expiresIn: OTP_TTL_SECONDS,
      ...(this.exposeCode ? { code } : {}),
    };
  }

  async verifyOtp(mobile: string, code: string): Promise<void> {
    const attemptKey = attemptsKey(mobile);
    const attemptCount = Number((await this.redis.get(attemptKey)) ?? 0);

    if (attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
      await this.redis.del(otpKey(mobile));
      throw new HttpException(
        'Too many verification attempts. Request a new OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storedCode = await this.redis.get(otpKey(mobile));
    if (!storedCode) {
      throw new GoneException('OTP has expired. Request a new OTP.');
    }

    if (!this.safeEqual(storedCode, code)) {
      const pipeline = this.redis.multi();
      pipeline.incr(attemptKey);
      pipeline.expire(attemptKey, OTP_TTL_SECONDS);
      await pipeline.exec();
      throw new BadRequestException('Invalid OTP code.');
    }

    const pipeline = this.redis.multi();
    pipeline.del(otpKey(mobile));
    pipeline.del(attemptKey);
    await pipeline.exec();

    this.logger.log(`OTP verified for mobile ${mobile}`);
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
