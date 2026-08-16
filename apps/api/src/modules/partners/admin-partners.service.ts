import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Partner, PartnerApprovalStatus, PartnerDocumentType, Prisma } from '@prisma/client';
import type {
  AdminPartnerDetail,
  AdminPartnerListItem,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { RolesService } from '../auth/roles/roles.service';
import { AuditService } from '../audit/audit.service';
import {
  ApprovePartnerDto,
  ChangeTierDto,
  ListPartnersQueryDto,
  RejectPartnerDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class AdminPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rolesService: RolesService,
  ) {}

  async list(query: ListPartnersQueryDto): Promise<PaginatedResult<AdminPartnerListItem>> {
    const status = query.status ?? PartnerApprovalStatus.PENDING;
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.PartnerWhereInput = {
      approvalStatus: status,
      deletedAt: null,
    };

    // A single transaction keeps total and page read from the same connection;
    // under READ COMMITTED a concurrent commit can still land between the two
    // statements, which is acceptable for a review queue.
    const [total, partners] = await this.prisma.$transaction([
      this.prisma.partner.count({ where }),
      this.prisma.partner.findMany({
        where,
        orderBy: [
          { submittedAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: partners.map((partner) => this.toListItem(partner)),
      total,
      page,
      limit,
    };
  }

  async getDetail(partnerId: string): Promise<AdminPartnerDetail> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            user: { select: { mobile: true } },
          },
        },
        tier: true,
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!partner || partner.deletedAt !== null) {
      throw new NotFoundException('درخواست همکاری یافت نشد.');
    }

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
      reviewNotes: partner.reviewNotes,
      tier: partner.tier
        ? {
            id: partner.tier.id,
            name: partner.tier.name,
            discountPercent: partner.tier.discountPercent.toString(),
            minOrderQuantity: partner.tier.minOrderQuantity,
          }
        : null,
      documents: partner.documents.map((document) => ({
        id: document.id,
        type: document.type,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        createdAt: document.createdAt.toISOString(),
      })),
      profile: {
        firstName: partner.profile.firstName,
        lastName: partner.profile.lastName,
        mobile: partner.profile.user.mobile,
      },
      createdAt: partner.createdAt.toISOString(),
      updatedAt: partner.updatedAt.toISOString(),
    };
  }

  /**
   * Approves a PENDING partner application. The Partner transition, PARTNER
   * role activation, and the PARTNER_APPROVED audit entry are written in one
   * interactive transaction: they succeed or fail together. The role belongs
   * to the applicant's user (partner.profile.userId); the reviewer appears
   * only as assignedBy and as the audit actor.
   *
   * Race safety: the conditional updateMany (approvalStatus = PENDING,
   * deletedAt = null) is the state gate. PostgreSQL re-evaluates the WHERE
   * clause after acquiring the row lock, so a concurrent decision leaves the
   * loser with count 0 → 409. No SERIALIZABLE isolation or SELECT FOR UPDATE
   * is required for the state transition.
   */
  async approve(
    partnerId: string,
    dto: ApprovePartnerDto,
    reviewerId: string,
    ipAddress?: string,
  ): Promise<AdminPartnerDetail> {
    await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
        include: { profile: { select: { userId: true } } },
      });
      if (!partner || partner.deletedAt !== null) {
        throw new NotFoundException('درخواست همکاری یافت نشد.');
      }

      const tier = await tx.partnerTier.findUnique({ where: { id: dto.tierId } });
      if (!tier) {
        throw new BadRequestException('تایر معتبر نیست.');
      }

      const licenseCount = await tx.businessDocument.count({
        where: {
          partnerId,
          type: PartnerDocumentType.BUSINESS_LICENSE,
          deletedAt: null,
        },
      });
      if (licenseCount === 0) {
        throw new UnprocessableEntityException(
          'برای تأیید درخواست، سند جواز کسب الزامی است.',
        );
      }

      const approvedAt = new Date();
      const result = await tx.partner.updateMany({
        where: {
          id: partnerId,
          approvalStatus: PartnerApprovalStatus.PENDING,
          deletedAt: null,
        },
        data: {
          approvalStatus: PartnerApprovalStatus.APPROVED,
          approvedAt,
          tierId: dto.tierId,
          ...(dto.reviewNotes !== undefined ? { reviewNotes: dto.reviewNotes } : {}),
          updatedBy: reviewerId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'وضعیت درخواست تغییر کرده است؛ مجدد تلاش کنید.',
        );
      }

      const roleId = await this.rolesService.findRoleIdByName(AppRole.PARTNER, tx);
      if (!roleId) {
        throw new InternalServerErrorException(
          'نقش همکار (PARTNER) در سامانه تعریف نشده است.',
        );
      }

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: partner.profile.userId, roleId } },
        update: {},
        create: {
          userId: partner.profile.userId,
          roleId,
          assignedBy: reviewerId,
        },
      });

      await this.auditService.log(
        {
          userId: reviewerId,
          action: 'PARTNER_APPROVED',
          entity: 'Partner',
          entityId: partner.id,
          before: {
            approvalStatus: PartnerApprovalStatus.PENDING,
            tierId: partner.tierId,
          },
          after: {
            approvalStatus: PartnerApprovalStatus.APPROVED,
            tierId: dto.tierId,
            approvedAt: approvedAt.toISOString(),
          },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(partnerId);
  }

  async reject(
    partnerId: string,
    dto: RejectPartnerDto,
    reviewerId: string,
    ipAddress?: string,
  ): Promise<AdminPartnerDetail> {
    await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, deletedAt: true, approvalStatus: true },
      });
      if (!partner || partner.deletedAt !== null) {
        throw new NotFoundException('درخواست همکاری یافت نشد.');
      }

      const rejectedAt = new Date();
      const result = await tx.partner.updateMany({
        where: {
          id: partnerId,
          approvalStatus: PartnerApprovalStatus.PENDING,
          deletedAt: null,
        },
        data: {
          approvalStatus: PartnerApprovalStatus.REJECTED,
          rejectedAt,
          rejectionReason: dto.reason,
          ...(dto.reviewNotes !== undefined ? { reviewNotes: dto.reviewNotes } : {}),
          updatedBy: reviewerId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'وضعیت درخواست تغییر کرده است؛ مجدد تلاش کنید.',
        );
      }

      await this.auditService.log(
        {
          userId: reviewerId,
          action: 'PARTNER_REJECTED',
          entity: 'Partner',
          entityId: partner.id,
          before: { approvalStatus: PartnerApprovalStatus.PENDING },
          after: {
            approvalStatus: PartnerApprovalStatus.REJECTED,
            rejectedAt: rejectedAt.toISOString(),
            rejectionReason: dto.reason,
          },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(partnerId);
  }

  async changeTier(
    partnerId: string,
    dto: ChangeTierDto,
    reviewerId: string,
    ipAddress?: string,
  ): Promise<AdminPartnerDetail> {
    await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
        select: {
          id: true,
          deletedAt: true,
          approvalStatus: true,
          tierId: true,
        },
      });
      if (!partner || partner.deletedAt !== null) {
        throw new NotFoundException('درخواست همکاری یافت نشد.');
      }

      const tier = await tx.partnerTier.findUnique({ where: { id: dto.tierId } });
      if (!tier) {
        throw new BadRequestException('تایر معتبر نیست.');
      }

      // A no-op change (re-selecting the current tier of an APPROVED partner)
      // is not a tier change; skip the update and the PARTNER_TIER_CHANGED
      // audit so the trail only records real transitions. The APPROVED check
      // keeps the state gate explicit even if a future flow assigns tiers to
      // non-APPROVED partners.
      if (
        partner.approvalStatus === PartnerApprovalStatus.APPROVED &&
        dto.tierId === partner.tierId
      ) {
        return;
      }

      const result = await tx.partner.updateMany({
        where: {
          id: partnerId,
          approvalStatus: PartnerApprovalStatus.APPROVED,
          tierId: partner.tierId,
          deletedAt: null,
        },
        data: { tierId: dto.tierId, updatedBy: reviewerId },
      });
      if (result.count === 0) {
        // The tier was changed concurrently (or the state is not APPROVED).
        // Losing the race here keeps the PARTNER_TIER_CHANGED audit accurate:
        // the winner already committed its before/after, so the loser aborts
        // instead of recording a stale `before` tier.
        throw new ConflictException(
          'وضعیت درخواست تغییر کرده است؛ مجدد تلاش کنید.',
        );
      }

      await this.auditService.log(
        {
          userId: reviewerId,
          action: 'PARTNER_TIER_CHANGED',
          entity: 'Partner',
          entityId: partner.id,
          before: { tierId: partner.tierId },
          after: { tierId: dto.tierId },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(partnerId);
  }

  private toListItem(partner: Partner): AdminPartnerListItem {
    return {
      id: partner.id,
      businessName: partner.businessName,
      approvalStatus: partner.approvalStatus,
      city: partner.city,
      province: partner.province,
      submittedAt: partner.submittedAt?.toISOString() ?? null,
      createdAt: partner.createdAt.toISOString(),
    };
  }
}
