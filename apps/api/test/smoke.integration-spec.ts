import { readdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function committedMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe('Database integration harness', () => {
  let prisma: PrismaClient;
  let throwawayMobile: string;

  beforeAll(() => {
    prisma = new PrismaClient();
    throwawayMobile = `+989${String(Date.now()).slice(-9)}`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to a migrated PostgreSQL database', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });

  it('has all committed migrations applied', async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
    `;
    const applied = rows.map((row) => row.migration_name).sort();
    expect(applied).toEqual(committedMigrations());
  });

  it('writes and reads a row through the real Prisma client', async () => {
    try {
      const created = await prisma.user.create({
        data: { mobile: throwawayMobile },
      });

      const found = await prisma.user.findUnique({
        where: { id: created.id },
      });

      expect(found?.mobile).toBe(throwawayMobile);
    } finally {
      await prisma.user.deleteMany({ where: { mobile: throwawayMobile } });
    }
  });
});
