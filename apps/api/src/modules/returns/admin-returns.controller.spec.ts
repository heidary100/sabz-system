import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { AdminReturnsController } from './admin-returns.controller';
import { ReturnsService } from './returns.service';

describe('AdminReturnsController (SS-242)', () => {
  let controller: AdminReturnsController;
  let returnsService: {
    listForAdmin: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
  };

  beforeEach(() => {
    returnsService = {
      listForAdmin: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
    };
    controller = new AdminReturnsController(
      returnsService as unknown as ReturnsService,
    );
  });

  it('requires OPERATOR or ADMIN at the controller level', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminReturnsController.prototype.list,
      AdminReturnsController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates the queue query with defaults intact', async () => {
    returnsService.listForAdmin.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { status: 'PENDING' as const, page: 1, limit: 20 };

    const result = await controller.list(query);

    expect(returnsService.listForAdmin).toHaveBeenCalledWith({
      status: 'PENDING',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('delegates approve/reject transitions to the service', async () => {
    returnsService.approve.mockResolvedValue({ id: 'r1', status: 'APPROVED' });
    returnsService.reject.mockResolvedValue({ id: 'r1', status: 'REJECTED' });

    await controller.approve({ userId: 'op-1' } as never, 'r1');
    expect(returnsService.approve).toHaveBeenCalledWith(
      'op-1',
      'r1',
      undefined,
    );

    await controller.reject({ userId: 'op-1' } as never, 'r1', {
      reason: 'دلیل.',
    });
    expect(returnsService.reject).toHaveBeenCalledWith(
      'op-1',
      'r1',
      'دلیل.',
      undefined,
    );
  });
});
