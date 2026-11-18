import type { AttributeType } from './type';
import type { CatalogBrandDto } from '../catalog/catalog';

/**
 * Attribute/spec shared shapes (SS-202/ADR-005, extended by SS-900).
 *
 * Definitions are reusable reference data. Category assignments decide which
 * definitions apply to a category; product values store the actual typed
 * value. Legacy importer rows remain valid option assignments.
 */

export type AttributeValueType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT';

export const ATTRIBUTE_VALUE_TYPE_FA: Record<AttributeValueType, string> = {
  TEXT: 'متنی',
  NUMBER: 'عددی',
  BOOLEAN: 'بله/خیر',
  SELECT: 'انتخابی (تک‌مقداری)',
  MULTI_SELECT: 'انتخابی (چندمقداری)',
};

export interface AttributeDto {
  id: string;
  name: string;
  slug: string;
  type: AttributeType;
  group: string | null;
  isFilterable: boolean;
  isGlobal: boolean;
  valueType: AttributeValueType;
  unit: string | null;
  description: string | null;
  isComparable: boolean;
}

export interface AttributeValueDto {
  id: string;
  attributeId: string;
  value: string;
  slug: string;
  normalizedValue: string | null;
  numericValue: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface AttributeWithValuesDto extends AttributeDto {
  values: AttributeValueDto[];
}

/** Legacy product-spec shape retained for existing admin/detail consumers. */
export interface ProductSpecDto {
  id: string;
  sortOrder: number;
  source: string;
  attributeValue: AttributeValueDto & {
    attribute: Pick<
      AttributeDto,
      'id' | 'name' | 'slug' | 'group' | 'isFilterable'
    >;
  };
}

/**
 * Resolved assignment for a category. `inheritedFromCategoryId` is set when
 * the row comes from an ancestor; editing such a row must happen on the
 * source ancestor or by adding an override on this category.
 */
export interface CategoryAttributeDto {
  attribute: AttributeWithValuesDto;
  sortOrder: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  inheritedFromCategoryId: string | null;
  inheritedFromCategoryName: string | null;
}

export interface CategoryAttributesResponse {
  categoryId: string;
  items: CategoryAttributeDto[];
  /** All definitions available for explicit assignment on this category. */
  availableAttributes: AttributeWithValuesDto[];
}

export interface CategoryAttributeInput {
  attributeId: string;
  sortOrder?: number;
  isRequired?: boolean;
  isFilterable?: boolean;
  isComparable?: boolean;
}

/** One product value. Exactly one payload field is populated by valueType. */
export interface ProductAttributeValueDto {
  id: string;
  attribute: AttributeDto;
  option: AttributeValueDto | null;
  valueText: string | null;
  valueNumber: string | null;
  valueBoolean: boolean | null;
  sortOrder: number;
  source: string;
  /** False when the attribute is no longer applicable to the product category. */
  isApplicable: boolean;
}

export interface ProductAttributesResponse {
  productId: string;
  categoryId: string;
  applicable: CategoryAttributeDto[];
  values: ProductAttributeValueDto[];
  /** Values retained after a category change; never silently deleted. */
  incompatible: ProductAttributeValueDto[];
}

export type ProductAttributeValueInput =
  | { attributeId: string; optionId: string }
  | { attributeId: string; valueText: string }
  | { attributeId: string; valueNumber: string }
  | { attributeId: string; valueBoolean: boolean }
  | { attributeId: string; optionIds: string[]; clear?: false };

export interface SetProductAttributesInput {
  values: ProductAttributeValueInput[];
  /** Explicit opt-in required to delete values that no longer apply. */
  clearIncompatible?: boolean;
}

export type BulkAttributeOperation =
  | {
      kind: 'SET';
      attributeId: string;
      optionId?: string;
      valueText?: string;
      valueNumber?: string;
      valueBoolean?: boolean;
    }
  | { kind: 'CLEAR'; attributeId: string };

export interface BulkAttributeProductRef {
  id: string;
  /** Optimistic concurrency token from the catalog grid row. */
  updatedAt?: string;
}

export interface BulkAttributePreviewInput {
  products: BulkAttributeProductRef[];
  operations: BulkAttributeOperation[];
}

export interface BulkAttributeChange {
  productId: string;
  productName: string;
  attributeName: string;
  before: string | null;
  after: string | null;
  action: 'SET' | 'CLEAR' | 'UNCHANGED';
}

export interface BulkAttributePreviewResponse {
  affectedProducts: number;
  unchangedProducts: number;
  changes: BulkAttributeChange[];
  /** Server-generated token binding this preview to the current baseline. */
  previewToken: string;
  warnings: string[];
}

export interface BulkAttributeApplyInput extends BulkAttributePreviewInput {
  previewToken: string;
}

export interface BulkAttributeProductOutcome {
  productId: string;
  productName: string;
  status: 'APPLIED' | 'SKIPPED' | 'FAILED' | 'CONFLICT';
  message: string | null;
}

export interface BulkAttributeApplyResponse {
  applied: number;
  skipped: number;
  failed: number;
  outcomes: BulkAttributeProductOutcome[];
}

/** Public catalog filter/facet contract (SS-900). */
export interface CatalogAttributeOptionFacet {
  id: string;
  value: string;
  slug: string;
  count: number;
}

export interface CatalogAttributeFacetDto {
  attributeId: string;
  name: string;
  slug: string;
  unit: string | null;
  valueType: AttributeValueType;
  isComparable: boolean;
  options: CatalogAttributeOptionFacet[];
  numericMin: number | null;
  numericMax: number | null;
}

export interface CatalogFacetsResponse {
  categorySlug: string | null;
  attributes: CatalogAttributeFacetDto[];
  /** Brand facets scoped to the selected category's published products. */
  brands: CatalogBrandDto[];
}

/** Compare projection resolved from the real API, never hardcoded. */
export interface CatalogCompareAttributeDto {
  attributeId: string;
  name: string;
  slug: string;
  unit: string | null;
  valueType: AttributeValueType;
  isComparable: boolean;
}

export interface CatalogCompareProductDto {
  id: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string };
  values: Record<string, string | null>;
}

export interface CatalogCompareResponse {
  attributes: CatalogCompareAttributeDto[];
  products: CatalogCompareProductDto[];
  /** Categories represented by the selected products. */
  categories: Array<{ id: string; name: string; slug: string }>;
}
