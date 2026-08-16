import { PartnerDocumentSummary, PartnerStatus, PartnerTierSummary } from './partner';

export interface AdminPartnerListItem {
  id: string;
  businessName: string;
  approvalStatus: PartnerStatus;
  city: string | null;
  province: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface AdminPartnerDetail {
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
  reviewNotes: string | null;
  tier: PartnerTierSummary | null;
  documents: PartnerDocumentSummary[];
  profile: {
    firstName: string;
    lastName: string;
    mobile: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PartnerListQuery {
  status?: PartnerStatus;
  page?: number;
  limit?: number;
}

export interface ApprovePartnerInput {
  tierId: string;
  reviewNotes?: string;
}

export interface RejectPartnerInput {
  reason: string;
  reviewNotes?: string;
}

export interface ChangePartnerTierInput {
  tierId: string;
}
