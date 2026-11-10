import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MerchCampaignDto,
  MerchCampaignListResponse,
  MerchCampaignScheduleStatus,
  MerchCampaignStatus,
  MerchCampaignSummaryDto,
  MerchCampaignType,
  MerchCampaignUsageDto,
  MerchCtaTarget,
  MerchMediaSlot,
} from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { validateCampaignWindow } from '../campaign-validation';
import {
  throwCampaignInputError,
  validateCampaignInput,
} from './campaign-input';
import { lockCampaignEdit, lockCampaignLifecycle } from './campaign-lifecycle';
import { lockMediaLifecycle } from '../media/media-lifecycle';
import { ListMerchCampaignsQueryDto } from './dto/list-merch-campaigns-query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const CAMPAIGN_ENTITY = 'MerchCampaign';

const detailInclude = {
  products: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      sortOrder: true,
      product: { select: { id: true, name: true, slug: true } },
    },
  },
  categories: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      sortOrder: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  },
  brands: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      sortOrder: true,
      brand: { select: { id: true, name: true, slug: true } },
    },
  },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      mediaId: true,
      slot: true,
      altFa: true,
      focalX: true,
      focalY: true,
      sortOrder: true,
      media: {
        select: {
          originalName: true,
          mimeType: true,
          publishedAt: true,
        },
      },
    },
  },
} satisfies Prisma.MerchCampaignInclude;

type CampaignRow = Prisma.MerchCampaignGetPayload<Record<string, never>>;
type CampaignDetailRow = Prisma.MerchCampaignGetPayload<{
  include: typeof detailInclude;
}>;

interface CampaignMediaInput {
  mediaId: string;
  slot: MerchMediaSlot;
  altFa?: string | null;
  focalX?: number;
  focalY?: number;
}

interface CampaignAuditState {
  internalName: string;
  type: string;
  titleFa: string;
  eyebrowFa: string | null;
  subtitleFa: string | null;
  descriptionFa: string | null;
  ctaLabelFa: string | null;
  isEnabled: boolean;
  archivedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  cta: MerchCtaTarget;
}

interface CampaignSnapshotRecord {
  sourceCampaignId?: unknown;
  type?: unknown;
  titleFa?: unknown;
  eyebrowFa?: unknown;
  subtitleFa?: unknown;
  descriptionFa?: unknown;
  ctaLabelFa?: unknown;
  cta?: unknown;
  productIds?: unknown;
  categoryIds?: unknown;
  brandIds?: unknown;
  media?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
}

/**
 * Campaign management service (Task 05.3).
 *
 * Campaigns are draft/source entities only. Nothing in this service mutates
 * HomepagePublication snapshots or sets MerchMedia.publishedAt. All routes are
 * admin-only and all multi-row association writes are transactional.
 */
@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListMerchCampaignsQueryDto): Promise<MerchCampaignListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.MerchCampaignWhereInput = {
      ...(query.q
        ? {
            OR: [
              { internalName: { contains: query.q, mode: 'insensitive' } },
              { titleFa: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isEnabled !== undefined ? { isEnabled: query.isEnabled } : {}),
      ...(query.isArchived === true
        ? { archivedAt: { not: null } }
        : query.isArchived === false
          ? { archivedAt: null }
          : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.merchCampaign.count({ where }),
      this.prisma.merchCampaign.findMany({
        where,
        // Deterministic cursor-free pagination: recently updated first, id as
        // the tie-breaker so equal timestamps never reorder between pages.
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const now = new Date();
    return {
      items: rows.map((row) => this.toSummary(row, now)),
      total,
      page,
      limit,
    };
  }

  async getDetail(id: string): Promise<MerchCampaignDto> {
    const row = await this.findDetailRow(id);
    const usage = await this.getUsage(this.prisma, row.id);
    return this.toDetail(row, usage, await this.hasSourceChanged(row, usage));
  }

  async create(
    actorId: string,
    body: unknown,
    ipAddress?: string,
  ): Promise<MerchCampaignDto> {
    const validation = validateCampaignInput(body, 'create');
    if (!validation.valid) throwCampaignInputError(validation);
    const input = body as Record<string, unknown>;
    const cta = (input.cta as MerchCtaTarget | undefined) ?? { kind: 'NONE' };
    const startsAt = toDate(input.startsAt as string | null | undefined);
    const endsAt = toDate(input.endsAt as string | null | undefined);
    this.assertWindow(startsAt, endsAt);
    this.assertCtaLabel(cta, input.ctaLabelFa as string | null | undefined);

    const productIds = (input.productIds as string[] | undefined) ?? [];
    const categoryIds = (input.categoryIds as string[] | undefined) ?? [];
    const brandIds = (input.brandIds as string[] | undefined) ?? [];
    const media = (input.media as CampaignMediaInput[] | undefined) ?? [];

    const created = await this.prisma.$transaction(async (tx) => {
      // A new campaign cannot be referenced by an existing snapshot yet, so it
      // does not need the campaign lifecycle lock. Media assignments do need the
      // media lifecycle lock: otherwise a concurrent soft-delete can pass its
      // reference check before this transaction inserts MerchCampaignMedia.
      // Acquiring only the media lock is a valid suffix of the documented
      // campaign-lifecycle -> media-lifecycle order.
      if (media.length > 0) {
        await lockMediaLifecycle(tx);
      }
      await this.assertCtaUsable(tx, cta);
      await this.assertSelectionsUsable(tx, {
        productIds,
        categoryIds,
        brandIds,
        media,
      });

      const row = await tx.merchCampaign.create({
        data: {
          internalName: (input.internalName as string).trim(),
          type: input.type as MerchCampaignType,
          titleFa: (input.titleFa as string).trim(),
          eyebrowFa: textOrNull(input.eyebrowFa),
          subtitleFa: textOrNull(input.subtitleFa),
          descriptionFa: textOrNull(input.descriptionFa),
          ctaLabelFa: textOrNull(input.ctaLabelFa),
          ...ctaToScalars(cta),
          isEnabled: (input.isEnabled as boolean | undefined) ?? true,
          startsAt,
          endsAt,
          priority: (input.priority as number | undefined) ?? 0,
          createdBy: actorId,
        },
      });
      await this.replaceProducts(tx, row.id, productIds);
      await this.replaceCategories(tx, row.id, categoryIds);
      await this.replaceBrands(tx, row.id, brandIds);
      await this.replaceMedia(tx, row.id, media);
      await this.audit.log(
        {
          userId: actorId,
          action: 'MERCH_CAMPAIGN_CREATED',
          entity: CAMPAIGN_ENTITY,
          entityId: row.id,
          before: null,
          after: auditShape(auditState(row), productIds, categoryIds, brandIds, media),
          ipAddress,
        },
        tx,
      );
      return row;
    });

    return this.getDetail(created.id);
  }

  async update(
    id: string,
    actorId: string,
    body: unknown,
    ipAddress?: string,
  ): Promise<MerchCampaignDto> {
    const validation = validateCampaignInput(body, 'update');
    if (!validation.valid) throwCampaignInputError(validation);
    const input = body as Record<string, unknown>;

    await this.prisma.$transaction(async (tx) => {
      // Snapshot source edits must not race a homepage publication build.
      // Global order: campaign lifecycle -> campaign edit -> media lifecycle.
      await lockCampaignLifecycle(tx);
      await lockCampaignEdit(tx, id);
      if ('media' in input) {
        await lockMediaLifecycle(tx);
      }
      const existing = await this.findDetailRow(id, tx);
      if (existing.archivedAt !== null) {
        throw new ConflictException('کمپین آرشیوشده قابل ویرایش نیست.');
      }

      const nextStartsAt =
        'startsAt' in input ? toDate(input.startsAt as string | null) : existing.startsAt;
      const nextEndsAt =
        'endsAt' in input ? toDate(input.endsAt as string | null) : existing.endsAt;
      this.assertWindow(nextStartsAt, nextEndsAt);

      const cta = 'cta' in input ? (input.cta as MerchCtaTarget) : ctaFromRow(existing);
      if ('cta' in input) {
        await this.assertCtaUsable(tx, cta);
      }
      if ('cta' in input || 'ctaLabelFa' in input) {
        const label = 'ctaLabelFa' in input
          ? (input.ctaLabelFa as string | null)
          : existing.ctaLabelFa;
        this.assertCtaLabel(cta, label);
      }

      const beforeProducts = existing.products.map((row) => row.product.id);
      const beforeCategories = existing.categories.map((row) => row.category.id);
      const beforeBrands = existing.brands.map((row) => row.brand.id);
      const beforeMedia: CampaignMediaInput[] = existing.media.map((row) => ({
        mediaId: row.mediaId,
        slot: row.slot,
        altFa: row.altFa,
        focalX: row.focalX,
        focalY: row.focalY,
      }));

      const nextProductIds =
        'productIds' in input ? (input.productIds as string[]) : beforeProducts;
      const nextCategoryIds =
        'categoryIds' in input ? (input.categoryIds as string[]) : beforeCategories;
      const nextBrandIds =
        'brandIds' in input ? (input.brandIds as string[]) : beforeBrands;
      const nextMedia =
        'media' in input ? (input.media as CampaignMediaInput[]) : beforeMedia;

      // Only validate selections that this request actually changes. Existing
      // selections may have left the public catalog since assignment; editing
      // unrelated presentation fields must not fail implicitly.
      if ('productIds' in input || 'categoryIds' in input || 'brandIds' in input || 'media' in input) {
        await this.assertSelectionsUsable(tx, {
          productIds: 'productIds' in input ? nextProductIds : [],
          categoryIds: 'categoryIds' in input ? nextCategoryIds : [],
          brandIds: 'brandIds' in input ? nextBrandIds : [],
          media: 'media' in input ? nextMedia : [],
        });
      }

      await tx.merchCampaign.update({
        where: { id },
        data: {
          ...(input.internalName !== undefined
            ? { internalName: (input.internalName as string).trim() }
            : {}),
          ...(input.type !== undefined ? { type: input.type as MerchCampaignType } : {}),
          ...(input.titleFa !== undefined
            ? { titleFa: (input.titleFa as string).trim() }
            : {}),
          ...(input.eyebrowFa !== undefined
            ? { eyebrowFa: textOrNull(input.eyebrowFa) }
            : {}),
          ...(input.subtitleFa !== undefined
            ? { subtitleFa: textOrNull(input.subtitleFa) }
            : {}),
          ...(input.descriptionFa !== undefined
            ? { descriptionFa: textOrNull(input.descriptionFa) }
            : {}),
          ...(input.ctaLabelFa !== undefined
            ? { ctaLabelFa: textOrNull(input.ctaLabelFa) }
            : {}),
          ...('cta' in input ? ctaToScalars(cta) : {}),
          ...(input.isEnabled !== undefined
            ? { isEnabled: input.isEnabled as boolean }
            : {}),
          ...('startsAt' in input ? { startsAt: nextStartsAt } : {}),
          ...('endsAt' in input ? { endsAt: nextEndsAt } : {}),
          ...(input.priority !== undefined ? { priority: input.priority as number } : {}),
          updatedBy: actorId,
        },
      });
      if ('productIds' in input) {
        await this.replaceProducts(tx, id, nextProductIds);
      }
      if ('categoryIds' in input) {
        await this.replaceCategories(tx, id, nextCategoryIds);
      }
      if ('brandIds' in input) {
        await this.replaceBrands(tx, id, nextBrandIds);
      }
      if ('media' in input) {
        await this.replaceMedia(tx, id, nextMedia);
      }

      const beforeState = auditState(existing);
      const afterState: CampaignAuditState = {
        ...beforeState,
        ...(input.internalName !== undefined
          ? { internalName: (input.internalName as string).trim() }
          : {}),
        ...(input.type !== undefined ? { type: input.type as string } : {}),
        ...(input.titleFa !== undefined
          ? { titleFa: (input.titleFa as string).trim() }
          : {}),
        ...(input.eyebrowFa !== undefined
          ? { eyebrowFa: textOrNull(input.eyebrowFa) }
          : {}),
        ...(input.subtitleFa !== undefined
          ? { subtitleFa: textOrNull(input.subtitleFa) }
          : {}),
        ...(input.descriptionFa !== undefined
          ? { descriptionFa: textOrNull(input.descriptionFa) }
          : {}),
        ...(input.ctaLabelFa !== undefined
          ? { ctaLabelFa: textOrNull(input.ctaLabelFa) }
          : {}),
        ...('cta' in input ? { cta } : {}),
        ...(input.isEnabled !== undefined
          ? { isEnabled: input.isEnabled as boolean }
          : {}),
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        ...(input.priority !== undefined
          ? { priority: input.priority as number }
          : {}),
      };

      await this.audit.log(
        {
          userId: actorId,
          action: 'MERCH_CAMPAIGN_UPDATED',
          entity: CAMPAIGN_ENTITY,
          entityId: id,
          before: auditShape(
            beforeState,
            beforeProducts,
            beforeCategories,
            beforeBrands,
            beforeMedia,
          ),
          after: auditShape(
            afterState,
            nextProductIds,
            nextCategoryIds,
            nextBrandIds,
            nextMedia,
          ),
          ipAddress,
        },
        tx,
      );

      if ('productIds' in input || 'categoryIds' in input || 'brandIds' in input) {
        await this.audit.log(
          {
            userId: actorId,
            action: 'MERCH_CAMPAIGN_SELECTIONS_UPDATED',
            entity: CAMPAIGN_ENTITY,
            entityId: id,
            before: {
              productIds: beforeProducts,
              categoryIds: beforeCategories,
              brandIds: beforeBrands,
            },
            after: {
              productIds: nextProductIds,
              categoryIds: nextCategoryIds,
              brandIds: nextBrandIds,
            },
            ipAddress,
          },
          tx,
        );
      }
      if ('media' in input) {
        await this.audit.log(
          {
            userId: actorId,
            action: 'MERCH_CAMPAIGN_MEDIA_UPDATED',
            entity: CAMPAIGN_ENTITY,
            entityId: id,
            before: { media: auditMedia(beforeMedia) },
            after: { media: auditMedia(nextMedia) },
            ipAddress,
          },
          tx,
        );
      }
    });

    return this.getDetail(id);
  }

  async setEnabled(
    id: string,
    enabled: boolean,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchCampaignDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockCampaignLifecycle(tx);
      await lockCampaignEdit(tx, id);
      const row = await this.findDetailRow(id, tx);
      if (row.archivedAt !== null) {
        throw new ConflictException('کمپین آرشیوشده قابل فعال‌سازی یا غیرفعال‌سازی نیست.');
      }
      await tx.merchCampaign.update({
        where: { id },
        data: { isEnabled: enabled, updatedBy: actorId },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: enabled ? 'MERCH_CAMPAIGN_ENABLED' : 'MERCH_CAMPAIGN_DISABLED',
          entity: CAMPAIGN_ENTITY,
          entityId: id,
          before: { isEnabled: row.isEnabled },
          after: { isEnabled: enabled },
          ipAddress,
        },
        tx,
      );
    });
    return this.getDetail(id);
  }

  async archive(
    id: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchCampaignDto> {
    await this.prisma.$transaction(async (tx) => {
      // Serialize with future publication snapshot creation. Archive never
      // rewrites an existing snapshot; it only refuses while one references it.
      await lockCampaignLifecycle(tx);
      await lockCampaignEdit(tx, id);
      const row = await this.findDetailRow(id, tx);
      if (row.archivedAt !== null) {
        return;
      }
      const usage = await this.getUsage(tx, id);
      if (
        usage.currentPublications.length > 0 ||
        usage.scheduledPublications.length > 0
      ) {
        throw new ConflictException({
          error: 'MERCH_CAMPAIGN_IN_USE',
          message:
            'این کمپین در صفحه اصلی منتشرشده یا زمان‌بندی‌شده استفاده می‌شود؛ ابتدا آن را از صفحه اصلی حذف و تغییرات را منتشر کنید.',
          usage,
        });
      }

      const archivedAt = new Date();
      await tx.merchCampaign.update({
        where: { id },
        data: { archivedAt, updatedBy: actorId },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'MERCH_CAMPAIGN_ARCHIVED',
          entity: CAMPAIGN_ENTITY,
          entityId: id,
          before: { archivedAt: null },
          after: { archivedAt: archivedAt.toISOString() },
          ipAddress,
        },
        tx,
      );
    });
    return this.getDetail(id);
  }

  private async findDetailRow(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<CampaignDetailRow> {
    const row = await client.merchCampaign.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!row) {
      throw new NotFoundException('کمپین یافت نشد.');
    }
    return row;
  }

  private async getUsage(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<MerchCampaignUsageDto> {
    const publications = await client.homepagePublication.findMany({
      where: { status: { in: ['PUBLISHED', 'SCHEDULED'] } },
      select: {
        id: true,
        version: true,
        status: true,
        publishAt: true,
        publishedAt: true,
        sections: true,
      },
      orderBy: [{ version: 'desc' }],
    });
    const usage: MerchCampaignUsageDto = {
      currentPublications: [],
      scheduledPublications: [],
    };
    for (const publication of publications) {
      if (!snapshotReferencesCampaign(publication.sections, id)) {
        continue;
      }
      const entry = {
        id: publication.id,
        version: publication.version,
        status: publication.status as 'PUBLISHED' | 'SCHEDULED',
        publishAt: publication.publishAt?.toISOString() ?? null,
        publishedAt: publication.publishedAt?.toISOString() ?? null,
      };
      if (publication.status === 'PUBLISHED') {
        usage.currentPublications.push(entry);
      } else {
        usage.scheduledPublications.push(entry);
      }
    }
    return usage;
  }

  private async hasSourceChanged(
    row: CampaignDetailRow,
    usage: MerchCampaignUsageDto,
  ): Promise<boolean | null> {
    if (
      usage.currentPublications.length === 0 &&
      usage.scheduledPublications.length === 0
    ) {
      return null;
    }
    const publications = await this.prisma.homepagePublication.findMany({
      where: {
        id: {
          in: [
            ...usage.currentPublications.map((entry) => entry.id),
            ...usage.scheduledPublications.map((entry) => entry.id),
          ],
        },
      },
      select: { sections: true },
    });
    const current = campaignComparable(row);
    const snapshots = publications.flatMap((publication) =>
      findCampaignSnapshots(publication.sections, row.id),
    );
    if (snapshots.length === 0) {
      return null;
    }
    return !snapshots.some(
      (snapshot) => campaignComparableFromSnapshot(snapshot) === current,
    );
  }

  private toSummary(row: CampaignRow, now: Date): MerchCampaignSummaryDto {
    const scheduleStatus = deriveScheduleStatus(row.startsAt, row.endsAt, now);
    return {
      id: row.id,
      internalName: row.internalName,
      type: row.type,
      titleFa: row.titleFa,
      status: deriveCampaignStatus(row, scheduleStatus),
      scheduleStatus,
      isEnabled: row.isEnabled,
      isArchived: row.archivedAt !== null,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      priority: row.priority,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(
    row: CampaignDetailRow,
    usage: MerchCampaignUsageDto,
    hasUnpublishedChanges: boolean | null,
  ): MerchCampaignDto {
    return {
      ...this.toSummary(row, new Date()),
      eyebrowFa: row.eyebrowFa,
      subtitleFa: row.subtitleFa,
      descriptionFa: row.descriptionFa,
      ctaLabelFa: row.ctaLabelFa,
      cta: ctaFromRow(row),
      products: row.products.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        sortOrder: item.sortOrder,
      })),
      categories: row.categories.map((item) => ({
        id: item.category.id,
        name: item.category.name,
        slug: item.category.slug,
        sortOrder: item.sortOrder,
      })),
      brands: row.brands.map((item) => ({
        id: item.brand.id,
        name: item.brand.name,
        slug: item.brand.slug,
        sortOrder: item.sortOrder,
      })),
      media: row.media.map((item) => ({
        id: item.id,
        mediaId: item.mediaId,
        originalName: item.media.originalName,
        mimeType: item.media.mimeType,
        slot: item.slot,
        altFa: item.altFa,
        focalX: item.focalX,
        focalY: item.focalY,
        sortOrder: item.sortOrder,
        publishedAt: item.media.publishedAt?.toISOString() ?? null,
      })),
      usage,
      hasUnpublishedChanges,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async replaceProducts(
    tx: Prisma.TransactionClient,
    campaignId: string,
    productIds: string[],
  ): Promise<void> {
    await tx.merchCampaignProduct.deleteMany({ where: { campaignId } });
    if (productIds.length > 0) {
      await tx.merchCampaignProduct.createMany({
        data: productIds.map((productId, sortOrder) => ({
          campaignId,
          productId,
          sortOrder,
        })),
      });
    }
  }

  private async replaceCategories(
    tx: Prisma.TransactionClient,
    campaignId: string,
    categoryIds: string[],
  ): Promise<void> {
    await tx.merchCampaignCategory.deleteMany({ where: { campaignId } });
    if (categoryIds.length > 0) {
      await tx.merchCampaignCategory.createMany({
        data: categoryIds.map((categoryId, sortOrder) => ({
          campaignId,
          categoryId,
          sortOrder,
        })),
      });
    }
  }

  private async replaceBrands(
    tx: Prisma.TransactionClient,
    campaignId: string,
    brandIds: string[],
  ): Promise<void> {
    await tx.merchCampaignBrand.deleteMany({ where: { campaignId } });
    if (brandIds.length > 0) {
      await tx.merchCampaignBrand.createMany({
        data: brandIds.map((brandId, sortOrder) => ({
          campaignId,
          brandId,
          sortOrder,
        })),
      });
    }
  }

  private async replaceMedia(
    tx: Prisma.TransactionClient,
    campaignId: string,
    media: CampaignMediaInput[],
  ): Promise<void> {
    await tx.merchCampaignMedia.deleteMany({ where: { campaignId } });
    if (media.length > 0) {
      await tx.merchCampaignMedia.createMany({
        data: media.map((item, sortOrder) => ({
          campaignId,
          mediaId: item.mediaId,
          slot: item.slot,
          altFa: item.altFa ?? null,
          focalX: item.focalX ?? 50,
          focalY: item.focalY ?? 50,
          sortOrder,
        })),
      });
    }
  }

  private async assertSelectionsUsable(
    tx: Prisma.TransactionClient,
    input: {
      productIds: string[];
      categoryIds: string[];
      brandIds: string[];
      media: CampaignMediaInput[];
    },
  ): Promise<void> {
    const [products, categories, brands, media] = await Promise.all([
      input.productIds.length
        ? tx.product.findMany({
            where: {
              id: { in: input.productIds },
              deletedAt: null,
              status: 'PUBLISHED',
            },
            select: { id: true },
          })
        : [],
      input.categoryIds.length
        ? tx.category.findMany({
            where: { id: { in: input.categoryIds }, deletedAt: null, isVisible: true },
            select: { id: true },
          })
        : [],
      input.brandIds.length
        ? tx.brand.findMany({
            where: { id: { in: input.brandIds }, deletedAt: null },
            select: { id: true },
          })
        : [],
      input.media.length
        ? tx.merchMedia.findMany({
            where: {
              id: { in: [...new Set(input.media.map((item) => item.mediaId))] },
              deletedAt: null,
            },
            select: { id: true },
          })
        : [],
    ]);

    const missingProducts = input.productIds.filter(
      (id) => !products.some((row) => row.id === id),
    );
    const missingCategories = input.categoryIds.filter(
      (id) => !categories.some((row) => row.id === id),
    );
    const missingBrands = input.brandIds.filter(
      (id) => !brands.some((row) => row.id === id),
    );
    const missingMedia = [
      ...new Set(
        input.media
          .map((item) => item.mediaId)
          .filter((id) => !media.some((row) => row.id === id)),
      ),
    ];
    const issues: string[] = [];
    if (missingProducts.length) {
      issues.push(`محصول(های) انتخاب‌شده در دسترس نیستند: ${missingProducts.join(', ')}`);
    }
    if (missingCategories.length) {
      issues.push(`دسته‌بندی(های) انتخاب‌شده در دسترس نیستند: ${missingCategories.join(', ')}`);
    }
    if (missingBrands.length) {
      issues.push(`برند(های) انتخاب‌شده در دسترس نیستند: ${missingBrands.join(', ')}`);
    }
    if (missingMedia.length) {
      issues.push(`رسانه(های) انتخاب‌شده در دسترس نیستند: ${missingMedia.join(', ')}`);
    }
    if (issues.length > 0) {
      throw new BadRequestException({
        error: 'MERCH_CAMPAIGN_SELECTION_INVALID',
        message: issues,
      });
    }
  }

  private async assertCtaUsable(
    tx: Prisma.TransactionClient,
    cta: MerchCtaTarget,
  ): Promise<void> {
    if (cta.kind === 'NONE' || cta.kind === 'ALL_PRODUCTS' || cta.kind === 'NEW_ARRIVALS') {
      return;
    }
    if (cta.kind === 'PRODUCT') {
      const row = await tx.product.findFirst({
        where: { id: cta.productId, deletedAt: null, status: 'PUBLISHED' },
        select: { id: true },
      });
      if (!row) {
        throw new BadRequestException({
          error: 'MERCH_CAMPAIGN_CTA_TARGET_INVALID',
          message: 'محصول مقصد فراخوانی در دسترس نیست.',
        });
      }
      return;
    }
    if (cta.kind === 'CATEGORY') {
      const row = await tx.category.findFirst({
        where: { id: cta.categoryId, deletedAt: null, isVisible: true },
        select: { id: true },
      });
      if (!row) {
        throw new BadRequestException({
          error: 'MERCH_CAMPAIGN_CTA_TARGET_INVALID',
          message: 'دسته‌بندی مقصد فراخوانی در دسترس نیست.',
        });
      }
      return;
    }
    const row = await tx.brand.findFirst({
      where: { id: cta.brandId, deletedAt: null },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException({
        error: 'MERCH_CAMPAIGN_CTA_TARGET_INVALID',
        message: 'برند مقصد فراخوانی در دسترس نیست.',
      });
    }
  }

  private assertCtaLabel(cta: MerchCtaTarget, label: string | null | undefined): void {
    if (cta.kind !== 'NONE' && (label === null || label === undefined || label.trim() === '')) {
      throw new BadRequestException({
        error: 'MERCH_CAMPAIGN_CTA_LABEL_REQUIRED',
        message: 'برای مقصد فراخوانی، متن دکمه الزامی است.',
      });
    }
  }

  private assertWindow(startsAt: Date | null, endsAt: Date | null): void {
    const result = validateCampaignWindow(
      startsAt?.toISOString() ?? null,
      endsAt?.toISOString() ?? null,
    );
    if (!result.valid) throwCampaignInputError(result);
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function toDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return new Date(value);
}

function ctaToScalars(cta: MerchCtaTarget): {
  ctaKind: Prisma.MerchCampaignUncheckedCreateInput['ctaKind'];
  ctaProductId: string | null;
  ctaCategoryId: string | null;
  ctaBrandId: string | null;
} {
  switch (cta.kind) {
    case 'PRODUCT':
      return { ctaKind: 'PRODUCT', ctaProductId: cta.productId, ctaCategoryId: null, ctaBrandId: null };
    case 'CATEGORY':
      return { ctaKind: 'CATEGORY', ctaProductId: null, ctaCategoryId: cta.categoryId, ctaBrandId: null };
    case 'BRAND':
      return { ctaKind: 'BRAND', ctaProductId: null, ctaCategoryId: null, ctaBrandId: cta.brandId };
    case 'ALL_PRODUCTS':
      return { ctaKind: 'ALL_PRODUCTS', ctaProductId: null, ctaCategoryId: null, ctaBrandId: null };
    case 'NEW_ARRIVALS':
      return { ctaKind: 'NEW_ARRIVALS', ctaProductId: null, ctaCategoryId: null, ctaBrandId: null };
    case 'NONE':
    default:
      return { ctaKind: 'NONE', ctaProductId: null, ctaCategoryId: null, ctaBrandId: null };
  }
}

function ctaFromRow(row: CampaignRow): MerchCtaTarget {
  switch (row.ctaKind) {
    case 'PRODUCT':
      return row.ctaProductId ? { kind: 'PRODUCT', productId: row.ctaProductId } : { kind: 'NONE' };
    case 'CATEGORY':
      return row.ctaCategoryId ? { kind: 'CATEGORY', categoryId: row.ctaCategoryId } : { kind: 'NONE' };
    case 'BRAND':
      return row.ctaBrandId ? { kind: 'BRAND', brandId: row.ctaBrandId } : { kind: 'NONE' };
    case 'ALL_PRODUCTS':
      return { kind: 'ALL_PRODUCTS' };
    case 'NEW_ARRIVALS':
      return { kind: 'NEW_ARRIVALS' };
    default:
      return { kind: 'NONE' };
  }
}

function deriveScheduleStatus(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
): MerchCampaignScheduleStatus {
  if (startsAt === null && endsAt === null) return 'UNSCHEDULED';
  if (startsAt !== null && now < startsAt) return 'SCHEDULED';
  if (endsAt !== null && now > endsAt) return 'EXPIRED';
  return 'ACTIVE';
}

function deriveCampaignStatus(
  row: CampaignRow,
  scheduleStatus: MerchCampaignScheduleStatus,
): MerchCampaignStatus {
  if (row.archivedAt !== null) return 'ARCHIVED';
  if (!row.isEnabled) return 'DISABLED';
  if (scheduleStatus === 'SCHEDULED') return 'SCHEDULED';
  if (scheduleStatus === 'EXPIRED') return 'EXPIRED';
  if (scheduleStatus === 'ACTIVE') return 'ACTIVE_WINDOW';
  return 'DRAFT';
}

function auditState(row: CampaignRow): CampaignAuditState {
  return {
    internalName: row.internalName,
    type: row.type,
    titleFa: row.titleFa,
    eyebrowFa: row.eyebrowFa,
    subtitleFa: row.subtitleFa,
    descriptionFa: row.descriptionFa,
    ctaLabelFa: row.ctaLabelFa,
    isEnabled: row.isEnabled,
    archivedAt: row.archivedAt,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    priority: row.priority,
    cta: ctaFromRow(row),
  };
}

function auditShape(
  state: CampaignAuditState,
  productIds: string[],
  categoryIds: string[],
  brandIds: string[],
  media: CampaignMediaInput[],
): Prisma.InputJsonObject {
  return {
    internalName: state.internalName,
    type: state.type,
    titleFa: state.titleFa,
    eyebrowFa: state.eyebrowFa,
    subtitleFa: state.subtitleFa,
    descriptionFa: state.descriptionFa,
    ctaLabelFa: state.ctaLabelFa,
    isEnabled: state.isEnabled,
    archivedAt: state.archivedAt?.toISOString() ?? null,
    startsAt: state.startsAt?.toISOString() ?? null,
    endsAt: state.endsAt?.toISOString() ?? null,
    priority: state.priority,
    cta: state.cta,
    productIds,
    categoryIds,
    brandIds,
    media: auditMedia(media),
  };
}

function auditMedia(media: CampaignMediaInput[]): Prisma.InputJsonArray {
  return media.map((item) => ({
    mediaId: item.mediaId,
    slot: item.slot,
    focalX: item.focalX ?? 50,
    focalY: item.focalY ?? 50,
    altFa: item.altFa ?? null,
  }));
}

function snapshotReferencesCampaign(value: unknown, campaignId: string): boolean {
  return findCampaignSnapshots(value, campaignId).length > 0;
}

function findCampaignSnapshots(
  value: unknown,
  campaignId: string,
): CampaignSnapshotRecord[] {
  const matches: CampaignSnapshotRecord[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (typeof current !== 'object' || current === null) continue;
    const record = current as Record<string, unknown>;
    if (record.sourceCampaignId === campaignId) {
      matches.push(record as CampaignSnapshotRecord);
    }
    for (const item of Object.values(record)) stack.push(item);
  }
  return matches;
}

function campaignComparable(row: CampaignDetailRow): string {
  return campaignComparableValue({
    type: row.type,
    titleFa: row.titleFa,
    eyebrowFa: row.eyebrowFa,
    subtitleFa: row.subtitleFa,
    descriptionFa: row.descriptionFa,
    ctaLabelFa: row.ctaLabelFa,
    cta: ctaFromRow(row),
    productIds: row.products.map((item) => item.product.id),
    categoryIds: row.categories.map((item) => item.category.id),
    brandIds: row.brands.map((item) => item.brand.id),
    media: row.media.map((item) => ({
      mediaId: item.mediaId,
      slot: item.slot,
      altFa: item.altFa,
      focalX: item.focalX,
      focalY: item.focalY,
      sortOrder: item.sortOrder,
    })),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  });
}

function campaignComparableFromSnapshot(snapshot: CampaignSnapshotRecord): string {
  return campaignComparableValue({
    type: snapshot.type,
    titleFa: snapshot.titleFa,
    eyebrowFa: snapshot.eyebrowFa ?? null,
    subtitleFa: snapshot.subtitleFa ?? null,
    descriptionFa: snapshot.descriptionFa ?? null,
    ctaLabelFa: snapshot.ctaLabelFa ?? null,
    cta: snapshot.cta,
    productIds: snapshot.productIds,
    categoryIds: snapshot.categoryIds,
    brandIds: snapshot.brandIds,
    media: snapshot.media,
    startsAt: snapshot.startsAt,
    endsAt: snapshot.endsAt,
  });
}

function campaignComparableValue(input: {
  type: unknown;
  titleFa: unknown;
  eyebrowFa: unknown;
  subtitleFa: unknown;
  descriptionFa: unknown;
  ctaLabelFa: unknown;
  cta: unknown;
  productIds: unknown;
  categoryIds: unknown;
  brandIds: unknown;
  media: unknown;
  startsAt: unknown;
  endsAt: unknown;
}): string {
  return JSON.stringify({
    type: input.type,
    titleFa: input.titleFa,
    eyebrowFa: input.eyebrowFa,
    subtitleFa: input.subtitleFa,
    descriptionFa: input.descriptionFa,
    ctaLabelFa: input.ctaLabelFa,
    cta: canonicalCta(input.cta),
    productIds: canonicalStringArray(input.productIds),
    categoryIds: canonicalStringArray(input.categoryIds),
    brandIds: canonicalStringArray(input.brandIds),
    media: canonicalMedia(input.media),
    startsAt: canonicalDate(input.startsAt),
    endsAt: canonicalDate(input.endsAt),
  });
}

function canonicalStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function canonicalDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function canonicalCta(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === 'PRODUCT') return { kind, productId: record.productId ?? null };
  if (kind === 'CATEGORY') return { kind, categoryId: record.categoryId ?? null };
  if (kind === 'BRAND') return { kind, brandId: record.brandId ?? null };
  return { kind };
}

function canonicalMedia(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      mediaId: typeof item.mediaId === 'string' ? item.mediaId : '',
      slot: typeof item.slot === 'string' ? item.slot : '',
      altFa: item.altFa === null || typeof item.altFa === 'string' ? item.altFa : null,
      focalX: typeof item.focalX === 'number' ? item.focalX : 50,
      focalY: typeof item.focalY === 'number' ? item.focalY : 50,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
    }));
}
