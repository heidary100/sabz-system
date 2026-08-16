import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Partner, PartnerApprovalStatus, PartnerDocumentType, Prisma } from '@prisma/client';
import type {
  PartnerApplicationSummary,
  PartnerDocumentSummary,
  PartnerTierSummary,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateApplicationDto, UpdateApplicationDto } from './dto';

const EDITABLE_STATUSES: PartnerApprovalStatus[] = [
  PartnerApprovalStatus.DRAFT,
  PartnerApprovalStatus.REJECTED,
];

interface SubmissionFields {
  businessName: string;
  businessLicenseNo: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createApplication(
    userId: string,
    dto: CreateApplicationDto,
    ipAddress?: string,
  ): Promise<PartnerApplicationSummary> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile || !this.isProfileComplete(profile)) {
      throw new BadRequestException(
        'برای ثبت درخواست همکاری ابتدا پروفایل خود را تکمیل کنید.',
      );
    }

    // One Partner row per profile, ever: profileId is unconditionally unique,
    // so a pre-existing row (including a soft-deleted one) blocks re-application
    // — consistent with how unique constraints stay active for soft-deleted
    // identity records. There is no partner soft-delete flow yet; SS-040 may
    // revisit this if it introduces re-application after deletion.
    const existing = await this.prisma.partner.findFirst({
      where: { profileId: profile.id },
    });
    if (existing) {
      throw new ConflictException('درخواست همکاری قبلاً ثبت شده است.');
    }

    const data = this.buildCreateData(dto);

    try {
      const partner = await this.prisma.$transaction(async (tx) => {
        const created = await tx.partner.create({
          data: {
            profileId: profile.id,
            ...data,
            createdBy: userId,
          } as Prisma.PartnerUncheckedCreateInput,
        });

        await this.auditService.log(
          {
            userId,
            action: 'PARTNER_APPLICATION_CREATED',
            entity: 'Partner',
            entityId: created.id,
            after: { approvalStatus: created.approvalStatus },
            ipAddress,
          },
          tx,
        );

        if (dto.submit === true) {
          // A just-created application has no documents, so the required
          // business license cannot exist yet; submission is only possible
          // after the license is uploaded (PATCH /application with submit:true).
          // Throwing here rolls back the created Partner row.
          this.assertSubmissionFields(created, false);
        }

        return created;
      });

      return this.toSummary(partner);
    } catch (error) {
      // Two concurrent create requests can race despite the explicit existence
      // check; the profileId unique constraint is the source of truth.
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('درخواست همکاری قبلاً ثبت شده است.');
      }
      throw error;
    }
  }

  async getApplication(userId: string): Promise<PartnerApplicationSummary> {
    const partner = await this.resolveOwnedPartner(userId);
    return this.toSummary(partner);
  }

  async updateApplication(
    userId: string,
    dto: UpdateApplicationDto,
    ipAddress?: string,
  ): Promise<PartnerApplicationSummary> {
    const partner = await this.resolveOwnedPartner(userId);
    const editable = this.isEditable(partner);

    const editData = this.buildUpdateData(dto);
    const wantsEdit = Object.keys(editData).length > 0;
    const wantsSubmit = dto.submit === true;

    if (!wantsEdit && !wantsSubmit) {
      return this.toSummary(partner);
    }

    if (!editable) {
      throw new ConflictException(
        'درخواست در وضعیت قفل است و قابل ویرایش نیست.',
      );
    }

    const updatedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      if (wantsEdit) {
        const updated = await tx.partner.updateMany({
          where: {
            id: partner.id,
            approvalStatus: { in: EDITABLE_STATUSES },
            deletedAt: null,
          },
          data: { ...editData, updatedBy: userId },
        });

        if (updated.count === 0) {
          throw new ConflictException(
            'درخواست در وضعیت قفل است و قابل ویرایش نیست.',
          );
        }

        await this.auditService.log(
          {
            userId,
            action: 'PARTNER_APPLICATION_UPDATED',
            entity: 'Partner',
            entityId: partner.id,
            before: this.applicationAuditState(partner),
            after: this.applicationAuditState({ ...partner, ...editData }),
            ipAddress,
          },
          tx,
        );
      }

      if (wantsSubmit) {
        // Verify the license inside the transaction: this narrows the window
        // in which a concurrent document removal could leave a PENDING
        // application without a license. Under PostgreSQL READ COMMITTED each
        // statement sees a fresh snapshot, so a removal committed between the
        // count and the status update can still slip through; closing that
        // fully requires SERIALIZABLE isolation or a DB-level check, deferred
        // deliberately.
        const licenseCount = await tx.businessDocument.count({
          where: {
            partnerId: partner.id,
            type: PartnerDocumentType.BUSINESS_LICENSE,
            deletedAt: null,
          },
        });
        this.assertSubmissionFields({ ...partner, ...editData }, licenseCount > 0);

        const submitted = await tx.partner.updateMany({
          where: {
            id: partner.id,
            approvalStatus: { in: EDITABLE_STATUSES },
            deletedAt: null,
          },
          data: {
            approvalStatus: PartnerApprovalStatus.PENDING,
            submittedAt: updatedAt,
            rejectedAt: null,
            rejectionReason: null,
            updatedBy: userId,
          },
        });

        if (submitted.count === 0) {
          throw new ConflictException(
            'درخواست در وضعیت قفل است و قابل ارسال مجدد نیست.',
          );
        }

        await this.auditService.log(
          {
            userId,
            action: 'PARTNER_APPLICATION_SUBMITTED',
            entity: 'Partner',
            entityId: partner.id,
            before: { approvalStatus: partner.approvalStatus },
            after: { approvalStatus: PartnerApprovalStatus.PENDING },
            ipAddress,
          },
          tx,
        );
      }

      return {
        ...partner,
        ...editData,
        ...(wantsSubmit
          ? {
              approvalStatus: PartnerApprovalStatus.PENDING,
              submittedAt: updatedAt,
              rejectedAt: null,
              rejectionReason: null,
            }
          : {}),
        updatedAt,
      };
    });

    return this.toSummary(result);
  }

  private async resolveOwnedPartner(userId: string): Promise<Partner> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('درخواست همکاری یافت نشد.');
    }

    const partner = await this.prisma.partner.findUnique({
      where: { profileId: profile.id },
    });
    if (!partner || partner.deletedAt !== null) {
      throw new NotFoundException('درخواست همکاری یافت نشد.');
    }

    return partner;
  }

  private isEditable(partner: Partner): boolean {
    return (
      partner.approvalStatus === PartnerApprovalStatus.DRAFT ||
      partner.approvalStatus === PartnerApprovalStatus.REJECTED
    );
  }

  /** Duck-typed on purpose: Prisma errors can fail `instanceof` inside the Jest sandbox. */
  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    return (error as { code?: string }).code === 'P2002';
  }

  private isProfileComplete(profile: {
    firstName: string;
    lastName: string;
  }): boolean {
    return profile.firstName.trim().length > 0 && profile.lastName.trim().length > 0;
  }

  /**
   * Validates the business fields required before an application can move to
   * PENDING, plus the mandatory BUSINESS_LICENSE document. Throws 422 on any
   * missing requirement.
   */
  private assertSubmissionFields(
    partner: SubmissionFields,
    hasBusinessLicense: boolean,
  ): void {
    const missing: string[] = [];

    if (!partner.businessName?.trim()) missing.push('businessName');
    if (!partner.businessLicenseNo?.trim()) missing.push('businessLicenseNo');
    if (!partner.address?.trim()) missing.push('address');
    if (!partner.city?.trim()) missing.push('city');
    if (!partner.province?.trim()) missing.push('province');

    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `برای ارسال درخواست، فیلدهای ${missing.join('، ')} الزامی است.`,
      );
    }

    if (!hasBusinessLicense) {
      throw new UnprocessableEntityException(
        'برای ارسال درخواست، بارگذاری سند جواز کسب الزامی است.',
      );
    }
  }

  private buildCreateData(
    dto: CreateApplicationDto,
  ): Record<string, string> {
    return this.pickBusinessFields(dto);
  }

  private buildUpdateData(
    dto: UpdateApplicationDto,
  ): Record<string, string> {
    return this.pickBusinessFields(dto);
  }

  /** Extracts only the editable business fields; never status/lifecycle fields. */
  private pickBusinessFields(
    dto: CreateApplicationDto | UpdateApplicationDto,
  ): Record<string, string> {
    const data: Record<string, string> = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.businessLicenseNo !== undefined) {
      data.businessLicenseNo = dto.businessLicenseNo;
    }
    if (dto.nationalId !== undefined) data.nationalId = dto.nationalId;
    if (dto.website !== undefined) data.website = dto.website;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.province !== undefined) data.province = dto.province;
    return data;
  }

  /**
   * Audit payload for application changes. Excludes nationalId and
   * businessLicenseNo per the sensitive-data policy; those fields are still
   * returned to the applicant in the API response.
   */
  private applicationAuditState(partner: {
    businessName: string;
    website: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    approvalStatus: PartnerApprovalStatus;
  }): Record<string, string | null> {
    return {
      businessName: partner.businessName,
      website: partner.website,
      address: partner.address,
      city: partner.city,
      province: partner.province,
      approvalStatus: partner.approvalStatus,
    };
  }

  private async toSummary(partner: Partner): Promise<PartnerApplicationSummary> {
    const [documents, tier] = await Promise.all([
      this.prisma.businessDocument.findMany({
        where: { partnerId: partner.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      partner.tierId
        ? this.prisma.partnerTier.findUnique({ where: { id: partner.tierId } })
        : Promise.resolve(null),
    ]);

    const documentSummaries: PartnerDocumentSummary[] = documents.map((document) => ({
      id: document.id,
      type: document.type,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt.toISOString(),
    }));

    const tierSummary: PartnerTierSummary | null = tier
      ? {
          id: tier.id,
          name: tier.name,
          discountPercent: tier.discountPercent.toString(),
          minOrderQuantity: tier.minOrderQuantity,
        }
      : null;

    return {
      id: partner.id,
      businessName: partner.businessName,
      businessLicenseNo: partner.businessLicenseNo,
      nationalId: partner.nationalId,
      website: partner.website,
      address: partner.address,
      city: partner.city,
      province: partner.province,
      approvalStatus: partner.approvalStatus,
      submittedAt: partner.submittedAt?.toISOString() ?? null,
      rejectedAt: partner.rejectedAt?.toISOString() ?? null,
      rejectionReason: partner.rejectionReason,
      approvedAt: partner.approvedAt?.toISOString() ?? null,
      tier: tierSummary,
      documents: documentSummaries,
      createdAt: partner.createdAt.toISOString(),
      updatedAt: partner.updatedAt.toISOString(),
    };
  }
}
