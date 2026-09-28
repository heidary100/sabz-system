import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  PipeTransform,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PublicCatalogService } from './public-catalog.service';
import {
  ListCatalogBrandsQueryDto,
  ListCatalogProductsQueryDto,
} from './dto';

/** Public slugs are server-generated kebab strings; nothing else can match. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class SlugValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (value.length > 200 || !SLUG_PATTERN.test(value)) {
      throw new BadRequestException('شناسه محصول معتبر نیست.');
    }
    return value;
  }
}

/**
 * Public, read-only catalog API for the storefront (SS-120/SS-121/SS-122). No
 * auth guard by contract: the service layer only ever returns PUBLISHED
 * products and visible categories/brands, so nothing private can leak even if
 * the routes are hit directly.
 */
@ApiTags('catalog')
@Controller('catalog/categories')
export class PublicCatalogCategoriesController {
  constructor(private readonly publicCatalogService: PublicCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Visible category tree with published-product counts',
  })
  @ApiResponse({ status: 200, description: 'Category tree returned.' })
  async tree() {
    return this.publicCatalogService.getCategoryTree();
  }
}

@ApiTags('catalog')
@Controller('catalog/brands')
export class PublicCatalogBrandsController {
  constructor(private readonly publicCatalogService: PublicCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated list of brands' })
  @ApiResponse({ status: 200, description: 'Paginated brands returned.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async list(@Query() query: ListCatalogBrandsQueryDto) {
    return this.publicCatalogService.listBrands(query);
  }
}

@ApiTags('catalog')
@Controller('catalog/products')
export class PublicCatalogProductsController {
  constructor(private readonly publicCatalogService: PublicCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Paginated listing of published products (filters, search, sort)',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'brand', required: false, type: String })
  @ApiQuery({
    name: 'condition',
    required: false,
    enum: ['NEW', 'OPEN_BOX', 'REFURBISHED', 'USED', 'STOCK_CLEARANCE'],
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['newest', 'price_asc', 'price_desc', 'name'],
  })
  @ApiQuery({ name: 'priceFrom', required: false, type: String })
  @ApiQuery({ name: 'priceTo', required: false, type: String })
  @ApiQuery({ name: 'inStockOnly', required: false, type: Boolean })
  @ApiQuery({
    name: 'rating',
    required: false,
    enum: ['1', '2', '3', '4', '5'],
  })
  @ApiResponse({ status: 200, description: 'Paginated product cards returned.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async list(@Query() query: ListCatalogProductsQueryDto) {
    return this.publicCatalogService.listProducts(query);
  }

  @Get(':slug/price')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Public per-variant price quotes (tier-aware when authed)',
  })
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiQuery({ name: 'quantity', required: false, type: Number })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Resolved price quotes returned.' })
  @ApiResponse({
    status: 404,
    description: 'Product not found, not PUBLISHED, or soft-deleted.',
  })
  async price(
    @Param('slug', SlugValidationPipe) slug: string,
    @Query('quantity') quantityRaw: string | undefined,
    @Query('variantId') variantId: string | undefined,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    let quantity = 1;
    if (quantityRaw !== undefined) {
      quantity = Number(quantityRaw);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
        throw new BadRequestException('تعداد معتبر نیست.');
      }
    }
    // Optional guard: guests resolve at retail, APPROVED partners at tier.
    const quote = await this.publicCatalogService.getPriceBySlug(
      slug,
      user?.userId ?? null,
      quantity,
    );
    if (variantId !== undefined) {
      const match = quote.quotes.find((row) => row.variantId === variantId);
      if (!match) {
        throw new NotFoundException('مدل محصول یافت نشد.');
      }
      return { ...quote, quotes: [match] };
    }
    return quote;
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Public product detail by slug' })
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiResponse({ status: 200, description: 'Product detail returned.' })
  @ApiResponse({
    status: 404,
    description: 'Product not found, not PUBLISHED, or soft-deleted.',
  })
  async detail(@Param('slug', SlugValidationPipe) slug: string) {
    return this.publicCatalogService.getProductBySlug(slug);
  }
}
