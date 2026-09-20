export type ProductStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type ProductCondition =
  | 'NEW'
  | 'OPEN_BOX'
  | 'REFURBISHED'
  | 'USED'
  | 'STOCK_CLEARANCE';

export type ProductMediaType = 'IMAGE' | 'VIDEO';

/** Variant purchasability state (SS-201). Mirrors the Prisma PriceStatus enum. */
export type PriceStatus = 'PRICED' | 'CALL_FOR_PRICE';

/** Attribute role (SS-202). Mirrors the Prisma AttributeType enum. */
export type AttributeType = 'VARIANT_OPTION' | 'SPEC';
