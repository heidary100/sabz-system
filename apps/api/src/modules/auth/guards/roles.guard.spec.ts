import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppRole } from '../enums/app-role.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { RolesService } from '../roles/roles.service';
import { Roles, ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

class TestController {
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  restricted() {
    return 'ok';
  }

  unrestricted() {
    return 'ok';
  }
}

type Handler = () => string;

const handlers: Record<string, Handler> = {
  restricted: TestController.prototype.restricted,
  unrestricted: TestController.prototype.unrestricted,
};

const user: AuthUser = {
  userId: 'user-1',
  sessionId: 'session-1',
  mobile: '+989123456789',
};

const createContext = (
  method: string,
  request: { user?: AuthUser } = { user },
): ExecutionContext =>
  ({
    getHandler: () => handlers[method],
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let rolesService: { findRoleNamesByUserId: jest.Mock };
  let guard: RolesGuard;

  beforeEach(async () => {
    rolesService = { findRoleNamesByUserId: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        Reflector,
        { provide: RolesService, useValue: rolesService },
        RolesGuard,
      ],
    }).compile();

    reflector = moduleRef.get(Reflector);
    guard = moduleRef.get(RolesGuard);
  });

  it('exposes the roles metadata via the Roles decorator', () => {
    expect(
      reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        TestController.prototype.restricted,
        TestController,
      ]),
    ).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('allows access when no roles metadata is set', async () => {
    await expect(guard.canActivate(createContext('unrestricted'))).resolves.toBe(
      true,
    );
    expect(rolesService.findRoleNamesByUserId).not.toHaveBeenCalled();
  });

  it('allows access when the user holds one of the required roles', async () => {
    rolesService.findRoleNamesByUserId.mockResolvedValue([AppRole.ADMIN]);

    await expect(guard.canActivate(createContext('restricted'))).resolves.toBe(
      true,
    );
    expect(rolesService.findRoleNamesByUserId).toHaveBeenCalledWith('user-1');
  });

  it('rejects with 403 when the user holds none of the required roles', async () => {
    rolesService.findRoleNamesByUserId.mockResolvedValue([AppRole.CUSTOMER]);

    await expect(guard.canActivate(createContext('restricted'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects with 401 when identity has not been established', async () => {
    rolesService.findRoleNamesByUserId.mockResolvedValue([AppRole.ADMIN]);

    await expect(
      guard.canActivate(createContext('restricted', {})),
    ).rejects.toThrow(UnauthorizedException);
    expect(rolesService.findRoleNamesByUserId).not.toHaveBeenCalled();
  });
});
