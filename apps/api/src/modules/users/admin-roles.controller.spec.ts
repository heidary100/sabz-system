import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AdminRolesController } from './admin-roles.controller';
import { UsersService } from './users.service';

describe('AdminRolesController', () => {
  it('requires ADMIN on the roles list route', () => {
    const reflector = new Reflector();

    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminRolesController.prototype.list,
      AdminRolesController,
    ]);

    expect(roles).toEqual([AppRole.ADMIN]);
  });

  it('delegates the list call to the users service', async () => {
    const usersService = {
      listRoles: jest.fn().mockResolvedValue([{ id: 'role-1', name: 'ADMIN' }]),
    };
    const controller = new AdminRolesController(
      usersService as unknown as UsersService,
    );

    const result = await controller.list();

    expect(usersService.listRoles).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'role-1', name: 'ADMIN' }]);
  });
});
