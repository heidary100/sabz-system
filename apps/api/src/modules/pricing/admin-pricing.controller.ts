import {
  Body,
  Controller,
  Delete,
  Get,
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
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AdminPricingService } from './admin-pricing.service';
import {
  CreateCategoryPriceRuleDto,
  CreateProductPriceOverrideDto,
  CreatePromotionDto,
  PricingListQueryDto,
  UpdateCategoryPriceRuleDto,
  UpdateProductPriceOverrideDto,
  UpdatePromotionDto,
} from './dto/admin-pricing.dto';

const UUID_PARAM = new ParseUUIDPipe({ version: '4' });

/**
 * Operator pricing management (SS-240B). OPERATOR/ADMIN only; CRUD for the
 * three models that feed `PricingService.resolveLine` (category rules,
 * product overrides, promotions). Bulk tiers stay hardcoded
 * (`BULK_DISCOUNT_TIERS`) — no endpoint for them here.
 */
@ApiTags('admin-pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/pricing')
export class AdminPricingController {
  constructor(private readonly adminPricing: AdminPricingService) {}

  // -------------------------------------------------------------------------
  // Category rules
  // -------------------------------------------------------------------------

  @Get('category-rules')
  @ApiOperation({ summary: 'List category price rules, newest first (operators)' })
  @ApiResponse({ status: 200, description: 'Rules returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listRules(@Query() query: PricingListQueryDto) {
    return this.adminPricing.listRules({
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('category-rules')
  @ApiOperation({ summary: 'Create a category price rule (operators)' })
  @ApiResponse({ status: 201, description: 'Rule created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  async createRule(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCategoryPriceRuleDto,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.createRule(user.userId, dto, ipAddress);
  }

  @Get('category-rules/:id')
  @ApiOperation({ summary: 'Get a category price rule (operators)' })
  @ApiParam({ name: 'id', description: 'Rule id' })
  @ApiResponse({ status: 200, description: 'Rule returned.' })
  @ApiResponse({ status: 400, description: 'Invalid rule id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  async getRule(@Param('id', UUID_PARAM) id: string) {
    return this.adminPricing.getRule(id);
  }

  @Patch('category-rules/:id')
  @ApiOperation({ summary: 'Update a category price rule (operators)' })
  @ApiParam({ name: 'id', description: 'Rule id' })
  @ApiResponse({ status: 200, description: 'Rule updated.' })
  @ApiResponse({ status: 400, description: 'Invalid rule id or body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Rule or category not found.' })
  async updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: UpdateCategoryPriceRuleDto,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.updateRule(user.userId, id, dto, ipAddress);
  }

  @Delete('category-rules/:id')
  @ApiOperation({ summary: 'Delete a category price rule (operators)' })
  @ApiParam({ name: 'id', description: 'Rule id' })
  @ApiResponse({ status: 200, description: 'Rule deleted.' })
  @ApiResponse({ status: 400, description: 'Invalid rule id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  async deleteRule(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.deleteRule(user.userId, id, ipAddress);
  }

  // -------------------------------------------------------------------------
  // Product overrides
  // -------------------------------------------------------------------------

  @Get('product-overrides')
  @ApiOperation({ summary: 'List product price overrides, newest first (operators)' })
  @ApiResponse({ status: 200, description: 'Overrides returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listOverrides(@Query() query: PricingListQueryDto) {
    return this.adminPricing.listOverrides({
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('product-overrides')
  @ApiOperation({ summary: 'Create a product price override (operators)' })
  @ApiResponse({ status: 201, description: 'Override created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate override for product.' })
  async createOverride(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductPriceOverrideDto,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.createOverride(user.userId, dto, ipAddress);
  }

  @Get('product-overrides/:id')
  @ApiOperation({ summary: 'Get a product price override (operators)' })
  @ApiParam({ name: 'id', description: 'Override id' })
  @ApiResponse({ status: 200, description: 'Override returned.' })
  @ApiResponse({ status: 400, description: 'Invalid override id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Override not found.' })
  async getOverride(@Param('id', UUID_PARAM) id: string) {
    return this.adminPricing.getOverride(id);
  }

  @Patch('product-overrides/:id')
  @ApiOperation({ summary: 'Update a product price override (operators)' })
  @ApiParam({ name: 'id', description: 'Override id' })
  @ApiResponse({ status: 200, description: 'Override updated.' })
  @ApiResponse({ status: 400, description: 'Invalid override id or body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Override not found.' })
  async updateOverride(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: UpdateProductPriceOverrideDto,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.updateOverride(user.userId, id, dto, ipAddress);
  }

  @Delete('product-overrides/:id')
  @ApiOperation({ summary: 'Delete a product price override (operators)' })
  @ApiParam({ name: 'id', description: 'Override id' })
  @ApiResponse({ status: 200, description: 'Override deleted.' })
  @ApiResponse({ status: 400, description: 'Invalid override id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Override not found.' })
  async deleteOverride(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.deleteOverride(user.userId, id, ipAddress);
  }

  // -------------------------------------------------------------------------
  // Promotions
  // -------------------------------------------------------------------------

  @Get('promotions')
  @ApiOperation({ summary: 'List promotions, newest first (operators)' })
  @ApiResponse({ status: 200, description: 'Promotions returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listPromotions(@Query() query: PricingListQueryDto) {
    return this.adminPricing.listPromotions({
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('promotions')
  @ApiOperation({ summary: 'Create a promotion (operators)' })
  @ApiResponse({ status: 201, description: 'Promotion created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Duplicate promotion code.' })
  async createPromotion(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePromotionDto,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.createPromotion(user.userId, dto, ipAddress);
  }

  @Get('promotions/:id')
  @ApiOperation({ summary: 'Get a promotion (operators)' })
  @ApiParam({ name: 'id', description: 'Promotion id' })
  @ApiResponse({ status: 200, description: 'Promotion returned.' })
  @ApiResponse({ status: 400, description: 'Invalid promotion id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Promotion not found.' })
  async getPromotion(@Param('id', UUID_PARAM) id: string) {
    return this.adminPricing.getPromotion(id);
  }

  @Patch('promotions/:id')
  @ApiOperation({ summary: 'Update a promotion (operators)' })
  @ApiParam({ name: 'id', description: 'Promotion id' })
  @ApiResponse({ status: 200, description: 'Promotion updated.' })
  @ApiResponse({ status: 400, description: 'Invalid promotion id or body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Promotion not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate promotion code.' })
  async updatePromotion(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: UpdatePromotionDto,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.updatePromotion(user.userId, id, dto, ipAddress);
  }

  @Delete('promotions/:id')
  @ApiOperation({ summary: 'Delete a promotion (operators)' })
  @ApiParam({ name: 'id', description: 'Promotion id' })
  @ApiResponse({ status: 200, description: 'Promotion deleted.' })
  @ApiResponse({ status: 400, description: 'Invalid promotion id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Promotion not found.' })
  async deletePromotion(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.adminPricing.deletePromotion(user.userId, id, ipAddress);
  }
}
