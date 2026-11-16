#!/usr/bin/env node
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  DEFAULT_ASSETS_DIR,
  DEFAULT_BACKUP_DIR,
  DEMO_ASSETS_DIR_ENV,
  DEMO_BACKUP_DIR_ENV,
  DEMO_CONFIRM_ENV,
  DEMO_EXPECTED_FINGERPRINT_ENV,
  DEMO_MEDIA_ACK_IDS_ENV,
  DEMO_OPERATION_ID_ENV,
  DEMO_PUBLIC_API_BASE_URL_ENV,
  DEMO_PUBLISH_CONFIRM_ENV,
} from './constants';
import { readAndVerifyBackup } from './backup';
import {
  assertDevelopmentEnvironment,
  readDatabaseIdentity,
} from './identity';
import { DEMO_SEED_MANIFEST } from './manifest';
import { PrismaDemoSeedPlanLoader } from './plan-loader';
import { PrismaDemoSeedGuardrails } from './guardrails';
import { runReadOnlyTransaction } from './read-only';
import { DemoSeedService } from './demo-seed.service';
import { DemoSeedBlockedError } from './planner';
import { createPrismaDemoSeedWriteGateway } from './write-gateway';
import { assertOperationId } from './operation-id';
import type { DemoSeedOptions } from './types';

type Command = 'identity' | 'dry-run' | 'apply' | 'verify-backup' | 'help';

function parseCommand(argv: string[]): Command {
  const command = argv[2];
  if (
    command === 'identity' ||
    command === 'dry-run' ||
    command === 'apply' ||
    command === 'verify-backup'
  ) {
    return command;
  }
  return 'help';
}

function options(argv: string[]): DemoSeedOptions {
  const configuredOperationId = process.env[DEMO_OPERATION_ID_ENV]?.trim();
  return {
    nodeEnv: process.env.NODE_ENV,
    operationId: configuredOperationId
      ? assertOperationId(configuredOperationId)
      : randomUUID(),
    mediaReconciliationAckIds: (
      process.env[DEMO_MEDIA_ACK_IDS_ENV] ?? ''
    )
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
    confirm: process.env[DEMO_CONFIRM_ENV] === '1',
    publishConfirm: process.env[DEMO_PUBLISH_CONFIRM_ENV] === '1',
    expectedFingerprint:
      process.env[DEMO_EXPECTED_FINGERPRINT_ENV]?.trim() || null,
    publicApiBaseUrl:
      process.env[DEMO_PUBLIC_API_BASE_URL_ENV]?.trim() || null,
    assetsDir: resolve(
      process.env[DEMO_ASSETS_DIR_ENV] ?? DEFAULT_ASSETS_DIR,
    ),
    backupDir: resolve(
      process.env[DEMO_BACKUP_DIR_ENV] ?? DEFAULT_BACKUP_DIR,
    ),
    // `backupDir` is also the verification root. Create and verify use the
    // same configured containment boundary.
    replaceDraft: argv.includes('--replace-draft'),
    publish: argv.includes('--publish'),
    acknowledgePublicationReplacement: argv.includes(
      '--acknowledge-publication-replacement',
    ),
  };
}

async function readIdentity(prisma: PrismaService) {
  return runReadOnlyTransaction(prisma, (tx) => readDatabaseIdentity(tx));
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv);
  if (command === 'help') {
    printHelp();
    return;
  }
  if (command === 'verify-backup') {
    const path = process.argv[3];
    if (!path) {
      throw new Error('Usage: verify-backup <path-to-backup.json>');
    }
    const backupDir = resolve(
      process.env[DEMO_BACKUP_DIR_ENV] ?? DEFAULT_BACKUP_DIR,
    );
    const backup = await readAndVerifyBackup(path, { backupDir });
    console.log(
      JSON.stringify(
        {
          verified: true,
          formatVersion: backup.formatVersion,
          checksum: backup.checksum,
          operationId: backup.payload.operationId,
          createdAt: backup.payload.createdAt,
          sourceRevision: backup.payload.draft.revision,
          schemaVersion: backup.payload.draft.schemaVersion,
          databaseIdentity: backup.payload.identity,
        },
        null,
        2,
      ),
    );
    return;
  }

  assertDevelopmentEnvironment(process.env.NODE_ENV);
  const prisma = new PrismaService();
  try {
    if (command === 'identity') {
      const identity = await readIdentity(prisma);
      console.log(
        JSON.stringify(
          {
            identity,
            warning:
              'PostgreSQL physical clones retain the system identifier. This fingerprint prevents accidents; it is not cryptographic proof of database provenance.',
          },
          null,
          2,
        ),
      );
      return;
    }

    const parsed = options(process.argv);
    const loader = new PrismaDemoSeedPlanLoader(prisma);
    const guardrails = new PrismaDemoSeedGuardrails(prisma);
    const service = new DemoSeedService(
      loader,
      (input) => createPrismaDemoSeedWriteGateway({ prisma, ...input }),
      guardrails,
    );

    if (command === 'dry-run') {
      const { plan } = await service.plan(parsed, DEMO_SEED_MANIFEST);
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    try {
      const result = await service.apply(parsed, DEMO_SEED_MANIFEST);
      console.log(
        JSON.stringify(
          {
            applied: true,
            replayed: result.replayed,
            operationId: result.operationId,
            backup: result.backup,
            draft: result.draft,
            campaigns: result.campaigns,
            media: result.media,
            blog: result.blog,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      if (error instanceof DemoSeedBlockedError) {
        console.error(JSON.stringify({ applied: false, blockers: error.blockers }, null, 2));
        process.exitCode = 2;
        return;
      }
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function printHelp(): void {
  console.log(`Homepage demo seed (SS-284B)

Commands:
  identity                 Read PostgreSQL identity and fingerprint (read-only)
  dry-run                  Build and print a complete read-only plan
  apply                    Apply a fully approved plan after all guards pass
  verify-backup <path>     Verify a draft backup checksum and print metadata

Apply flags:
  --replace-draft                          Required when a draft already exists
  --publish                                Replace the published homepage
  --acknowledge-publication-replacement   Required when a published homepage exists

Environment (never print DATABASE_URL):
  NODE_ENV=development
  HOMEPAGE_DEMO_CONFIRM=1                  Required for apply
  HOMEPAGE_DEMO_EXPECTED_FINGERPRINT=...   Required for apply
  HOMEPAGE_DEMO_PUBLISH_CONFIRM=1          Required with --publish
  HOMEPAGE_DEMO_OPERATION_ID=...           Stable id for retry/recovery
                                           (^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$)
  HOMEPAGE_DEMO_MEDIA_ACK_IDS=...          Exact comma-separated affected media IDs
  HOMEPAGE_DEMO_PUBLIC_API_BASE_URL=...    Browser-facing API origin
  HOMEPAGE_DEMO_BACKUP_DIR=...             Default .data/homepage-demo-backups
  HOMEPAGE_DEMO_ASSETS_DIR=...             Default .data/homepage-demo-assets

Safety:
  - dry-run never writes database state, files, directories or media.
  - apply is blocked while any content approval remains pending.
  - a persistent draft backup is mandatory before replacing a draft.
  - this tool never runs migrations, seedCatalog, the API listener or workers.
`);
}

main().catch((error: unknown) => {
  console.error(
    `Homepage demo seed failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
