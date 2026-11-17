import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BlogModule } from '../blog/blog.module';
import { ProductsModule } from '../products/products.module';
import { CampaignController } from './campaigns/campaign.controller';
import { CampaignService } from './campaigns/campaign.service';
import { HomepageDraftController } from './homepage/homepage-draft.controller';
import { HomepageDraftService } from './homepage/homepage-draft.service';
import { HomepageActivationService } from './homepage/homepage-activation.service';
import { HomepageActivationWorker } from './homepage/homepage-activation.worker';
import { HomepagePublicationController } from './homepage/homepage-publication.controller';
import { HomepagePublicationService } from './homepage/homepage-publication.service';
import { HomepageSourceService } from './homepage/homepage-source.service';
import { PublicHomepageCache } from './homepage/public-homepage.cache';
import { PublicHomepageController } from './homepage/public-homepage.controller';
import { PublicHomepageResolver } from './homepage/public-homepage.resolver';
import { PublicHomepageService } from './homepage/public-homepage.service';
import { MerchMediaController } from './media/merch-media.controller';
import { MerchMediaService } from './media/merch-media.service';
import { PublicMerchMediaController } from './media/public-merch-media.controller';

/**
 * Merchandising domain foundation + media library + campaigns + homepage draft,
 * publication, public resolver, and scheduled activation (Tasks 05.1–05.6).
 *
 * Storage/processing are intentionally reused from ProductsModule; public
 * catalog and blog rules come from their owning services.
 */
@Module({
  imports: [AuthModule, AuditModule, BlogModule, ProductsModule],
  controllers: [
    CampaignController,
    HomepageDraftController,
    HomepagePublicationController,
    MerchMediaController,
    PublicHomepageController,
    PublicMerchMediaController,
  ],
  providers: [
    CampaignService,
    HomepageActivationService,
    HomepageActivationWorker,
    HomepageDraftService,
    HomepagePublicationService,
    HomepageSourceService,
    MerchMediaService,
    PublicHomepageCache,
    PublicHomepageResolver,
    PublicHomepageService,
  ],
})
export class MerchandisingModule {}
