import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppRole } from '../src/modules/auth/enums/app-role.enum';
import { TokenService } from '../src/modules/auth/services/token.service';
import { NotificationService } from '../src/modules/notifications/notification.service';

jest.setTimeout(60_000);

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

async function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeout = 5_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeout,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * SS-900 realtime security + chat vertical slice.
 *
 * Proves the WebSocket handshake rejects missing tokens, notification events
 * are delivered only to the recipient (and operator role room), chat messages
 * persist and flow customer → operator → customer, and admin chat endpoints
 * reject non-staff callers.
 */
describe('SS-900 realtime notifications + chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let notifications: NotificationService;
  let baseUrl: string;
  let customerToken: string;
  let operatorToken: string;
  let customerUserId: string;
  const userIds: string[] = [];
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);
    notifications = app.get(NotificationService);

    for (const role of [
      AppRole.CUSTOMER,
      AppRole.OPERATOR,
      AppRole.ADMIN,
    ]) {
      await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
      });
    }

    const customer = await prisma.user.create({
      data: {
        mobile: uniqueMobile(),
        status: 'ACTIVE',
        roles: { create: { role: { connect: { name: AppRole.CUSTOMER } } } },
      },
    });
    customerUserId = customer.id;
    userIds.push(customer.id);
    const operator = await prisma.user.create({
      data: {
        mobile: uniqueMobile(),
        status: 'ACTIVE',
        roles: { create: { role: { connect: { name: AppRole.OPERATOR } } } },
      },
    });
    userIds.push(operator.id);
    customerToken = (await tokenService.createSession(customer.id)).accessToken;
    operatorToken = (await tokenService.createSession(operator.id)).accessToken;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    await prisma.chatMessage.deleteMany({
      where: { conversation: { userId: { in: userIds } } },
    });
    await prisma.chatConversation.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { userId: { in: userIds } },
    });
    await app.close();
  });

  function connect(token?: string): Socket {
    const socket = io(`${baseUrl}/ws`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
      timeout: 4_000,
    });
    sockets.push(socket);
    return socket;
  }

  it('rejects a socket without a valid access token', async () => {
    const socket = connect();
    const payload = await waitForEvent<{ message: string }>(socket, 'auth:error');
    expect(payload.message).toBe('نشست معتبر نیست.');
    await new Promise<void>((resolve) => {
      if (!socket.connected) return resolve();
      socket.once('disconnect', () => resolve());
      setTimeout(resolve, 2_000);
    });
    expect(socket.connected).toBe(false);
  });

  it('delivers a notification only to its recipient and updates the unread counter', async () => {
    const customerSocket = connect(customerToken);
    const operatorSocket = connect(operatorToken);
    // `connected` is emitted by handleConnection AFTER the authenticated
    // rooms are joined; the transport-level `connect` fires earlier.
    await Promise.all([
      waitForEvent(customerSocket, 'connected'),
      waitForEvent(operatorSocket, 'connected'),
    ]);

    let operatorLeak = false;
    const leakListener = () => {
      operatorLeak = true;
    };
    operatorSocket.on('notification:new', leakListener);

    const received = waitForEvent<{
      notification: { title: string; priority: string };
      unread: number;
    }>(customerSocket, 'notification:new');
    await notifications.notify(customerUserId, {
      type: 'ORDER_PLACED',
      title: 'اعلان زنده',
      body: 'فقط برای همین مشتری',
      priority: 'HIGH',
      category: 'TESTS',
    });
    const event = await received;
    expect(event.notification).toMatchObject({
      title: 'اعلان زنده',
      priority: 'HIGH',
    });
    expect(event.unread).toBeGreaterThanOrEqual(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    operatorSocket.off('notification:new', leakListener);
    expect(operatorLeak).toBe(false);

    // Operator fan-out reaches the role room.
    const operatorReceived = waitForEvent<{ notification: { title: string } }>(
      operatorSocket,
      'notification:new',
    );
    await notifications.notifyOperators({
      type: 'ORDER_PLACED',
      title: 'هشدار اپراتور',
      body: 'فقط برای کارکنان',
    });
    await expect(operatorReceived).resolves.toMatchObject({
      notification: { title: 'هشدار اپراتور' },
    });
  });

  it('persists chat messages and replies customer → operator → customer', async () => {
    const open = await request(app.getHttpServer())
      .post('/api/v1/chat/conversation')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        contextUrl: 'http://localhost:3002/products/test',
        contextTitle: 'محصول آزمایشی',
        contextKind: 'product',
        contextLabel: 'محصول آزمایشی',
      })
      .expect(201);
    const conversationId = open.body.id as string;
    expect(open.body.contextUrl).toBe('http://localhost:3002/products/test');

    const sent = await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        body: 'سلام، سوال دارم.',
        clientMessageId: 'ss900-e2e-1',
        contextUrl: 'http://localhost:3002/products/test?variant=v-1&x=1#frag',
        contextTitle: 'محصول آزمایشی',
        contextKind: 'product',
      })
      .expect(201);
    expect(sent.body.messages.at(-1)).toMatchObject({
      body: 'سلام، سوال دارم.',
      senderType: 'CUSTOMER',
      contextUrl: 'http://localhost:3002/products/test?variant=v-1',
      contextTitle: 'محصول آزمایشی',
    });
    expect(sent.body.contextTitle).toBeTruthy();
    // Idempotent retry with the same client message id.
    const retried = await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ body: 'سلام، سوال دارم.', clientMessageId: 'ss900-e2e-1' })
      .expect(201);
    expect(
      retried.body.messages.filter(
        (message: { body: string }) => message.body === 'سلام، سوال دارم.',
      ),
    ).toHaveLength(1);

    // Live page-context update: canonical origin only, allowlisted query.
    const operatorSocket = connect(operatorToken);
    await waitForEvent(operatorSocket, 'connected');
    const contextEvent = waitForEvent<{
      contextUrl: string;
      contextTitle: string;
      contextKind: string;
    }>(operatorSocket, 'chat:context');
    await request(app.getHttpServer())
      .patch('/api/v1/chat/context')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        contextUrl:
          'http://localhost:3002/products/test?variant=v-2&token=secret#fragment',
        contextTitle: 'صفحه محصول دیگر',
        contextKind: 'product',
        contextLabel: 'محصول دیگر',
      })
      .expect(200);
    await expect(contextEvent).resolves.toMatchObject({
      contextUrl: 'http://localhost:3002/products/test?variant=v-2',
      contextTitle: 'صفحه محصول دیگر',
      contextKind: 'product',
    });
    await request(app.getHttpServer())
      .patch('/api/v1/chat/context')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ contextUrl: 'https://evil.example/products/a' })
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/admin/chat/conversations')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/admin/chat/conversations')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(
      inbox.body.items.some(
        (item: { id: string }) => item.id === conversationId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get('/api/v1/admin/chat/conversations?page=abc')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);

    const reply = await request(app.getHttpServer())
      .post(`/api/v1/admin/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ body: 'سلام، در خدمتیم.' })
      .expect(201);
    expect(reply.body.messages.at(-1)).toMatchObject({
      body: 'سلام، در خدمتیم.',
      senderType: 'ADMIN',
    });

    const customerSocket = connect(customerToken);
    await waitForEvent(customerSocket, 'connected');
    const replyEvent = waitForEvent<{ message: { body: string; senderType: string } }>(
      customerSocket,
      'chat:message',
    );
    await request(app.getHttpServer())
      .post(`/api/v1/admin/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ body: 'پیام دوم پشتیبانی.' })
      .expect(201);
    await expect(replyEvent).resolves.toMatchObject({
      message: { body: 'پیام دوم پشتیبانی.', senderType: 'ADMIN' },
    });
    customerSocket.disconnect();

    const customerView = await request(app.getHttpServer())
      .get('/api/v1/chat/conversation')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(
      customerView.body.conversation.messages.some(
        (message: { body: string }) => message.body === 'سلام، در خدمتیم.',
      ),
    ).toBe(true);
  });
});
