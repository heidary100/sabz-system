/**
 * Customer address-book contract (SS-233).
 *
 * Many rows per user; exactly one may carry `isDefault` (the service
 * demotes siblings transactionally). Orders snapshot the chosen columns at
 * creation (ORDER-003) and never read back, so later edits cannot rewrite
 * history. All identifiers are UUID strings; postal codes are the Iranian
 * 10-digit format.
 */
export interface AddressDto {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  province: string | null;
  city: string | null;
  address: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface AddressListResponse {
  items: AddressDto[];
}

export interface CreateAddressInput {
  label?: string;
  fullName: string;
  phone: string;
  province?: string;
  city?: string;
  address: string;
  postalCode?: string;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  label?: string | null;
  fullName?: string;
  phone?: string;
  province?: string | null;
  city?: string | null;
  address?: string;
  postalCode?: string | null;
  isDefault?: boolean;
}

export interface RemoveAddressResponse {
  removed: boolean;
}
