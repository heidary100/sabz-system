import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Param,
  PipeTransform,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiResponse({ status: 200, description: 'Paginated product cards returned.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  async list(@Query() query: ListCatalogProductsQueryDto) {
    return this.publicCatalogService.listProducts(query);
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
