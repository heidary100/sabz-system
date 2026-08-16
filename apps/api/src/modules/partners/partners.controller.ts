import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { DocumentsService } from './documents.service';
import { CreateApplicationDto, UpdateApplicationDto, UploadDocumentDto } from './dto';
import { OversizedUploadFilter } from './oversized-upload.filter';
import { PartnersService } from './partners.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(OversizedUploadFilter)
@Controller('partners')
export class PartnersController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('apply')
  @ApiOperation({ summary: 'Create the authenticated user\'s partner application' })
  @ApiResponse({ status: 201, description: 'Application created.' })
  @ApiResponse({ status: 400, description: 'Profile required or invalid data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 409, description: 'Application already exists.' })
  @ApiResponse({ status: 422, description: 'Submission validation failed.' })
  async createApplication(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
    @Ip() ipAddress?: string,
  ) {
    return this.partnersService.createApplication(user.userId, dto, ipAddress);
  }

  @Get('application')
  @ApiOperation({ summary: 'Return the authenticated user\'s partner application' })
  @ApiResponse({ status: 200, description: 'Application returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'No application found.' })
  async getApplication(@CurrentUser() user: AuthUser) {
    return this.partnersService.getApplication(user.userId);
  }

  @Patch('application')
  @ApiOperation({ summary: 'Edit and/or submit the authenticated user\'s application' })
  @ApiResponse({ status: 200, description: 'Application updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'No application found.' })
  @ApiResponse({ status: 409, description: 'Application locked.' })
  @ApiResponse({ status: 422, description: 'Submission validation failed.' })
  async updateApplication(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateApplicationDto,
    @Ip() ipAddress?: string,
  ) {
    return this.partnersService.updateApplication(user.userId, dto, ipAddress);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      // defParamCharset: busboy otherwise decodes the multipart filename
      // parameter as latin1, mangling non-ASCII (e.g. Persian) filenames.
      defParamCharset: 'utf8',
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
        if (!allowed.includes(file.mimetype)) {
          callback(new BadRequestException('فرمت فایل پشتیبانی نمیشود.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document type and file',
    schema: {
      type: 'object',
      required: ['type', 'file'],
      properties: {
        type: { type: 'string', enum: ['BUSINESS_LICENSE', 'NATIONAL_ID', 'TAX_REGISTRATION', 'SUPPORTING'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a business document' })
  @ApiResponse({ status: 201, description: 'Document uploaded.' })
  @ApiResponse({ status: 400, description: 'Invalid file or missing file.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'No application found.' })
  @ApiResponse({ status: 409, description: 'Document mutations locked.' })
  async uploadDocument(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Ip() ipAddress?: string,
  ) {
    if (!file) {
      throw new BadRequestException('فایل الزامی است.');
    }
    return this.documentsService.upload(user.userId, dto.type, file, ipAddress);
  }

  @Get('documents')
  @ApiOperation({ summary: 'List the authenticated user\'s documents' })
  @ApiResponse({ status: 200, description: 'Documents returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'No application found.' })
  async listDocuments(@CurrentUser() user: AuthUser) {
    return this.documentsService.list(user.userId);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Download one of the authenticated user\'s documents' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document binary returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async downloadDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) documentId: string,
  ) {
    const { buffer, summary } = await this.documentsService.getBinary(
      user.userId,
      documentId,
    );

    // RFC 6266: filename* carries the real UTF-8 name (Persian etc.); the
    // ASCII-safe filename= value is only a fallback for legacy clients. The
    // original name was already sanitized (no path separators/control chars).
    const asciiFallback = summary.originalName
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/"/g, "'")
      .trim();

    return new StreamableFile(buffer, {
      type: summary.mimeType,
      disposition: `attachment; filename="${asciiFallback || `document-${summary.id}.${this.extensionFromMime(summary.mimeType)}`}"; filename*=UTF-8''${encodeURIComponent(summary.originalName)}`,
      length: buffer.length,
    });
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Remove one of the authenticated user\'s documents' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  @ApiResponse({ status: 409, description: 'Document mutations locked.' })
  async removeDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) documentId: string,
    @Ip() ipAddress?: string,
  ) {
    await this.documentsService.remove(user.userId, documentId, ipAddress);
    return { removed: true };
  }

  private extensionFromMime(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'image/png') return 'png';
    return 'jpg';
  }
}
