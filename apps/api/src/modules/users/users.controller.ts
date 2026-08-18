import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Ip,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { UsersService } from './users.service';
import { ListUsersQueryDto, SuspendUserDto } from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with search, filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated user summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single user detail' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getDetail(@Param('id', UUID_PARAM) userId: string) {
    return this.usersService.getDetail(userId);
  }

  @Patch(':id/suspend')
  @ApiOperation({
    summary: 'Suspend an ACTIVE user: revokes all sessions and audits the change',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User suspended.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'State conflict, self-suspension or last active ADMIN.' })
  async suspend(
    @Param('id', UUID_PARAM) userId: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.usersService.suspendUser(userId, user.userId, dto, ipAddress);
  }

  @Patch(':id/unsuspend')
  @ApiOperation({ summary: 'Un-suspend a SUSPENDED user' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User un-suspended.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'State conflict.' })
  async unsuspend(
    @Param('id', UUID_PARAM) userId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.usersService.unsuspendUser(userId, user.userId, ipAddress);
  }

  @Patch(':id/unlock')
  @Roles(AppRole.ADMIN)
  @ApiOperation({ summary: 'Unlock a LOCKED user (ADMIN only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User unlocked.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'State conflict.' })
  async unlock(
    @Param('id', UUID_PARAM) userId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.usersService.unlockUser(userId, user.userId, ipAddress);
  }

  @Put(':id/roles/:role')
  @Roles(AppRole.ADMIN)
  @ApiOperation({ summary: 'Assign a role to a user (ADMIN only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'role', enum: AppRole })
  @ApiResponse({ status: 200, description: 'Role assigned.' })
  @ApiResponse({ status: 400, description: 'Invalid role.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User or role not found.' })
  async assignRole(
    @Param('id', UUID_PARAM) userId: string,
    @Param('role', new ParseEnumPipe(AppRole)) role: AppRole,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.usersService.assignRole(userId, role, user.userId, ipAddress);
  }

  @Delete(':id/roles/:role')
  @Roles(AppRole.ADMIN)
  @ApiOperation({ summary: 'Remove a role from a user (ADMIN only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'role', enum: AppRole })
  @ApiResponse({ status: 200, description: 'Role removed.' })
  @ApiResponse({ status: 400, description: 'Invalid role.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User or role not found.' })
  async removeRole(
    @Param('id', UUID_PARAM) userId: string,
    @Param('role', new ParseEnumPipe(AppRole)) role: AppRole,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.usersService.removeRole(userId, role, user.userId, ipAddress);
  }
}