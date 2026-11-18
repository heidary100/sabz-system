import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/database/prisma.service';
import { PaymentProviderService } from './payment-provider.service';

function serviceWith(values: Record<string, string>): PaymentProviderService {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new PaymentProviderService(config, {} as PrismaService);
}

describe('PaymentProviderService readiness', () => {
  it('uses the SNAPPAY provider-code prefix', () => {
    const service = serviceWith({
      SNAPPAY_ENABLED: 'true',
      SNAPPAY_CLIENT_ID: 'id',
      SNAPPAY_CLIENT_SECRET: 'secret',
      SNAPPAY_BASE_URL: 'https://snappay.example',
      SNAPPAY_CALLBACK_URL: 'https://shop.example/callback',
    });
    const status = service.providerStatus('SNAPPAY');
    expect(status.missingConfiguration).toEqual([]);
    expect(status.enabled).toBe(true);
    // Credentials alone never claim checkout readiness before the protocol
    // adapter exists.
    expect(status.state).toBe('UNCONFIGURED');
    expect(service.status().onlineCheckoutAvailable).toBe(false);
  });

  it('reports missing credentials without leaking values', () => {
    const service = serviceWith({});
    const status = service.providerStatus('DIGIPAY');
    expect(status.state).toBe('DISABLED');
    expect(status.missingConfiguration).toEqual(
      expect.arrayContaining(['CLIENT_ID', 'CLIENT_SECRET']),
    );
    expect(JSON.stringify(status)).not.toContain('secret');
  });
});
