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
  };

  beforeEach(() => {
    usersService = {
      list: jest.fn(),
      getDetail: jest.fn(),
    };
    controller = new UsersController(
      usersService as unknown as UsersService,
    );
  });

  it('requires OPERATOR or ADMIN on every route', () => {
    const reflector = new Reflector();

    for (const handler of [
      UsersController.prototype.list,
      UsersController.prototype.getDetail,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        UsersController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
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
});