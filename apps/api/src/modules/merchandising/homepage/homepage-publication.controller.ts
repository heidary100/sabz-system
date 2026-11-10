import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AppRole } from '../../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { ListHomepagePublicationsQueryDto } from './dto';
import { HomepagePublicationService } from './homepage-publication.service';

const UUID_PARAM = new ParseUUIDPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

const PUBLICATION_BODY_SCHEMA = {
  type: 'object',
  properties: {
    publishAt: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Absent/null publishes immediately; future ISO schedules.',
    },
    note: { type: 'string', maxLength: 500, nullable: true },
  },
};

/**
 * Versioned homepage publications (Task 05.4).
 *
 * OPERATOR/ADMIN may inspect history; only ADMIN may publish, schedule, cancel,
 * or roll back. Time-based activation is intentionally owned by Task 05.6.
 */
@ApiTags('admin-merchandising-homepage-publications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/merchandising/homepage/publications')
export class HomepagePublicationController {
  constructor(private readonly publicationService: HomepagePublicationService) {}

  @Get()
  @ApiOperation({ summary: 'List homepage publication history' })
  @ApiResponse({ status: 200, description: 'Paginated publication summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListHomepagePublicationsQueryDto) {
    return this.publicationService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an immutable publication snapshot' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Publication detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Publication not found.' })
  async detail(@Param('id', UUID_PARAM) id: string) {
    return this.publicationService.getDetail(id);
  }

  @Post()
  @Roles(AppRole.ADMIN)
  @ApiOperation({ summary: 'Publish the current draft immediately or schedule it' })
  @ApiBody({ schema: PUBLICATION_BODY_SCHEMA })
  @ApiResponse({ status: 201, description: 'Publication created.' })
  @ApiResponse({ status: 400, description: 'Invalid draft or schedule.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ADMIN required.' })
  async publish(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.publicationService.publish(user.userId, body, ipAddress);
  }

  @Post(':id/cancel')
  @Roles(AppRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled publication' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Scheduled publication cancelled.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ADMIN required.' })
  @ApiResponse({ status: 404, description: 'Publication not found.' })
  @ApiResponse({ status: 409, description: 'Publication is not scheduled.' })
  async cancel(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.publicationService.cancel(id, user.userId, ipAddress);
  }

  @Post(':id/rollback')
  @Roles(AppRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new publication from an earlier snapshot' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { note: { type: 'string', maxLength: 500, nullable: true } },
    },
  })
  @ApiResponse({ status: 200, description: 'Rollback publication created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ADMIN required.' })
  @ApiResponse({ status: 404, description: 'Publication not found.' })
  @ApiResponse({ status: 409, description: 'Snapshot content is no longer eligible.' })
  async rollback(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.publicationService.rollback(id, user.userId, body, ipAddress);
  }
}
