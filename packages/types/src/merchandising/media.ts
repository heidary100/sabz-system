import type { PaginatedResult } from '../api/pagination';

/**
 * Admin merchandising media contracts (Task 05.2).
 *
 * The response shapes expose metadata only; storage keys and filesystem paths
 * never enter the contract. Binary content is delivered through authenticated
 * admin endpoints or the publication-gated public endpoint.
 */

export type MerchMediaStatus = 'DRAFT' | 'PUBLISHED';

export interface MerchMediaCampaignUsageDto {
  id: string;
  internalName: string;
  archivedAt: string | null;
}

export interface MerchMediaPublicationUsageDto {
  id: string;
  version: number;
  status: 'PUBLISHED' | 'SCHEDULED';
}

export interface MerchMediaUsageDto {
  campaigns: MerchMediaCampaignUsageDto[];
  currentPublications: MerchMediaPublicationUsageDto[];
  scheduledPublications: MerchMediaPublicationUsageDto[];
}

export interface MerchMediaSummaryDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altFa: string | null;
  /** Derived from the publication eligibility gate; never set by campaign attachment. */
  status: MerchMediaStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerchMediaDetailDto extends MerchMediaSummaryDto {
  deletedAt: string | null;
  usage: MerchMediaUsageDto;
}

export type MerchMediaListResponse = PaginatedResult<MerchMediaSummaryDto>;

/** Only editable metadata fields; server-controlled fields are not accepted. */
export interface UpdateMerchMediaInput {
  altFa?: string | null;
}
