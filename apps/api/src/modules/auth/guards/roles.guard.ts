import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole } from '../enums/app-role.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { RolesService } from '../roles/roles.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) {
      throw new UnauthorizedException();
    }

    const userRoles = await this.rolesService.findRoleNamesByUserId(user.userId);
    const allowed = userRoles.some((role) => requiredRoles.includes(role));
    if (!allowed) {
      throw new ForbiddenException();
    }

    return true;
  }
}
