import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: { list: jest.Mock };

  beforeEach(() => {
    auditService = { list: jest.fn() };
    controller = new AuditController(auditService as unknown as AuditService);
  });

  it('requires OPERATOR or ADMIN on the list route', () => {
    const reflector = new Reflector();

    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AuditController.prototype.list,
      AuditController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates list with the query', async () => {
    const query = { page: 2, limit: 10, entity: 'User' };
    auditService.list.mockResolvedValue({ items: [], total: 0, page: 2, limit: 10 });

    const result = await controller.list(query);

    expect(auditService.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({ items: [], total: 0, page: 2, limit: 10 });
  });
});