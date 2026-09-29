import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Product reviews (SS-236). Filing is self-scoped customer state behind
 * `JwtAuthGuard`; moderation is OPERATOR/ADMIN behind `RolesGuard`
 * (minimal handling — the full admin UI arrives with SS-240). Audit
 * events flow through `AuditService`. No reverse dependencies, hence no
 * module cycle.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminReviewsController, ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
