import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    list: jest.Mock;
    getDetail: jest.Mock;
    suspendUser: jest.Mock;
    unsuspendUser: jest.Mock;
    unlockUser: jest.Mock;
    assignRole: jest.Mock;
    removeRole: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      list: jest.fn(),
      getDetail: jest.fn(),
      suspendUser: jest.fn(),
      unsuspendUser: jest.fn(),
      unlockUser: jest.fn(),
      assignRole: jest.fn(),
      removeRole: jest.fn(),
    };
    controller = new UsersController(
      usersService as unknown as UsersService,
    );
  });

  it('requires OPERATOR or ADMIN on read/lifecycle routes and ADMIN only on role and unlock routes', () => {
    const reflector = new Reflector();

    for (const handler of [
      UsersController.prototype.list,
      UsersController.prototype.getDetail,
      UsersController.prototype.suspend,
      UsersController.prototype.unsuspend,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        UsersController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }

    for (const handler of [
      UsersController.prototype.unlock,
      UsersController.prototype.assignRole,
      UsersController.prototype.removeRole,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        UsersController,
      ]);
      expect(roles).toEqual([AppRole.ADMIN]);
    }
  });

  it('delegates list with the query', async () => {
    const query = { search: 'علی', page: 2, limit: 10 };
    usersService.list.mockResolvedValue({ items: [], total: 0, page: 2, limit: 10 });

    const result = await controller.list(query);

    expect(usersService.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({ items: [], total: 0, page: 2, limit: 10 });
  });

  it('delegates getDetail with the user id', async () => {
    usersService.getDetail.mockResolvedValue({ id: 'user-1' });

    const result = await controller.getDetail('user-1');

    expect(usersService.getDetail).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'user-1' });
  });

  it('delegates suspend with id, body, actor and ip', async () => {
    usersService.suspendUser.mockResolvedValue({ id: 'user-1', status: 'SUSPENDED' });

    const result = await controller.suspend(
      'user-1',
      { reason: 'تخلف' },
      { userId: 'actor-1', sessionId: 'session-1', mobile: '+989123456789' },
      '1.2.3.4',
    );

    expect(usersService.suspendUser).toHaveBeenCalledWith(
      'user-1',
      'actor-1',
      { reason: 'تخلف' },
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'user-1', status: 'SUSPENDED' });
  });

  it('delegates unsuspend with id, actor and ip', async () => {
    usersService.unsuspendUser.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });

    const result = await controller.unsuspend(
      'user-1',
      { userId: 'actor-1', sessionId: 'session-1', mobile: '+989123456789' },
      '1.2.3.4',
    );

    expect(usersService.unsuspendUser).toHaveBeenCalledWith(
      'user-1',
      'actor-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'user-1', status: 'ACTIVE' });
  });

  it('delegates unlock with id, actor and ip', async () => {
    usersService.unlockUser.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });

    const result = await controller.unlock(
      'user-1',
      { userId: 'actor-1', sessionId: 'session-1', mobile: '+989123456789' },
      '1.2.3.4',
    );

    expect(usersService.unlockUser).toHaveBeenCalledWith(
      'user-1',
      'actor-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'user-1', status: 'ACTIVE' });
  });

  it('delegates assignRole with id, role, actor and ip', async () => {
    usersService.assignRole.mockResolvedValue({ id: 'user-1', roles: [] });

    const result = await controller.assignRole(
      'user-1',
      AppRole.OPERATOR,
      { userId: 'actor-1', sessionId: 'session-1', mobile: '+989123456789' },
      '1.2.3.4',
    );

    expect(usersService.assignRole).toHaveBeenCalledWith(
      'user-1',
      AppRole.OPERATOR,
      'actor-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'user-1', roles: [] });
  });

  it('delegates removeRole with id, role, actor and ip', async () => {
    usersService.removeRole.mockResolvedValue({ id: 'user-1', roles: [] });

    const result = await controller.removeRole(
      'user-1',
      AppRole.PARTNER,
      { userId: 'actor-1', sessionId: 'session-1', mobile: '+989123456789' },
      '1.2.3.4',
    );

    expect(usersService.removeRole).toHaveBeenCalledWith(
      'user-1',
      AppRole.PARTNER,
      'actor-1',
      '1.2.3.4',
    );
    expect(result).toEqual({ id: 'user-1', roles: [] });
  });
});