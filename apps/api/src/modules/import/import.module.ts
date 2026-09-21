import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { WooReferenceLoader } from './woo-reference';
import { WooRunner } from './woo-runner';
import { createWooMediaRunner, WooMediaRunner } from './woo-media-runner';

/**
 * External catalog import module (SS-206 foundation, SS-207 writer, SS-208
 * media downloader).
 *
 * Hosts the WooCommerce dry-run parser/resolvers, the product writer
 * (per-product transactions, ledger receipts, resume), and the media
 * downloader (bounded concurrency, retry/backoff, per-URL dead-lettering).
 * Intentionally not imported by AppModule: bulk imports run as standalone
 * CLI invocations (tsx), never as HTTP endpoints in v1.
 */
@Module({
  providers: [
    WooReferenceLoader,
    WooRunner,
    {
      provide: WooMediaRunner,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => createWooMediaRunner(prisma),
    },
  ],
  exports: [WooReferenceLoader, WooRunner, WooMediaRunner],
})
export class ImportModule {}
