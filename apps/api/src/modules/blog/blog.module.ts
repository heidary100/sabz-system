import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminBlogController } from './admin-blog.controller';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

/**
 * Blog CMS (SS-238). Public reads are guard-free (PUBLISHED-only in the
 * service); operator writes are OPERATOR/ADMIN behind `RolesGuard`
 * (minimal handling — the full admin UI arrives with SS-240). Audit
 * events flow through `AuditService`; mutations invalidate the blog
 * storefront-cache tags. No reverse dependencies, hence no module cycle.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminBlogController, BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
