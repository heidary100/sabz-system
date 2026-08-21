import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: {
    list: jest.Mock;
    listByVariant: jest.Mock;
    listByWarehouse: jest.Mock;
  };

  beforeEach(() => {
    service = {
      list: jest.fn(),
      listByVariant: jest.fn(),
      listByWarehouse: jest.fn(),
    };
    controller = new InventoryController(service as unknown as InventoryService);
  });

  it('requires OPERATOR and ADMIN on every route', () => {
    const reflector = new Reflector();
    const handlers = [
      InventoryController.prototype.list,
      InventoryController.prototype.listByVariant,
      InventoryController.prototype.listByWarehouse,
    ];

    for (const handler of handlers) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        InventoryController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }
  });

  it('delegates list to the service with the query', async () => {
    const query = { page: 1 };
    await controller.list(query as never);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('delegates listByVariant to the service', async () => {
    await controller.listByVariant('var-1');
    expect(service.listByVariant).toHaveBeenCalledWith('var-1');
  });

  it('delegates listByWarehouse to the service with warehouseId and query', async () => {
    const query = { limit: 5 };
    await controller.listByWarehouse('wh-1', query as never);
    expect(service.listByWarehouse).toHaveBeenCalledWith('wh-1', query);
  });
});
