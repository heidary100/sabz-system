import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard-domain module (SS-065). Owns the read-only operational dashboard
 * endpoint. The endpoint aggregates several domains, so a dedicated module
 * keeps cross-domain reporting out of the Users/Partners/Audit services. Only
 * AuthModule is imported (for the guard providers); the module is read-only
 * and introduces no circular dependency.
 */
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}