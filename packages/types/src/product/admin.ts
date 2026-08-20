import type { ProductCondition, ProductStatus } from './type';

export interface ProductListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
}

export interface CategoryListQuery {
  page?: number;
  limit?: number;
}

export interface BrandListQuery {
  page?: number;
  limit?: number;
}

export interface CreateProductInput {
  name: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  brandId: string;
  categoryId: string;
  warranty?: string;
  condition: ProductCondition;
  status?: ProductStatus;
  weightKg?: string;
  widthCm?: string;
  heightCm?: string;
  depthCm?: string;
  originCountry?: string;
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  brandId?: string;
  categoryId?: string;
  warranty?: string;
  condition?: ProductCondition;
  status?: ProductStatus;
  weightKg?: string | null;
  widthCm?: string | null;
  heightCm?: string | null;
  depthCm?: string | null;
  originCountry?: string | null;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
}

export interface CreateBrandInput {
  name: string;
  slug?: string;
  description?: string;
  isFeatured?: boolean;
}

export interface UpdateBrandInput {
  name?: string;
  slug?: string;
  description?: string | null;
  isFeatured?: boolean;
}

export interface CreateVariantInput {
  sku: string;
  barcode?: string;
  name?: string;
  price: string;
  stockQuantity?: number;
}

export interface UpdateVariantInput {
  sku?: string;
  barcode?: string | null;
  name?: string | null;
  price?: string;
}

export interface UpdateVariantInventoryInput {
  stockQuantity: number;
}
