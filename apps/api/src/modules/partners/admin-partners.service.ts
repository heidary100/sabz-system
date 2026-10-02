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
  PartnerTierSummary,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { RolesService } from '../auth/roles/roles.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import {
  ApprovePartnerDto,
  ChangeTierDto,
  CreatePartnerTierDto,
  ListPartnersQueryDto,
  RejectPartnerDto,
  UpdatePartnerTierDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

type TierWithCount = Prisma.PartnerTierGetPayload<{
  include: { _count: { select: { partners: true } } };
}>;

@Injectable()
export class AdminPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rolesService: RolesService,
    private readonly notifications: NotificationService,
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

  async listTiers(): Promise<PartnerTierSummary[]> {
    const tiers = await this.prisma.partnerTier.findMany({
      orderBy: { minOrderQuantity: 'asc' },
      include: { _count: { select: { partners: true } } },
    });

    return tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      discountPercent: tier.discountPercent.toString(),
      minOrderQuantity: tier.minOrderQuantity,
      partnerCount: tier._count.partners,
    }));
  }

  /**
   * Tier admin CRUD (SS-042 follow-up, #90): the client manages the
   * reference tiers from the admin panel. Unique-name collisions are 409s,
   * deleting a tier still assigned to partners is a 409 (reassign first),
   * and each mutation writes one PARTNER_TIER_* audit entry.
   */
  private assertDiscountRange(discountPercent: string): void {
    const value = Number(discountPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestException('discountPercent باید بین ۰ و ۱۰۰ باشد.');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  async createTier(
    dto: CreatePartnerTierDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<PartnerTierSummary> {
    this.assertDiscountRange(dto.discountPercent);
    let tier: TierWithCount;
    try {
      tier = await this.prisma.partnerTier.create({
        data: {
          name: dto.name,
          discountPercent: dto.discountPercent,
          minOrderQuantity: dto.minOrderQuantity,
          createdBy: actorId,
          updatedBy: actorId,
        },
        include: { _count: { select: { partners: true } } },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('پله همکاری با این نام وجود دارد.');
      }
      throw error;
    }
    await this.auditService.log({
      userId: actorId,
      action: 'PARTNER_TIER_CREATED',
      entity: 'PartnerTier',
      entityId: tier.id,
      after: {
        name: tier.name,
        discountPercent: tier.discountPercent.toString(),
        minOrderQuantity: tier.minOrderQuantity,
      },
      ipAddress,
    });
    return this.toTierSummary(tier);
  }

  async updateTier(
    tierId: string,
    dto: UpdatePartnerTierDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<PartnerTierSummary> {
    if (dto.discountPercent !== undefined) {
      this.assertDiscountRange(dto.discountPercent);
    }
    const existing = await this.prisma.partnerTier.findUnique({
      where: { id: tierId },
    });
    if (!existing) {
      throw new NotFoundException('پله همکاری یافت نشد.');
    }
    let tier: TierWithCount;
    try {
      tier = await this.prisma.partnerTier.update({
        where: { id: tierId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.discountPercent !== undefined
            ? { discountPercent: dto.discountPercent }
            : {}),
          ...(dto.minOrderQuantity !== undefined
            ? { minOrderQuantity: dto.minOrderQuantity }
            : {}),
          updatedBy: actorId,
        },
        include: { _count: { select: { partners: true } } },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('پله همکاری با این نام وجود دارد.');
      }
      throw error;
    }
    await this.auditService.log({
      userId: actorId,
      action: 'PARTNER_TIER_UPDATED',
      entity: 'PartnerTier',
      entityId: tier.id,
      before: {
        name: existing.name,
        discountPercent: existing.discountPercent.toString(),
        minOrderQuantity: existing.minOrderQuantity,
      },
      after: {
        name: tier.name,
        discountPercent: tier.discountPercent.toString(),
        minOrderQuantity: tier.minOrderQuantity,
      },
      ipAddress,
    });
    return this.toTierSummary(tier);
  }

  async deleteTier(
    tierId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<PartnerTierSummary> {
    const tier = await this.prisma.partnerTier.findUnique({
      where: { id: tierId },
      include: { _count: { select: { partners: true } } },
    });
    if (!tier) {
      throw new NotFoundException('پله همکاری یافت نشد.');
    }
    if (tier._count.partners > 0) {
      throw new ConflictException(
        'این پله همکاری به همکارانی تخصیص یافته است؛ ابتدا آن همکاران را به پله دیگری منتقل کنید.',
      );
    }
    await this.prisma.partnerTier.delete({ where: { id: tierId } });
    await this.auditService.log({
      userId: actorId,
      action: 'PARTNER_TIER_DELETED',
      entity: 'PartnerTier',
      entityId: tierId,
      before: {
        name: tier.name,
        discountPercent: tier.discountPercent.toString(),
        minOrderQuantity: tier.minOrderQuantity,
      },
      ipAddress,
    });
    return this.toTierSummary(tier);
  }

  private toTierSummary(tier: TierWithCount): PartnerTierSummary {
    return {
      id: tier.id,
      name: tier.name,
      discountPercent: tier.discountPercent.toString(),
      minOrderQuantity: tier.minOrderQuantity,
      partnerCount: tier._count.partners,
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
    let applicantUserId = '';
    await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
        include: { profile: { select: { userId: true } } },
      });
      if (!partner || partner.deletedAt !== null) {
        throw new NotFoundException('درخواست همکاری یافت نشد.');
      }
      applicantUserId = partner.profile.userId;

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

    // SS-243: applicant approval notice (best-effort, never throws).
    if (applicantUserId !== '') {
      await this.notifications.notify(applicantUserId, {
        type: 'PARTNER_APPROVED',
        title: 'درخواست همکاری تأیید شد',
        body: 'درخواست همکاری شما تأیید شد؛ قیمت‌های همکار فعال است.',
        entity: 'Partner',
        entityId: partnerId,
      });
    }
    return this.getDetail(partnerId);
  }

  async reject(
    partnerId: string,
    dto: RejectPartnerDto,
    reviewerId: string,
    ipAddress?: string,
  ): Promise<AdminPartnerDetail> {
    let applicantUserId = '';
    await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
        select: {
          id: true,
          deletedAt: true,
          approvalStatus: true,
          profile: { select: { userId: true } },
        },
      });
      if (!partner || partner.deletedAt !== null) {
        throw new NotFoundException('درخواست همکاری یافت نشد.');
      }
      // Defensive (see approve): skip the notice when the join is absent.
      applicantUserId = partner.profile?.userId ?? '';

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

    // SS-243: applicant rejection notice (best-effort, never throws).
    if (applicantUserId !== '') {
      await this.notifications.notify(applicantUserId, {
        type: 'PARTNER_REJECTED',
        title: 'درخواست همکاری رد شد',
        body: `درخواست همکاری شما رد شد: ${dto.reason}`,
        entity: 'Partner',
        entityId: partnerId,
      });
    }
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
