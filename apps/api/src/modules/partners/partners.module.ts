import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsService } from './documents.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './storage/document-storage';
import { LocalDiskStorage } from './storage/local-disk.storage';

/**
 * Partner-domain module. Owns the document storage abstraction and the
 * applicant-facing partner application/document API (SS-039). Storage is
 * intentionally not a global infrastructure module: it belongs to the Partner
 * domain. Admin/operator endpoints land in SS-040+.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PartnersController],
  providers: [
    PartnersService,
    DocumentsService,
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DocumentStorage => {
        const driver = configService.get<string>('DOCUMENT_STORAGE_DRIVER', 'local');
        if (driver !== 'local') {
          throw new Error(
            `Unsupported DOCUMENT_STORAGE_DRIVER: ${driver}. Only 'local' is implemented.`,
          );
        }
        const dir = configService.get<string>('DOCUMENT_STORAGE_DIR', '.data/documents');
        return new LocalDiskStorage(dir);
      },
    },
  ],
  exports: [DOCUMENT_STORAGE, PartnersService, DocumentsService],
})
export class PartnersModule {}
