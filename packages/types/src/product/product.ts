import type {
  ProductCondition,
  ProductMediaType,
  ProductStatus,
} from './type';

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isVisible: boolean;
}

export interface CategoryDetail extends CategorySummary {
  children: CategorySummary[];
}

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isFeatured: boolean;
}

export interface VariantSummary {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  price: string;
  stockQuantity: number;
}

export interface ProductMediaSummary {
  id: string;
  productId: string;
  variantId: string | null;
  mediaType: ProductMediaType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  condition: ProductCondition;
  status: ProductStatus;
  brand: BrandSummary;
  category: CategorySummary;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  brand: BrandSummary;
  category: CategorySummary;
  warranty: string | null;
  condition: ProductCondition;
  status: ProductStatus;
  weightKg: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  originCountry: string | null;
  variants: VariantSummary[];
  media: ProductMediaSummary[];
  createdAt: string;
  updatedAt: string;
}
