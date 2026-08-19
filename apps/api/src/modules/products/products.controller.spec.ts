import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: {
    list: jest.Mock;
    getDetail: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    publish: jest.Mock;
    archive: jest.Mock;
  };

  const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

  beforeEach(() => {
    service = {
      list: jest.fn(),
      getDetail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      publish: jest.fn(),
      archive: jest.fn(),
    };
    controller = new ProductsController(
      service as unknown as ProductsService,
    );
  });

  it('requires OPERATOR or ADMIN on every route', () => {
    const reflector = new Reflector();
    const handlers = [
      ProductsController.prototype.list,
      ProductsController.prototype.getDetail,
      ProductsController.prototype.create,
      ProductsController.prototype.update,
      ProductsController.prototype.softDelete,
      ProductsController.prototype.publish,
      ProductsController.prototype.archive,
    ];

    for (const handler of handlers) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        ProductsController,
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
    await controller.getDetail('prod-1');
    expect(service.getDetail).toHaveBeenCalledWith('prod-1');
  });

  it('delegates create with the actor and ip', async () => {
    const dto = {} as never;
    await controller.create(dto, user as never, '127.0.0.1');
    expect(service.create).toHaveBeenCalledWith(dto, 'actor-1', '127.0.0.1');
  });

  it('delegates update with the actor and ip', async () => {
    const dto = {} as never;
    await controller.update('prod-1', dto, user as never, '127.0.0.1');
    expect(service.update).toHaveBeenCalledWith('prod-1', dto, 'actor-1', '127.0.0.1');
  });

  it('delegates softDelete with the actor and ip', async () => {
    await controller.softDelete('prod-1', user as never, '127.0.0.1');
    expect(service.softDelete).toHaveBeenCalledWith('prod-1', 'actor-1', '127.0.0.1');
  });

  it('delegates publish with the actor and ip', async () => {
    await controller.publish('prod-1', user as never, '127.0.0.1');
    expect(service.publish).toHaveBeenCalledWith('prod-1', 'actor-1', '127.0.0.1');
  });

  it('delegates archive with the actor and ip', async () => {
    await controller.archive('prod-1', user as never, '127.0.0.1');
    expect(service.archive).toHaveBeenCalledWith('prod-1', 'actor-1', '127.0.0.1');
  });
});
