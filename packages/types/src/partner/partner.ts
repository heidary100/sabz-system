export type PartnerStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type PartnerDocumentType =
  | 'BUSINESS_LICENSE'
  | 'NATIONAL_ID'
  | 'TAX_REGISTRATION'
  | 'SUPPORTING';

export interface PartnerTierSummary {
  id: string;
  name: string;
  discountPercent: string;
  minOrderQuantity: number;
}

export interface PartnerDocumentSummary {
  id: string;
  type: PartnerDocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PartnerApplicationSummary {
  id: string;
  businessName: string;
  businessLicenseNo: string | null;
  nationalId: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  approvalStatus: PartnerStatus;
  submittedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  tier: PartnerTierSummary | null;
  documents: PartnerDocumentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartnerApplicationInput {
  businessName: string;
  businessLicenseNo?: string;
  nationalId?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  submit?: boolean;
}

export interface UpdatePartnerApplicationInput {
  businessName?: string;
  businessLicenseNo?: string;
  nationalId?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  submit?: boolean;
}
