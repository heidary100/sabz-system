import type { AttributeType } from './type';

/**
 * Attribute/spec shared shapes (SS-202, ADR-005).
 *
 * Definitions are reference data managed through AttributesService
 * (service-only in v1; the importer is the primary writer). Assignments are
 * derived rows: hard-deleted on unassign or with their product/variant.
 */

export interface AttributeDto {
  id: string;
  name: string;
  slug: string;
  type: AttributeType;
  group: string | null;
  isFilterable: boolean;
  isGlobal: boolean;
}

export interface AttributeValueDto {
  id: string;
  attributeId: string;
  value: string;
  slug: string;
}

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
