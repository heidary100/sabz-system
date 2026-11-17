import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CampaignService } from './campaign.service';
import { ListMerchCampaignsQueryDto } from './dto';

const UUID_PARAM = new ParseUUIDPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

const CAMPAIGN_BODY_SCHEMA = {
  type: 'object',
  properties: {
    internalName: { type: 'string', maxLength: 255 },
    type: {
      type: 'string',
      enum: [
        'SEASONAL',
        'DISCOUNT',
        'BRAND',
        'CATEGORY',
        'NEW_ARRIVAL',
        'CLEARANCE',
        'EDITORIAL',
      ],
    },
    titleFa: { type: 'string', maxLength: 200 },
    eyebrowFa: { type: 'string', maxLength: 120, nullable: true },
    subtitleFa: { type: 'string', maxLength: 300, nullable: true },
    descriptionFa: { type: 'string', maxLength: 1000, nullable: true },
    ctaLabelFa: { type: 'string', maxLength: 120, nullable: true },
    cta: {
      type: 'object',
      description:
        'Typed internal CTA target: NONE, ALL_PRODUCTS, NEW_ARRIVALS, PRODUCT, CATEGORY or BRAND.',
    },
    isEnabled: { type: 'boolean' },
    startsAt: { type: 'string', format: 'date-time', nullable: true },
    endsAt: { type: 'string', format: 'date-time', nullable: true },
    priority: { type: 'integer', minimum: 0, maximum: 1000000 },
    productIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
    categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
    brandIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
    media: {
      type: 'array',
      items: {
        type: 'object',
        required: ['mediaId', 'slot'],
        properties: {
          mediaId: { type: 'string', format: 'uuid' },
          slot: {
            type: 'string',
            enum: ['HERO_DESKTOP', 'HERO_MOBILE', 'BANNER', 'EDITORIAL'],
          },
          focalX: { type: 'integer', minimum: 0, maximum: 100 },
          focalY: { type: 'integer', minimum: 0, maximum: 100 },
          altFa: { type: 'string', maxLength: 160, nullable: true },
        },
      },
    },
  },
};

/**
 * Authenticated campaign management (Task 05.3).
 *
 * Campaigns are reusable source content, so no public route exists here.
 * Publishing a campaign is exclusively a homepage-publication operation.
 */
@ApiTags('admin-merchandising-campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/merchandising/campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'List merchandising campaigns' })
  @ApiResponse({ status: 200, description: 'Paginated campaign summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListMerchCampaignsQueryDto) {
    return this.campaignService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a merchandising campaign draft' })
  @ApiBody({ schema: CAMPAIGN_BODY_SCHEMA })
  @ApiResponse({ status: 201, description: 'Campaign created.' })
  @ApiResponse({ status: 400, description: 'Invalid campaign payload.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    // Raw body: campaign validation rejects unknown/server-controlled fields
    // instead of silently discarding them via the global whitelist.
    return this.campaignService.create(user.userId, body, ipAddress);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign detail with ordered associations' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Campaign not found.' })
  async detail(@Param('id', UUID_PARAM) id: string) {
    return this.campaignService.getDetail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a non-archived campaign' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ schema: CAMPAIGN_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Campaign updated.' })
  @ApiResponse({ status: 400, description: 'Invalid campaign payload.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Campaign not found.' })
  @ApiResponse({ status: 409, description: 'Campaign is archived.' })
  async update(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.campaignService.update(id, user.userId, body, ipAddress);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable a non-archived campaign (does not publish)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign enabled.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Campaign not found.' })
  @ApiResponse({ status: 409, description: 'Campaign is archived.' })
  async enable(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.campaignService.setEnabled(id, true, user.userId, ipAddress);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable a non-archived campaign (does not unpublish)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign disabled.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Campaign not found.' })
  @ApiResponse({ status: 409, description: 'Campaign is archived.' })
  async disable(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.campaignService.setEnabled(id, false, user.userId, ipAddress);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an unused campaign without deleting it' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Campaign archived.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Campaign not found.' })
  @ApiResponse({
    status: 409,
    description: 'Campaign is referenced by a current or scheduled publication.',
  })
  async archive(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.campaignService.archive(id, user.userId, ipAddress);
  }
}
