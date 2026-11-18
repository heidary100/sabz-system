import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import type { ProductAttributeValueInput } from '@sabz/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppRole } from '../auth/enums/app-role.enum';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AttributesService } from './attributes.service';
import {
  BulkAttributeApplyDto,
  BulkAttributePreviewDto,
  ProductAttributeValueItemDto,
  SetProductAttributesDto,
} from './dto/attributes.dto';

function toValueInput(
  item: ProductAttributeValueItemDto,
): ProductAttributeValueInput {
  if (Array.isArray(item.optionIds)) {
    return { attributeId: item.attributeId, optionIds: item.optionIds };
  }
  if (item.optionId !== undefined) {
    return { attributeId: item.attributeId, optionId: item.optionId };
  }
  if (item.valueText !== undefined) {
    return { attributeId: item.attributeId, valueText: item.valueText };
  }
  if (item.valueNumber !== undefined) {
    return { attributeId: item.attributeId, valueNumber: item.valueNumber };
  }
  if (item.valueBoolean !== undefined) {
    return { attributeId: item.attributeId, valueBoolean: item.valueBoolean };
  }
  throw new BadRequestException('مقدار ویژگی معتبر نیست.');
}

/**
 * Product attribute values + bulk editing (SS-900). Operators can edit values
 * and apply bulk changes; definition/category configuration stays ADMIN-only.
 */
@ApiTags('admin-product-attributes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/products')
export class AdminProductAttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get(':productId/attributes')
  @ApiOperation({ summary: 'Applicable attributes and current product values' })
  @ApiParam({ name: 'productId' })
  async get(@Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string) {
    return this.attributes.getProductAttributes(productId);
  }

  @Put(':productId/attributes')
  @ApiOperation({ summary: 'Replace applicable product attribute values' })
  async set(
    @CurrentUser() user: AuthUser,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: SetProductAttributesDto,
  ) {
    return this.attributes.setProductAttributes(
      productId,
      {
        values: dto.values.map(toValueInput),
        clearIncompatible: dto.clearIncompatible ?? false,
      },
      user.userId,
    );
  }

  @Delete(':productId/attributes/:attributeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear one non-required product attribute value' })
  async clear(
    @CurrentUser() user: AuthUser,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Param('attributeId', new ParseUUIDPipe({ version: '4' })) attributeId: string,
  ) {
    return this.attributes.clearProductAttribute(productId, attributeId);
  }
}

@ApiTags('admin-product-attributes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/products/bulk-attributes')
export class AdminBulkAttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview bulk attribute changes and affected count' })
  @ApiResponse({ status: 200, description: 'Preview returned.' })
  async preview(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAttributePreviewDto,
  ) {
    return this.attributes.previewBulk({
      products: dto.products,
      operations: dto.operations.map(toOperation),
    });
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply confirmed bulk attribute changes with per-product outcomes' })
  async apply(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAttributeApplyDto,
  ) {
    return this.attributes.applyBulk(
      {
        products: dto.products,
        operations: dto.operations.map(toOperation),
        previewToken: dto.previewToken,
      },
      user.userId,
    );
  }
}

function toOperation(op: BulkAttributePreviewDto['operations'][number]) {
  if (op.kind === 'CLEAR') {
    return { kind: 'CLEAR' as const, attributeId: op.attributeId };
  }
  if (op.optionId !== undefined) {
    return {
      kind: 'SET' as const,
      attributeId: op.attributeId,
      optionId: op.optionId,
    };
  }
  if (op.valueText !== undefined) {
    return {
      kind: 'SET' as const,
      attributeId: op.attributeId,
      valueText: op.valueText,
    };
  }
  if (op.valueNumber !== undefined) {
    return {
      kind: 'SET' as const,
      attributeId: op.attributeId,
      valueNumber: op.valueNumber,
    };
  }
  if (op.valueBoolean !== undefined) {
    return {
      kind: 'SET' as const,
      attributeId: op.attributeId,
      valueBoolean: op.valueBoolean,
    };
  }
  throw new BadRequestException('مقدار عملیات گروهی معتبر نیست.');
}
