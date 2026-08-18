import { Reflector } from '@nestjs/core';
import { AppRole } from '../auth/enums/app-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: { getSummary: jest.Mock };

  beforeEach(() => {
    dashboardService = { getSummary: jest.fn() };
    controller = new DashboardController(
      dashboardService as unknown as DashboardService,
    );
  });

  it('requires OPERATOR or ADMIN on the dashboard route', () => {
    const reflector = new Reflector();

    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      DashboardController.prototype.getDashboard,
      DashboardController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates to the dashboard service', async () => {
    const summary = {
      users: { total: 0, active: 0, suspended: 0, locked: 0, pendingOtp: 0 },
      roles: { customer: 0, partner: 0, operator: 0, admin: 0 },
      partners: { draft: 0, pending: 0, approved: 0, rejected: 0 },
      recentPartners: [],
      recentAudit: [],
    };
    dashboardService.getSummary.mockResolvedValue(summary);

    const result = await controller.getDashboard();

    expect(dashboardService.getSummary).toHaveBeenCalledTimes(1);
    expect(result).toBe(summary);
  });
});