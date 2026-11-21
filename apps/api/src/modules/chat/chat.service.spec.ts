import { BadRequestException } from '@nestjs/common';
import { ChatService, sanitizeContextUrl } from './chat.service';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { RealtimeService } from '../realtime/realtime.service';

describe('chat context safety (SS-900)', () => {
  it('accepts canonical paths and preserves only the allowlisted variant query', () => {
    expect(sanitizeContextUrl('/products/laptop?x=1&variant=v-2#top')).toBe(
      'http://localhost:3002/products/laptop?variant=v-2',
    );
    expect(
      sanitizeContextUrl(
        'https://shop.example/products/a#frag',
        'https://shop.example',
      ),
    ).toBe('https://shop.example/products/a');
  });

  it('rejects non-web schemes, protocol-relative URLs and foreign origins', () => {
    expect(sanitizeContextUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeContextUrl('data:text/html,hi')).toBeNull();
    expect(sanitizeContextUrl('//evil.example/x')).toBeNull();
    expect(sanitizeContextUrl('https://evil.example/products/a')).toBeNull();
    expect(
      sanitizeContextUrl('https://evil.example/products/a', 'https://shop.example'),
    ).toBeNull();
  });

  it('caps oversized context values', () => {
    expect(() => sanitizeContextUrl(`/${'a'.repeat(3000)}`)).toThrow(
      BadRequestException,
    );
  });
});

describe('ChatService (SS-900)', () => {
  function makeService(prisma: Record<string, unknown>) {
    return new ChatService(
      prisma as unknown as PrismaService,
      {
        notify: jest.fn().mockResolvedValue(undefined),
        notifyOperators: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationService,
      {
        emitToUser: jest.fn(),
        emitToRole: jest.fn(),
      } as unknown as RealtimeService,
    );
  }

  it('returns an empty customer state without an open conversation', async () => {
    const prisma = {
      chatConversation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = makeService(prisma);
    await expect(service.customerState('user-1')).resolves.toEqual({
      conversation: null,
      canSend: true,
    });
  });

  it('maps an owned conversation and its messages for the customer', async () => {
    const prisma = {
      chatConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c-1',
          userId: 'user-1',
          status: 'PENDING',
          contextUrl: '/products/a',
          unreadForCustomer: 1,
          unreadForAdmin: 2,
          lastMessageAt: new Date('2026-11-18T10:00:00.000Z'),
          createdAt: new Date('2026-11-18T09:00:00.000Z'),
          messages: [
            {
              id: 'm-1',
              conversationId: 'c-1',
              senderType: 'ADMIN',
              senderUserId: 'admin-1',
              body: 'سلام',
              contextUrl: null,
              createdAt: new Date('2026-11-18T10:00:00.000Z'),
              sender: {
                mobile: '09120000000',
                profile: { firstName: 'پشتیبانی', lastName: 'سبز' },
              },
            },
          ],
        }),
      },
    };
    const service = makeService(prisma);
    const state = await service.customerState('user-1');
    expect(state.conversation).toMatchObject({
      id: 'c-1',
      statusFa: 'در انتظار پاسخ',
      unreadForCustomer: 1,
    });
    expect(state.conversation?.messages[0]).toMatchObject({
      body: 'سلام',
      senderType: 'ADMIN',
      senderName: 'پشتیبانی سبز سیستم',
    });
  });

  it('rejects a closed-conversation admin reply', async () => {
    const prisma = {
      chatConversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c-1',
          userId: 'user-1',
          status: 'CLOSED',
          contextUrl: null,
        }),
      },
    };
    const service = makeService(prisma);
    await expect(
      service.sendAdmin('admin-1', 'c-1', { body: 'پاسخ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
