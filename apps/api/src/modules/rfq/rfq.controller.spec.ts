import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { RfqController } from './rfq.controller';
import { RfqService } from './rfq.service';

describe('RfqController', () => {
  let controller: RfqController;
  let rfqService: {
    create: jest.Mock;
    list: jest.Mock;
    detail: jest.Mock;
    quote: jest.Mock;
    reject: jest.Mock;
    accept: jest.Mock;
    isOperator: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    sessionId: 'session-1',
    mobile: '+989123456789',
  };
  const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  beforeEach(() => {
    rfqService = {
      create: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      quote: jest.fn(),
      reject: jest.fn(),
      accept: jest.fn(),
      isOperator: jest.fn().mockResolvedValue(false),
    };
    controller = new RfqController(rfqService as unknown as RfqService);
  });

  it('requires OPERATOR or ADMIN only on quote and reject routes', () => {
    const reflector = new Reflector();

    for (const handler of [
      RfqController.prototype.quote,
      RfqController.prototype.reject,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        RfqController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }

    for (const handler of [
      RfqController.prototype.create,
      RfqController.prototype.list,
      RfqController.prototype.detail,
      RfqController.prototype.accept,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        RfqController,
      ]);
      expect(roles).toBeUndefined();
    }
  });

  it('creates with the authenticated user id', async () => {
    rfqService.create.mockResolvedValue({ id });
    const dto = { variantId: id, quantity: 5 };

    const result = await controller.create(user, dto, '127.0.0.1');

    expect(rfqService.create).toHaveBeenCalledWith('user-1', dto, '127.0.0.1');
    expect(result).toEqual({ id });
  });

  it('resolves operator scope for list and detail reads', async () => {
    rfqService.isOperator.mockResolvedValue(true);
    rfqService.list.mockResolvedValue({ items: [], total: 0 });
    rfqService.detail.mockResolvedValue({ id });

    await controller.list(user, {});
    expect(rfqService.list).toHaveBeenCalledWith('user-1', {}, true);

    await controller.detail(user, id);
    expect(rfqService.detail).toHaveBeenCalledWith('user-1', id, true);
  });

  it('accepts with the owner id, body, and ip', async () => {
    rfqService.accept.mockResolvedValue({ orderId: 'order-1' });
    const dto = { addressId: id, paymentMethod: 'COD' } as const;

    const result = await controller.accept(user, id, dto, '127.0.0.1');

    expect(rfqService.accept).toHaveBeenCalledWith(
      'user-1',
      id,
      dto,
      '127.0.0.1',
    );
    expect(result).toEqual({ orderId: 'order-1' });
  });
});
