import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import {
  AdminSettingsController,
  PublicSettingsController,
} from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminSettingsController, PublicSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
