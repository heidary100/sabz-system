import { PrismaService } from '../src/common/database/prisma.service';
import {
  BRAND_NAME_KEY_FIXTURES,
  normalizeBrandName,
} from '../src/modules/products/brand-normalize';

jest.setTimeout(30_000);

describe('brand_name_key SQL/TypeScript parity (SS-258)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('matches the application normalizer over the shared fixtures', async () => {
    for (const fixture of BRAND_NAME_KEY_FIXTURES) {
      const rows = await prisma.$queryRaw<Array<{ key: string | null }>>`
        SELECT brand_name_key(${fixture}) AS key
      `;
      expect({ fixture, key: rows[0]?.key ?? null }).toEqual({
        fixture,
        key: normalizeBrandName(fixture),
      });
    }
  });
});
