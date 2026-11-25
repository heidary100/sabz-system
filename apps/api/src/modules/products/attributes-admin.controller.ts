import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppRole } from '../auth/enums/app-role.enum';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AttributesService } from './attributes.service';
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  SetCategoryAttributesDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
} from './dto/attributes.dto';

/**
 * Attribute library + category assignment administration (SS-900).
 * Definitions are shared reference data, so writes are ADMIN-only.
 */
@ApiTags('admin-attributes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
@Controller('admin')
export class AdminAttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get('attributes')
  @ApiOperation({ summary: 'List reusable attribute definitions and option values' })
  async list() {
    return { items: await this.attributes.listAttributes() };
  }

  @Post('attributes')
  @ApiOperation({ summary: 'Create a reusable attribute definition' })
  @ApiResponse({ status: 201, description: 'Attribute created.' })
  async create(@Body() dto: CreateAttributeDto) {
    return this.attributes.createAttribute(dto);
  }

  @Patch('attributes/:id')
  @ApiOperation({ summary: 'Update a reusable attribute definition' })
  @ApiParam({ name: 'id' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAttributeDto,
  ) {
    return this.attributes.updateAttribute(id, dto);
  }

  @Delete('attributes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused attribute definition' })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.attributes.deleteAttribute(id);
  }

  @Post('attributes/:id/values')
  @ApiOperation({ summary: 'Add an option value to a select attribute' })
  async createValue(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.attributes.createAttributeValue(id, dto);
  }

  @Patch('attribute-values/:id')
  @ApiOperation({ summary: 'Update one attribute option value' })
  async updateValue(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAttributeValueDto,
  ) {
    return this.attributes.updateAttributeValue(id, dto);
  }

  @Delete('attribute-values/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused attribute option value' })
  async removeValue(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.attributes.deleteAttributeValue(id);
  }

  @Get('categories/:categoryId/attributes')
  @ApiOperation({ summary: 'Resolved attributes for a category (with inheritance)' })
  async categoryAttributes(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
  ) {
    return this.attributes.listCategoryAttributes(categoryId);
  }

  @Put('categories/:categoryId/attributes')
  @ApiOperation({ summary: 'Replace explicit attribute assignments for a category' })
  async setCategoryAttributes(
    @CurrentUser() user: AuthUser,
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
    @Body() dto: SetCategoryAttributesDto,
  ) {
    return this.attributes.setCategoryAttributes(
      categoryId,
      dto.attributes,
      user.userId,
    );
  }
}
