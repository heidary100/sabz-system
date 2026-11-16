import type { PrismaClient } from '@prisma/client';
import type {
  DemoSeedAssetState,
  DemoSeedManifest,
  DemoSeedOptions,
  DemoSeedPlanInput,
} from './types';
import { inspectAsset } from './asset';
import { readDatabaseIdentity } from './identity';
import { runReadOnlyTransaction } from './read-only';
import { PrismaDemoSeedReadRepository } from './prisma-repository';
import { expectedMediaOriginalName } from './ownership';

export interface DemoSeedPlanLoader {
  load(
    options: DemoSeedOptions,
    manifest: DemoSeedManifest,
  ): Promise<DemoSeedPlanInput>;
}

/**
 * Builds the complete plan input from one database transaction that is set
 * READ ONLY before the first query. No write-capable service is constructed
 * here, and asset checks use stat() only (no directory creation).
 */
export class PrismaDemoSeedPlanLoader implements DemoSeedPlanLoader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(
    options: DemoSeedOptions,
    manifest: DemoSeedManifest,
  ): Promise<DemoSeedPlanInput> {
    return runReadOnlyTransaction(
      this.prisma,
      async (tx) => {
        const repository = new PrismaDemoSeedReadRepository(tx);
        const identity = await readDatabaseIdentity(tx);
        const baseline = await repository.readBaseline();
        const campaignNames = manifest.campaigns.map(
          (campaign) => campaign.internalName,
        );
        const blogSlugs = manifest.blog.map((article) => article.slug);
        const mediaNames = manifest.media.map((asset) =>
          expectedMediaOriginalName(asset),
        );
        const [
          campaigns,
          blogPosts,
          media,
          publishedMedia,
          ss245Post,
          products,
          categories,
          brandResult,
        ] = await Promise.all([
          repository.readCampaignsByInternalNames(campaignNames),
          repository.readBlogPostsBySlugs(blogSlugs),
          repository.readMediaByOriginalNames(mediaNames),
          repository.readPublishedMedia(),
          repository.readSs245Post(),
          repository.readProducts(8),
          repository.readCategories(6),
          repository.readBrands(4, 6),
        ]);

        const assets: Record<string, DemoSeedAssetState> = {};
        for (const asset of manifest.media) {
          assets[asset.key] = await inspectAsset(
            options.assetsDir,
            asset.fileName,
          );
        }

        return {
          generatedAt: this.now().toISOString(),
          identity,
          manifest,
          options,
          baseline,
          campaigns,
          blogPosts,
          media,
          publishedMedia,
          ss245Post,
          candidates: {
            categories,
            brands: brandResult.brands,
            products,
            productsByBrand: brandResult.productsByBrand,
          },
          assets,
        };
      },
    );
  }
}
