import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';

/**
 * ADMIN-only role catalog read endpoint. The role/permission catalogs are not
 * mutable in M1 (SS-063); this controller only lists them for administration
 * surfaces. No audit event is written.
 */
@ApiTags('admin-roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List available roles and their permissions (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Role summaries with permissions.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  list() {
    return this.usersService.listRoles();
  }
}
