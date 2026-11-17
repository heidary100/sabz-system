import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AppRole } from '../../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { HomepageDraftService } from './homepage-draft.service';

const DRAFT_BODY_SCHEMA = {
  type: 'object',
  required: ['revision', 'sections'],
  properties: {
    revision: { type: 'integer', minimum: 0 },
    schemaVersion: { type: 'integer', minimum: 1 },
    sections: {
      type: 'array',
      maxItems: 12,
      items: { type: 'object' },
    },
  },
};

const VALIDATE_BODY_SCHEMA = {
  type: 'object',
  properties: {
    revision: { type: 'integer', minimum: 0 },
    schemaVersion: { type: 'integer', minimum: 1 },
    sections: {
      type: 'array',
      maxItems: 12,
      items: { type: 'object' },
    },
  },
};

/**
 * Singleton homepage draft (Task 05.4). ADMINS and OPERATORS edit working state;
 * nothing here publishes or modifies an existing publication snapshot.
 */
@ApiTags('admin-merchandising-homepage-draft')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/merchandising/homepage')
export class HomepageDraftController {
  constructor(private readonly draftService: HomepageDraftService) {}

  @Get('draft')
  @ApiOperation({ summary: 'Read or initialize the singleton homepage draft' })
  @ApiResponse({ status: 200, description: 'Draft returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async getDraft(
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.draftService.getDraft(user.userId, ipAddress);
  }

  @Put('draft')
  @ApiOperation({ summary: 'Replace draft sections using optimistic revision' })
  @ApiBody({ schema: DRAFT_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Draft updated and revision incremented.' })
  @ApiResponse({ status: 400, description: 'Invalid sections or unknown fields.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Stale revision or unsupported schema.' })
  async replaceDraft(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    // Raw body so unknown/server-controlled draft fields are rejected instead
    // of being silently removed by the global whitelist.
    return this.draftService.replaceDraft(user.userId, body, ipAddress);
  }

  @Post('draft/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate the current or submitted draft' })
  @ApiBody({ schema: VALIDATE_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Structured validation result.' })
  @ApiResponse({ status: 400, description: 'Invalid request shape.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Submitted revision is stale.' })
  async validateDraft(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.draftService.validateDraft(user.userId, body, ipAddress);
  }
}
