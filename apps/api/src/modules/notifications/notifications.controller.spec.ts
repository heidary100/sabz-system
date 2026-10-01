import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notification.service';

describe('NotificationsController (SS-243)', () => {
  const user = { userId: 'user-1' } as AuthUser;
  let service: {
    list: jest.Mock;
    unreadCount: jest.Mock;
    markRead: jest.Mock;
  };
  let controller: NotificationsController;

  beforeEach(() => {
    service = { list: jest.fn(), unreadCount: jest.fn(), markRead: jest.fn() };
    controller = new NotificationsController(
      service as unknown as NotificationService,
    );
  });

  it('delegates list scoped to the caller', async () => {
    await controller.list(user, { page: 2, limit: 10 });
    expect(service.list).toHaveBeenCalledWith('user-1', {
      page: 2,
      limit: 10,
    });
  });

  it('delegates unread-count scoped to the caller', async () => {
    await controller.unreadCount(user);
    expect(service.unreadCount).toHaveBeenCalledWith('user-1');
  });

  it('delegates mark-read scoped to the caller', async () => {
    await controller.markRead(user, 'notif-1');
    expect(service.markRead).toHaveBeenCalledWith('user-1', 'notif-1');
  });
});
