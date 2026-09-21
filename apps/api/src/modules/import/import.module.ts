import { Module } from '@nestjs/common';
import { WooReferenceLoader } from './woo-reference';

/**
 * External catalog import module (SS-206 foundation).
 *
 * Hosts the WooCommerce dry-run parser/resolvers in this issue; the product
 * writer (SS-207) and media downloader (SS-208) join as providers here.
 * Intentionally not imported by AppModule: bulk imports run as standalone
 * CLI invocations (tsx), never as HTTP endpoints in v1.
 */
@Module({
  providers: [WooReferenceLoader],
  exports: [WooReferenceLoader],
})
export class ImportModule {}
