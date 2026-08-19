import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';

describe('BrandsController', () => {
  let controller: BrandsController;
  let service: {
    list: jest.Mock;
    getDetail: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };

  const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

  beforeEach(() => {
    service = {
      list: jest.fn(),
      getDetail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    controller = new BrandsController(service as unknown as BrandsService);
  });

  it('requires OPERATOR or ADMIN on every route', () => {
    const reflector = new Reflector();
    const handlers = [
      BrandsController.prototype.list,
      BrandsController.prototype.getDetail,
      BrandsController.prototype.create,
      BrandsController.prototype.update,
      BrandsController.prototype.softDelete,
    ];

    for (const handler of handlers) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        BrandsController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }
  });

  it('delegates list to the service with the query', async () => {
    const query = { page: 1 };
    await controller.list(query as never);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('delegates getDetail to the service', async () => {
    await controller.getDetail('brand-1');
    expect(service.getDetail).toHaveBeenCalledWith('brand-1');
  });

  it('delegates create with the actor and ip', async () => {
    const dto = {} as never;
    await controller.create(dto, user as never, '127.0.0.1');
    expect(service.create).toHaveBeenCalledWith(dto, 'actor-1', '127.0.0.1');
  });

  it('delegates update with the actor and ip', async () => {
    const dto = {} as never;
    await controller.update('brand-1', dto, user as never, '127.0.0.1');
    expect(service.update).toHaveBeenCalledWith('brand-1', dto, 'actor-1', '127.0.0.1');
  });

  it('delegates softDelete with the actor and ip', async () => {
    await controller.softDelete('brand-1', user as never, '127.0.0.1');
    expect(service.softDelete).toHaveBeenCalledWith('brand-1', 'actor-1', '127.0.0.1');
  });
});
