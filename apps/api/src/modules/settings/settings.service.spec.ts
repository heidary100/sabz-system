import { PrismaService } from '../../common/database/prisma.service';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_FOOTER } from './footer-defaults';
import { SettingsService } from './settings.service';

describe('SettingsService footer defaults (SS-900 Part II)', () => {
  function serviceWith(row: unknown) {
    const prisma = {
      siteSetting: { findUnique: jest.fn().mockResolvedValue(row) },
    } as unknown as PrismaService;
    return new SettingsService(
      prisma,
      {} as AuditService,
      { invalidate: jest.fn() } as unknown as StorefrontCacheService,
    );
  }

  it('returns backend-owned defaults when no footer row exists', async () => {
    const result = await serviceWith(null).getFooter();
    expect(result.value).toEqual(DEFAULT_FOOTER);
    expect(result.version).toBe(0);
    expect(result.updatedAt).toBeNull();
  });

  it('falls back to backend defaults for an invalid stored document', async () => {
    const result = await serviceWith({
      value: [],
      version: 4,
      updatedAt: new Date(),
      updatedBy: 'system',
    }).getFooter();
    expect(result.value).toEqual(DEFAULT_FOOTER);
    expect(result.version).toBe(4);
  });

  it('can save the backend defaults, including external legal links', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const cache = { invalidate: jest.fn() };
    const prisma = {
      siteSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ version: 1, value: DEFAULT_FOOTER })
          .mockResolvedValueOnce({
            value: DEFAULT_FOOTER,
            version: 2,
            updatedAt: new Date(),
            updatedBy: 'user-1',
          }),
        updateMany,
      },
    };
    const service = new SettingsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      cache as unknown as StorefrontCacheService,
    );
    const result = await service.updateFooter(
      { value: DEFAULT_FOOTER, version: 1 },
      'user-1',
    );
    expect(result.version).toBe(2);
    const saved = updateMany.mock.calls[0][0].data.value;
    expect(
      saved.legalLinks.some(
        (link: { href: string }) => link.href.startsWith('https://'),
      ),
    ).toBe(true);
  });
});
