import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

describe('WarehousesController', () => {
  let controller: WarehousesController;
  let service: {
    list: jest.Mock;
    getDetail: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
    activate: jest.Mock;
  };

  const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

  beforeEach(() => {
    service = {
      list: jest.fn(),
      getDetail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      activate: jest.fn(),
    };
    controller = new WarehousesController(service as unknown as WarehousesService);
  });

  it('requires ADMIN only on every route', () => {
    const reflector = new Reflector();
    const handlers = [
      WarehousesController.prototype.list,
      WarehousesController.prototype.getDetail,
      WarehousesController.prototype.create,
      WarehousesController.prototype.update,
      WarehousesController.prototype.deactivate,
      WarehousesController.prototype.activate,
    ];

    for (const handler of handlers) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        WarehousesController,
      ]);
      expect(roles).toEqual([AppRole.ADMIN]);
    }
  });

  it('delegates list to the service with the query', async () => {
    const query = { page: 1 };
    await controller.list(query as never);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('delegates getDetail to the service', async () => {
    await controller.getDetail('wh-1');
    expect(service.getDetail).toHaveBeenCalledWith('wh-1');
  });

  it('delegates create with the actor and ip', async () => {
    const dto = {} as never;
    await controller.create(dto, user as never, '127.0.0.1');
    expect(service.create).toHaveBeenCalledWith(dto, 'actor-1', '127.0.0.1');
  });

  it('delegates update with the actor and ip', async () => {
    const dto = {} as never;
    await controller.update('wh-1', dto, user as never, '127.0.0.1');
    expect(service.update).toHaveBeenCalledWith('wh-1', dto, 'actor-1', '127.0.0.1');
  });

  it('delegates deactivate with the actor and ip', async () => {
    await controller.deactivate('wh-1', user as never, '127.0.0.1');
    expect(service.deactivate).toHaveBeenCalledWith('wh-1', 'actor-1', '127.0.0.1');
  });

  it('delegates activate with the actor and ip', async () => {
    await controller.activate('wh-1', user as never, '127.0.0.1');
    expect(service.activate).toHaveBeenCalledWith('wh-1', 'actor-1', '127.0.0.1');
  });
});