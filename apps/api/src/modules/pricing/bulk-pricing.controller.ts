import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PromotionType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { BulkPricingService } from './bulk-pricing.service';

const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;

class ScopeDto {
  @IsString()
  @IsIn(['VARIANTS', 'PRODUCTS', 'CATEGORY'])
  type!: 'VARIANTS' | 'PRODUCTS' | 'CATEGORY';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  variantIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  includeDescendants?: boolean;
}

class OperationDto {
  @IsString()
  @IsIn([
    'APPLY_DISCOUNT',
    'CLEAR_DISCOUNT',
    'ADJUST_REGULAR_PRICE',
    'SET_OVERRIDE',
    'CLEAR_OVERRIDE',
  ])
  kind!: string;

  @IsOptional()
  @IsIn(['FIXED', 'PERCENT'])
  mode?: 'FIXED' | 'PERCENT';

  @IsOptional()
  @IsIn(['INCREASE', 'DECREASE'])
  direction?: 'INCREASE' | 'DECREASE';

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'مقدار باید عدد معتبر با حداکثر دو رقم اعشار باشد.' })
  value?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'قیمت اورراید معتبر نیست.' })
  overridePrice?: string;

  @IsOptional()
  @IsIn([PromotionType.PERCENT, PromotionType.FIXED])
  type?: PromotionType;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;
}

class PreviewDto {
  @ValidateNested()
  @Type(() => ScopeDto)
  scope!: ScopeDto;

  @ValidateNested()
  @Type(() => OperationDto)
  operation!: OperationDto;
}

class ApplyDto extends PreviewDto {
  @IsString()
  previewToken!: string;
}

class CategoryRulePreviewDto {
  @IsUUID('4')
  categoryId!: string;

  @IsBoolean()
  includeDescendants!: boolean;

  @IsIn([PromotionType.PERCENT, PromotionType.FIXED])
  type!: PromotionType;

  @IsString()
  @Matches(MONEY, { message: 'مقدار قانون معتبر نیست.' })
  value!: string;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeProductIds?: string[];
}

/**
 * Bulk financial pricing workspace (pricing-grid spec §2.2/§2.4/§2.6).
 * Preview is mandatory; apply is atomic and token-guarded. OPERATOR/ADMIN
 * matches the existing pricing-CRUD authorization (currency rates remain
 * ADMIN-only on their own controller).
 */
@ApiTags('admin-pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/pricing/bulk')
export class BulkPricingController {
  constructor(private readonly bulkPricing: BulkPricingService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview a bulk discount/price/override operation' })
  @ApiResponse({ status: 200, description: 'Preview with per-row outcomes.' })
  async preview(@Body() dto: PreviewDto) {
    return this.bulkPricing.preview({
      scope: this.normalizeScope(dto.scope),
      operation: this.normalizeOperation(dto.operation),
    });
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically apply a previewed bulk operation' })
  @ApiResponse({ status: 200, description: 'Per-row apply outcomes.' })
  @ApiResponse({ status: 409, description: 'Stale preview / concurrent edit.' })
  async apply(
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyDto,
    @Ip() ipAddress?: string,
  ) {
    return this.bulkPricing.apply(
      user.userId,
      {
        scope: this.normalizeScope(dto.scope),
        operation: this.normalizeOperation(dto.operation),
        previewToken: dto.previewToken,
      },
      ipAddress,
    );
  }

  @Post('category-rules/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview a category discount rule and conflicts' })
  async previewCategoryRule(@Body() dto: CategoryRulePreviewDto) {
    return this.bulkPricing.previewCategoryRule({
      categoryId: dto.categoryId,
      includeDescendants: dto.includeDescendants,
      type: dto.type,
      value: dto.value,
      startsAt: dto.startsAt ?? null,
      endsAt: dto.endsAt ?? null,
      excludeProductIds: dto.excludeProductIds,
    });
  }

  private normalizeScope(dto: ScopeDto): never {
    if (dto.type === 'VARIANTS') {
      if (!dto.variantIds || dto.variantIds.length === 0) {
        throw new BadRequestException('حداقل یک ردیف انتخاب کنید.');
      }
      return { type: 'VARIANTS', variantIds: dto.variantIds } as never;
    }
    if (dto.type === 'PRODUCTS') {
      if (!dto.productIds || dto.productIds.length === 0) {
        throw new BadRequestException('حداقل یک محصول انتخاب کنید.');
      }
      return { type: 'PRODUCTS', productIds: dto.productIds } as never;
    }
    if (!dto.categoryId) {
      throw new BadRequestException('دسته‌بندی الزامی است.');
    }
    return {
      type: 'CATEGORY',
      categoryId: dto.categoryId,
      includeDescendants: dto.includeDescendants ?? false,
    } as never;
  }

  private normalizeOperation(dto: OperationDto): never {
    const startsAt = dto.startsAt ?? null;
    const endsAt = dto.endsAt ?? null;
    switch (dto.kind) {
      case 'APPLY_DISCOUNT':
        if (!dto.mode || !dto.value) {
          throw new BadRequestException('نوع و مقدار تخفیف الزامی است.');
        }
        return {
          kind: 'APPLY_DISCOUNT',
          mode: dto.mode,
          value: dto.value,
        } as never;
      case 'CLEAR_DISCOUNT':
        return { kind: 'CLEAR_DISCOUNT' } as never;
      case 'ADJUST_REGULAR_PRICE':
        if (!dto.direction || !dto.value) {
          throw new BadRequestException('جهت و درصد تغییر قیمت الزامی است.');
        }
        return {
          kind: 'ADJUST_REGULAR_PRICE',
          mode: 'PERCENT',
          direction: dto.direction,
          value: dto.value,
        } as never;
      case 'SET_OVERRIDE':
        return {
          kind: 'SET_OVERRIDE',
          ...(dto.overridePrice !== undefined
            ? { overridePrice: dto.overridePrice }
            : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.value !== undefined ? { value: dto.value } : {}),
          startsAt,
          endsAt,
        } as never;
      case 'CLEAR_OVERRIDE':
        return { kind: 'CLEAR_OVERRIDE' } as never;
      default:
        throw new BadRequestException('نوع عملیات معتبر نیست.');
    }
  }
}
