import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Server } from 'socket.io';
import type Redis from 'ioredis';
import { RedisService } from '../../common/redis/redis.service';

const CHANNEL = 'sabz:realtime:v1';

interface BridgeMessage {
  source: string;
  target: { type: 'user' | 'role'; id: string };
  event: string;
  payload: unknown;
}

/**
 * Cross-instance realtime fan-out (SS-900).
 *
 * Local Socket.IO delivery is always attempted immediately. A Redis pub/sub
 * bridge repeats the event on other API replicas; the source instance ignores
 * its own bridge message so clients never receive duplicates. Redis outage
 * degrades to single-instance delivery, never to a failed business write.
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly instanceId = randomUUID();
  private server: Server | null = null;
  private subscriber: Redis | null = null;

  constructor(private readonly redis: RedisService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitLocal(`user:${userId}`, event, payload);
    void this.publish({
      source: this.instanceId,
      target: { type: 'user', id: userId },
      event,
      payload,
    });
  }

  emitToRole(role: string, event: string, payload: unknown): void {
    this.emitLocal(`role:${role}`, event, payload);
    void this.publish({
      source: this.instanceId,
      target: { type: 'role', id: role },
      event,
      payload,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const subscriber = this.redis.duplicate();
      subscriber.on('error', (error) => {
        this.logger.warn(`Realtime bridge subscriber error: ${error.message}`);
      });
      await subscriber.connect();
      await subscriber.subscribe(CHANNEL);
      subscriber.on('message', (channel, raw) => {
        if (channel !== CHANNEL) {
          return;
        }
        this.onBridgeMessage(raw);
      });
      this.subscriber = subscriber;
    } catch (error) {
      this.logger.warn(
        `Realtime Redis bridge unavailable; single-instance delivery only: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  onModuleDestroy(): void {
    this.subscriber?.disconnect();
    this.subscriber = null;
  }

  private emitLocal(room: string, event: string, payload: unknown): void {
    try {
      this.server?.to(room).emit(event, payload);
    } catch (error) {
      this.logger.warn(
        `Realtime local emit failed room=${room} event=${event}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async publish(message: BridgeMessage): Promise<void> {
    try {
      await this.redis.publish(CHANNEL, JSON.stringify(message));
    } catch (error) {
      this.logger.warn(
        `Realtime Redis publish failed (local delivery already attempted): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private onBridgeMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as BridgeMessage;
      if (message.source === this.instanceId) {
        return;
      }
      const room =
        message.target.type === 'user'
          ? `user:${message.target.id}`
          : `role:${message.target.id}`;
      this.emitLocal(room, message.event, message.payload);
    } catch (error) {
      this.logger.warn(
        `Realtime bridge message ignored: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
