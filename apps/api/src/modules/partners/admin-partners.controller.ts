import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AdminPartnersService } from './admin-partners.service';
import { DocumentsService } from './documents.service';
import { buildAttachmentDisposition } from './download-disposition';
import {
  ApprovePartnerDto,
  ChangeTierDto,
  ListPartnersQueryDto,
  RejectPartnerDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin-partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/partners')
export class AdminPartnersController {
  constructor(
    private readonly adminPartnersService: AdminPartnersService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List partner applications with pagination (default: PENDING)' })
  @ApiResponse({ status: 200, description: 'Paginated partner applications.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListPartnersQueryDto) {
    return this.adminPartnersService.list(query);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'List available partner tiers' })
  @ApiResponse({ status: 200, description: 'Partner tiers returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listTiers() {
    return this.adminPartnersService.listTiers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a partner application for review' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Partner detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Partner not found.' })
  async getDetail(@Param('id', UUID_PARAM) partnerId: string) {
    return this.adminPartnersService.getDetail(partnerId);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a PENDING partner application' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Partner approved and PARTNER role activated.' })
  @ApiResponse({ status: 400, description: 'Invalid tier.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Partner not found.' })
  @ApiResponse({ status: 409, description: 'State conflict or concurrent decision.' })
  @ApiResponse({ status: 422, description: 'Missing active business license.' })
  async approve(
    @Param('id', UUID_PARAM) partnerId: string,
    @Body() dto: ApprovePartnerDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPartnersService.approve(partnerId, dto, user.userId, ipAddress);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a PENDING partner application' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Partner rejected.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Partner not found.' })
  @ApiResponse({ status: 409, description: 'State conflict or concurrent decision.' })
  async reject(
    @Param('id', UUID_PARAM) partnerId: string,
    @Body() dto: RejectPartnerDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPartnersService.reject(partnerId, dto, user.userId, ipAddress);
  }

  @Patch(':id/tier')
  @ApiOperation({ summary: 'Change the tier of an APPROVED partner' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Partner tier changed.' })
  @ApiResponse({ status: 400, description: 'Invalid tier.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Partner not found.' })
  @ApiResponse({ status: 409, description: 'Partner is not APPROVED.' })
  async changeTier(
    @Param('id', UUID_PARAM) partnerId: string,
    @Body() dto: ChangeTierDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPartnersService.changeTier(partnerId, dto, user.userId, ipAddress);
  }

  @Get(':id/documents/:documentId')
  @ApiOperation({ summary: 'Download one of the partner\'s business documents' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'documentId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document binary returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async previewDocument(
    @Param('id', UUID_PARAM) partnerId: string,
    @Param('documentId', UUID_PARAM) documentId: string,
  ) {
    const { buffer, summary } = await this.documentsService.getBinaryByPartner(
      partnerId,
      documentId,
    );

    return new StreamableFile(buffer, {
      type: summary.mimeType,
      disposition: buildAttachmentDisposition(summary),
      length: buffer.length,
    });
  }
}
