import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewsService } from './reviews.service';

describe('AdminReviewsController (SS-240D)', () => {
  let controller: AdminReviewsController;
  let reviewsService: { listForModeration: jest.Mock };

  beforeEach(() => {
    reviewsService = { listForModeration: jest.fn() };
    controller = new AdminReviewsController(
      reviewsService as unknown as ReviewsService,
    );
  });

  it('requires OPERATOR or ADMIN at the controller level', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminReviewsController.prototype.list,
      AdminReviewsController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates the queue query with defaults intact', async () => {
    reviewsService.listForModeration.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { status: 'PENDING' as const, page: 1, limit: 20 };

    const result = await controller.list(query);

    expect(reviewsService.listForModeration).toHaveBeenCalledWith({
      status: 'PENDING',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });
});
