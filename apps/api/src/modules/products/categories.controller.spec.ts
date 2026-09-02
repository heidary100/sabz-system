import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: {
    list: jest.Mock;
    getTree: jest.Mock;
    getDetail: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    reorder: jest.Mock;
    softDelete: jest.Mock;
  };

  const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

  beforeEach(() => {
    service = {
      list: jest.fn(),
      getTree: jest.fn(),
      getDetail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      reorder: jest.fn(),
      softDelete: jest.fn(),
    };
    controller = new CategoriesController(service as unknown as CategoriesService);
  });

  it('requires OPERATOR or ADMIN on every route', () => {
    const reflector = new Reflector();
    const handlers = [
      CategoriesController.prototype.list,
      CategoriesController.prototype.getTree,
      CategoriesController.prototype.getDetail,
      CategoriesController.prototype.create,
      CategoriesController.prototype.update,
      CategoriesController.prototype.reorder,
      CategoriesController.prototype.softDelete,
    ];

    for (const handler of handlers) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        CategoriesController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }
  });

  it('delegates list to the service with the query', async () => {
    const query = { page: 1 };
    await controller.list(query as never);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('delegates getTree to the service', async () => {
    await controller.getTree();
    expect(service.getTree).toHaveBeenCalledWith();
  });

  it('delegates getDetail to the service', async () => {
    await controller.getDetail('cat-1');
    expect(service.getDetail).toHaveBeenCalledWith('cat-1');
  });

  it('delegates create with the actor and ip', async () => {
    const dto = {} as never;
    await controller.create(dto, user as never, '127.0.0.1');
    expect(service.create).toHaveBeenCalledWith(dto, 'actor-1', '127.0.0.1');
  });

  it('delegates update with the actor and ip', async () => {
    const dto = {} as never;
    await controller.update('cat-1', dto, user as never, '127.0.0.1');
    expect(service.update).toHaveBeenCalledWith('cat-1', dto, 'actor-1', '127.0.0.1');
  });

  it('delegates reorder with the actor and ip', async () => {
    const dto = {} as never;
    await controller.reorder('cat-1', dto, user as never, '127.0.0.1');
    expect(service.reorder).toHaveBeenCalledWith('cat-1', dto, 'actor-1', '127.0.0.1');
  });

  it('delegates softDelete with the actor and ip', async () => {
    await controller.softDelete('cat-1', user as never, '127.0.0.1');
    expect(service.softDelete).toHaveBeenCalledWith('cat-1', 'actor-1', '127.0.0.1');
  });
});
