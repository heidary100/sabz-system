import { createHash, randomUUID } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../../../common/database/prisma.service';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';

export interface JwtPayload {
  sub: string;
  sessionId: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface CreateSessionOptions {
  deviceId?: string;
  ipAddress?: string;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessLifetime: string;
  private readonly refreshLifetime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessLifetime = configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    this.refreshLifetime = configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    );
  }

  async createSession(
    userId: string,
    options: CreateSessionOptions = {},
  ): Promise<TokenPair> {
    const sessionId = randomUUID();
    const tokens = this.generateTokenPair(userId, sessionId);
    const expiresAt = new Date(
      Date.now() + this.lifetimeToMs(this.refreshLifetime),
    );

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId,
        refreshToken: this.hashToken(tokens.refreshToken),
        deviceId: options.deviceId,
        ipAddress: options.ipAddress,
        expiresAt,
      },
    });

    return tokens;
  }

  async refreshSession(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshToken: this.hashToken(refreshToken) },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      session.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokens = this.generateTokenPair(payload.sub, session.id);
    const expiresAt = new Date(
      Date.now() + this.lifetimeToMs(this.refreshLifetime),
    );

    const rotated = await this.prisma.userSession.updateMany({
      where: {
        id: session.id,
        refreshToken: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: {
        refreshToken: this.hashToken(tokens.refreshToken),
        expiresAt,
        updatedBy: payload.sub,
      },
    });

    if (rotated.count === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    return tokens;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private generateTokenPair(userId: string, sessionId: string): TokenPair {
    return {
      accessToken: this.signAccessToken(userId, sessionId),
      refreshToken: this.signRefreshToken(userId, sessionId),
    };
  }

  private signAccessToken(userId: string, sessionId: string): string {
    return this.jwtService.sign(
      { sub: userId, sessionId, type: ACCESS_TOKEN_TYPE },
      {
        secret: this.accessSecret,
        expiresIn: this.accessLifetime as JwtSignOptions['expiresIn'],
      },
    );
  }

  private signRefreshToken(userId: string, sessionId: string): string {
    return this.jwtService.sign(
      { sub: userId, sessionId, type: REFRESH_TOKEN_TYPE },
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshLifetime as JwtSignOptions['expiresIn'],
      },
    );
  }

  private verifyRefreshToken(refreshToken: string): JwtPayload {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (payload.type !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return payload;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private lifetimeToMs(lifetime: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(lifetime);
    if (!match) {
      throw new Error(`Invalid JWT lifetime value: ${lifetime}`);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const unitToMs: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    const multiplier = unit ? unitToMs[unit] : undefined;
    if (multiplier === undefined) {
      throw new Error(`Invalid JWT lifetime value: ${lifetime}`);
    }
    return value * multiplier;
  }
}
