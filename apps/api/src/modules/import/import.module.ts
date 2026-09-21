import { Module } from '@nestjs/common';
import { WooReferenceLoader } from './woo-reference';
import { WooRunner } from './woo-runner';

/**
 * External catalog import module (SS-206 foundation, SS-207 writer).
 *
 * Hosts the WooCommerce dry-run parser/resolvers, the product writer
 * (per-product transactions, ledger receipts, resume), and — next — the
 * media downloader (SS-208) as providers here. Intentionally not imported
 * by AppModule: bulk imports run as standalone CLI invocations (tsx),
 * never as HTTP endpoints in v1.
 */
@Module({
  providers: [WooReferenceLoader, WooRunner],
  exports: [WooReferenceLoader, WooRunner],
})
export class ImportModule {}
