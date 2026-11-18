import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../common/database/prisma.service';
import { RolesService } from '../auth/roles/roles.service';
import { RealtimeService } from './realtime.service';

interface AccessPayload {
  sub?: string;
  sessionId?: string;
  type?: string;
}

function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Authenticated realtime gateway (SS-900).
 *
 * Access token is supplied in the Socket.IO handshake `auth.token` (never a
 * query string, which proxies log). The gateway verifies the JWT, requires
 * type=access and an ACTIVE non-deleted user, then joins only that user's room
 * plus role rooms derived server-side. No client-supplied room names are
 * accepted, so a customer can never subscribe to another customer's events.
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins().includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'));
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.emit('auth:error', { message: 'نشست معتبر نیست.' });
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access' || typeof payload.sub !== 'string') {
        client.emit('auth:error', { message: 'نشست معتبر نیست.' });
        client.disconnect(true);
        return;
      }
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: 'ACTIVE', deletedAt: null },
        select: { id: true, mobile: true },
      });
      if (!user) {
        client.emit('auth:error', { message: 'نشست معتبر نیست.' });
        client.disconnect(true);
        return;
      }
      const roles = await this.roles.findRoleNamesByUserId(user.id);
      client.data.userId = user.id;
      client.data.roles = roles;
      client.join(`user:${user.id}`);
      for (const role of roles) {
        client.join(`role:${role}`);
      }
      client.emit('connected', {
        userId: user.id,
        roles,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Realtime connection rejected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.emit('auth:error', { message: 'نشست معتبر نیست.' });
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }
    return null;
  }
}
