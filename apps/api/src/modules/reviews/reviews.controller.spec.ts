import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let reviewsService: {
    create: jest.Mock;
    listByProduct: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    sessionId: 'session-1',
    mobile: '+989123456789',
  };
  const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  beforeEach(() => {
    reviewsService = {
      create: jest.fn(),
      listByProduct: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
    };
    controller = new ReviewsController(
      reviewsService as unknown as ReviewsService,
    );
  });

  it('requires OPERATOR or ADMIN only on approve and reject routes', () => {
    const reflector = new Reflector();

    for (const handler of [
      ReviewsController.prototype.approve,
      ReviewsController.prototype.reject,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        ReviewsController,
      ]);
      expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
    }

    for (const handler of [
      ReviewsController.prototype.create,
      ReviewsController.prototype.listByProduct,
    ]) {
      const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        handler,
        ReviewsController,
      ]);
      expect(roles).toBeUndefined();
    }
  });

  it('creates with the authenticated user id', async () => {
    reviewsService.create.mockResolvedValue({ id });
    const dto = { productId: id, rating: 5 };

    const result = await controller.create(user, dto, '127.0.0.1');

    expect(reviewsService.create).toHaveBeenCalledWith('user-1', dto, '127.0.0.1');
    expect(result).toEqual({ id });
  });

  it('delegates public list, approve, and reject with ids', async () => {
    reviewsService.listByProduct.mockResolvedValue({ items: [], total: 0 });
    reviewsService.approve.mockResolvedValue({ id });
    reviewsService.reject.mockResolvedValue({ id });

    await controller.listByProduct(id, {});
    expect(reviewsService.listByProduct).toHaveBeenCalledWith(id, {});

    await controller.approve(user, id, '127.0.0.1');
    expect(reviewsService.approve).toHaveBeenCalledWith('user-1', id, '127.0.0.1');

    await controller.reject(user, id, undefined);
    expect(reviewsService.reject).toHaveBeenCalledWith('user-1', id, undefined);
  });
});
