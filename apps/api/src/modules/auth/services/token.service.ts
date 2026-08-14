import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';

const AUTH_FAILED_REASON_SESSION_NOT_FOUND = 'SESSION_NOT_FOUND';
const AUTH_FAILED_REASON_SESSION_REVOKED = 'SESSION_REVOKED';
const AUTH_FAILED_REASON_USER_MISMATCH = 'USER_MISMATCH';
const AUTH_FAILED_REASON_ACCOUNT_NOT_ACTIVE = 'ACCOUNT_NOT_ACTIVE';
const AUTH_FAILED_REASON_TOKEN_REUSE = 'TOKEN_REUSE';

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

export interface RefreshSessionOptions {
  ipAddress?: string;
}

export interface RevokeSessionOptions {
  userId?: string;
  ipAddress?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessLifetime: string;
  private readonly refreshLifetime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
    private readonly auditService: AuditService,
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

  get refreshLifetimeMs(): number {
    return this.lifetimeToMs(this.refreshLifetime);
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

    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.create({
        data: {
          id: sessionId,
          userId,
          refreshToken: this.hashToken(tokens.refreshToken),
          deviceId: options.deviceId,
          ipAddress: options.ipAddress,
          expiresAt,
        },
      });

      await this.auditService.log(
        {
          userId,
          action: 'SESSION_CREATED',
          entity: 'UserSession',
          entityId: sessionId,
          ipAddress: options.ipAddress,
        },
        tx,
      );
    });

    return tokens;
  }

  async refreshSession(
    refreshToken: string,
    options: RefreshSessionOptions = {},
  ): Promise<TokenPair> {
    const payload = this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshToken: this.hashToken(refreshToken) },
    });

    if (!session) {
      await this.auditFailedAttempt(
        payload.sub,
        payload.sessionId,
        AUTH_FAILED_REASON_SESSION_NOT_FOUND,
        options.ipAddress,
      );
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (session.revokedAt !== null) {
      await this.auditFailedAttempt(
        payload.sub,
        session.id,
        AUTH_FAILED_REASON_SESSION_REVOKED,
        options.ipAddress,
      );
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (session.userId !== payload.sub) {
      await this.auditFailedAttempt(
        payload.sub,
        session.id,
        AUTH_FAILED_REASON_USER_MISMATCH,
        options.ipAddress,
      );
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, deletedAt: true },
    });

    if (!user || user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      await this.auditFailedAttempt(
        payload.sub,
        session.id,
        AUTH_FAILED_REASON_ACCOUNT_NOT_ACTIVE,
        options.ipAddress,
      );
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokens = this.generateTokenPair(payload.sub, session.id);
    const expiresAt = new Date(
      Date.now() + this.lifetimeToMs(this.refreshLifetime),
    );

    const rotatedCount = await this.prisma.$transaction(async (tx) => {
      const rotated = await tx.userSession.updateMany({
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

      if (rotated.count > 0) {
        await this.auditService.log(
          {
            userId: payload.sub,
            action: 'SESSION_REFRESHED',
            entity: 'UserSession',
            entityId: session.id,
            ipAddress: options.ipAddress,
          },
          tx,
        );
      }

      return rotated.count;
    });

    if (rotatedCount === 0) {
      await this.auditFailedAttempt(
        payload.sub,
        session.id,
        AUTH_FAILED_REASON_TOKEN_REUSE,
        options.ipAddress,
      );
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    return tokens;
  }

  async revokeSession(
    sessionId: string,
    options: RevokeSessionOptions = {},
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.userSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revoked.count > 0) {
        await this.auditService.log(
          {
            userId: options.userId,
            action: 'SESSION_REVOKED',
            entity: 'UserSession',
            entityId: sessionId,
            ipAddress: options.ipAddress,
          },
          tx,
        );
      }
    });
  }

  /**
   * Best-effort audit of identifiable invalid refresh attempts. No session
   * state is changed here, so an audit failure must not alter the response.
   */
  private async auditFailedAttempt(
    userId: string,
    sessionId: string,
    reason: string,
    ipAddress?: string,
  ): Promise<void> {
    try {
      await this.auditService.log({
        userId,
        action: 'AUTHENTICATION_FAILED',
        entity: 'UserSession',
        entityId: sessionId,
        after: { reason },
        ipAddress,
      });
    } catch (error) {
      this.logger.error(
        `Failed to audit AUTHENTICATION_FAILED for session ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
