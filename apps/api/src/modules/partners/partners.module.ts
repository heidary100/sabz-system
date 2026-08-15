import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOCUMENT_STORAGE, DocumentStorage } from './storage/document-storage';
import { LocalDiskStorage } from './storage/local-disk.storage';

/**
 * Partner-domain module. Owns the document storage abstraction; HTTP and
 * business logic land in SS-039+. Storage is intentionally not a global
 * infrastructure module: it belongs to the Partner domain.
 */
@Module({
  providers: [
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
  exports: [DOCUMENT_STORAGE],
})
export class PartnersModule {}
