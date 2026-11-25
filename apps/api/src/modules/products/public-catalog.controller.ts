import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PipeTransform,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
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
import { CategoryImageService } from './category-image.service';
import {
  ListCatalogBrandsQueryDto,
  ListCatalogProductsQueryDto,
} from './dto';
import {
  CatalogCompareQueryDto,
  CatalogFacetsQueryDto,
} from './dto/catalog-facets-query.dto';

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
  constructor(
    private readonly publicCatalogService: PublicCatalogService,
    private readonly categoryImages: CategoryImageService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Visible category tree with published-product counts',
  })
  @ApiResponse({ status: 200, description: 'Category tree returned.' })
  async tree() {
    return this.publicCatalogService.getCategoryTree();
  }

  @Get(':id/image')
  @SkipThrottle()
  async image(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) categoryId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, mimeType, sizeBytes } = await this.categoryImages.read(categoryId);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return new StreamableFile(stream, { type: mimeType, length: sizeBytes });
  }

  @Get('covers')
  @ApiOperation({
    summary: 'Derived representative images for a bounded category slug list',
  })
  @ApiQuery({
    name: 'slugs',
    required: false,
    description:
      'Comma-separated visible category slugs, maximum 12. Unknown/invisible slugs are omitted.',
    type: String,
  })
  @ApiResponse({ status: 200, description: 'Category covers returned.' })
  @ApiResponse({ status: 400, description: 'More than 12 slugs requested.' })
  async covers(@Query('slugs') slugs?: string | string[]) {
    return this.publicCatalogService.getCategoryCovers(
      Array.isArray(slugs) ? slugs.join(',') : slugs,
    );
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
@Controller('catalog/facets')
export class PublicCatalogFacetsController {
  constructor(private readonly publicCatalogService: PublicCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Category-aware attribute and brand facets (SS-900)',
  })
  @ApiResponse({ status: 200, description: 'Facets returned.' })
  async facets(@Query() query: CatalogFacetsQueryDto) {
    return this.publicCatalogService.getFacets(query.category ?? null);
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
  @ApiQuery({
    name: 'attrs',
    required: false,
    type: String,
    description: 'JSON attribute filters keyed by attribute slug (SS-900)',
  })
  @ApiResponse({ status: 200, description: 'Paginated product cards returned.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async list(@Query() query: ListCatalogProductsQueryDto) {
    return this.publicCatalogService.listProducts(query);
  }

  @Get('compare')
  @ApiOperation({
    summary: 'Category-aware product comparison from the real catalog (SS-900)',
  })
  @ApiQuery({ name: 'slugs', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Comparison returned.' })
  @ApiResponse({ status: 400, description: 'Invalid or too many slugs.' })
  async compare(@Query() query: CatalogCompareQueryDto) {
    const slugs = [
      ...new Set(
        query.slugs
          .split(',')
          .map((slug) => slug.trim())
          .filter((slug) => slug.length > 0),
      ),
    ];
    for (const slug of slugs) {
      if (slug.length > 200 || !SLUG_PATTERN.test(slug)) {
        throw new BadRequestException('شناسه محصول معتبر نیست.');
      }
    }
    return this.publicCatalogService.compare(slugs);
  }

  @Get(':slug/price')
  @UseGuards(OptionalJwtAuthGuard)
  // Personalized response: never stored by browsers, proxies or the CDN.
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Authorization')
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
