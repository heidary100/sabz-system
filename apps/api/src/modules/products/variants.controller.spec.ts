import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  AdminVariantsController,
  ProductVariantsController,
} from './variants.controller';
import { VariantsService } from './variants.service';

describe('ProductVariantsController', () => {
  let controller: ProductVariantsController;
  let service: { list: jest.Mock; create: jest.Mock };

  const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

  beforeEach(() => {
    service = { list: jest.fn(), create: jest.fn() };
    controller = new ProductVariantsController(
      service as unknown as VariantsService,
    );
  });

  it('requires OPERATOR or ADMIN on list and create', () => {
    const reflector = new Reflector();
    for (const handler of [
      ProductVariantsController.prototype.list,
      ProductVariantsController.prototype.create,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        ProductVariantsController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }
  });

  it('delegates list to the service with the product id', async () => {
    await controller.list('prod-1');
    expect(service.list).toHaveBeenCalledWith('prod-1');
  });

  it('delegates create with product id, actor and ip', async () => {
    const dto = {} as never;
    await controller.create('prod-1', dto, user as never, '127.0.0.1');
    expect(service.create).toHaveBeenCalledWith('prod-1', dto, 'actor-1', '127.0.0.1');
  });
});

describe('AdminVariantsController', () => {
  let controller: AdminVariantsController;
  let service: {
    getDetail: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    updateInventory: jest.Mock;
  };

  const user = { userId: 'actor-1', sessionId: 's', mobile: '+989120000000' };

  beforeEach(() => {
    service = {
      getDetail: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      updateInventory: jest.fn(),
    };
    controller = new AdminVariantsController(
      service as unknown as VariantsService,
    );
  });

  it('requires OPERATOR or ADMIN on every route', () => {
    const reflector = new Reflector();
    for (const handler of [
      AdminVariantsController.prototype.getDetail,
      AdminVariantsController.prototype.update,
      AdminVariantsController.prototype.softDelete,
      AdminVariantsController.prototype.updateInventory,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        AdminVariantsController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }
  });

  it('delegates getDetail to the service', async () => {
    await controller.getDetail('var-1');
    expect(service.getDetail).toHaveBeenCalledWith('var-1');
  });

  it('delegates update with actor and ip', async () => {
    const dto = {} as never;
    await controller.update('var-1', dto, user as never, '127.0.0.1');
    expect(service.update).toHaveBeenCalledWith('var-1', dto, 'actor-1', '127.0.0.1');
  });

  it('delegates softDelete with actor and ip', async () => {
    await controller.softDelete('var-1', user as never, '127.0.0.1');
    expect(service.softDelete).toHaveBeenCalledWith('var-1', 'actor-1', '127.0.0.1');
  });

  it('delegates updateInventory with actor and ip', async () => {
    const dto = {} as never;
    await controller.updateInventory('var-1', dto, user as never, '127.0.0.1');
    expect(service.updateInventory).toHaveBeenCalledWith(
      'var-1',
      dto,
      'actor-1',
      '127.0.0.1',
    );
  });
});
