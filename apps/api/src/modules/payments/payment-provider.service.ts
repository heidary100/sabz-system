import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PAYMENT_PROVIDER_FA,
  type InitiatePaymentResult,
  type PaymentProviderCode,
  type PaymentProviderState,
  type PaymentProviderStatusDto,
  type PaymentProvidersResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';

interface ProviderDefinition {
  code: PaymentProviderCode;
  envPrefix: string;
  /** Values that must exist before a live integration can be enabled. */
  requiredKeys: string[];
  supportsSandbox: boolean;
}

const PROVIDERS: ProviderDefinition[] = [
  {
    code: 'SNAPPAY',
    envPrefix: 'SNAPPPAY',
    requiredKeys: ['ENABLED', 'CLIENT_ID', 'CLIENT_SECRET', 'BASE_URL', 'CALLBACK_URL'],
    supportsSandbox: true,
  },
  {
    code: 'DIGIPAY',
    envPrefix: 'DIGIPAY',
    requiredKeys: ['ENABLED', 'CLIENT_ID', 'CLIENT_SECRET', 'BASE_URL', 'CALLBACK_URL'],
    supportsSandbox: true,
  },
];

/**
 * SnappPay / DigiPay readiness (SS-900).
 *
 * No merchant credentials are available in this repository, and the official
 * provider API contracts could not be verified from an authoritative source
 * during implementation. The adapters therefore expose configuration state
 * and fail closed:
 *
 * - no HTTP request is made to an invented endpoint,
 * - no signature scheme is guessed,
 * - no order is ever marked paid,
 * - an unconfigured provider is fully visible to operators/customers.
 *
 * Finishing the integration requires the exact merchant onboarding pack:
 * base URLs, authentication/token flow, request/response schemas, callback
 * signature/verification rules, sandbox credentials, and expected idempotency
 * semantics. Those are documented in docs/07-development/payments-and-sms.md.
 */
@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  status(): PaymentProvidersResponse {
    const providers = PROVIDERS.map((definition) => this.statusFor(definition));
    return {
      providers,
      onlineCheckoutAvailable: providers.some(
        (provider) => provider.enabled && provider.state === 'SANDBOX_READY',
      ),
    };
  }

  providerStatus(code: string): PaymentProviderStatusDto {
    const definition = PROVIDERS.find((row) => row.code === code.toUpperCase());
    if (!definition) {
      throw new UnprocessableEntityException('درگاه پرداخت ناشناخته است.');
    }
    return this.statusFor(definition);
  }

  /**
   * Fails closed until a verified adapter exists. A configuration-complete
   * provider still cannot initiate because the authoritative protocol is not
   * encoded; this prevents a fake success or an unsafe guess.
   */
  async initiate(
    userId: string,
    orderId: string,
    code: string,
  ): Promise<InitiatePaymentResult> {
    const definition = PROVIDERS.find((row) => row.code === code.toUpperCase());
    if (!definition) {
      throw new UnprocessableEntityException('درگاه پرداخت ناشناخته است.');
    }
    const status = this.statusFor(definition);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, total: true, paymentStatus: true },
    });
    if (!order) {
      throw new UnprocessableEntityException('سفارش یافت نشد.');
    }
    if (order.paymentStatus === 'PAID') {
      throw new UnprocessableEntityException('این سفارش قبلاً پرداخت شده است.');
    }
    this.logger.warn(
      `Payment initiation blocked provider=${definition.code} order=${orderId} state=${status.state} missing=${status.missingConfiguration.join(',')}`,
    );
    return {
      provider: definition.code,
      initialized: false,
      state: status.state,
      reasonFa: status.reasonFa,
      attemptId: null,
      redirectUrl: null,
    };
  }

  private statusFor(definition: ProviderDefinition): PaymentProviderStatusDto {
    const missing = definition.requiredKeys.filter((key) => {
      const value = this.config.get<string>(`${definition.envPrefix}_${key}`);
      return !value || value.trim().length === 0;
    });
    const enabled =
      this.config.get<string>(`${definition.envPrefix}_ENABLED`) === 'true';
    const sandbox =
      this.config.get<string>(`${definition.envPrefix}_SANDBOX`) === 'true';
    let state: PaymentProviderState = 'UNCONFIGURED';
    let reasonFa =
      'اطلاعات ورود درگاه هنوز تنظیم نشده است؛ پرداخت آنلاین این درگاه غیرفعال است.';
    if (!enabled) {
      state = 'DISABLED';
      reasonFa = 'این درگاه توسط مدیر فروشگاه غیرفعال شده است.';
    } else if (missing.length > 0) {
      state = 'UNCONFIGURED';
      reasonFa = `اطلاعات ورود درگاه کامل نیست (${missing.join('، ')}).`;
    } else {
      // Credentials alone are not enough: the documented protocol adapter is
      // intentionally not enabled until it can be verified end-to-end.
      state = 'UNCONFIGURED';
      reasonFa =
        'اعتبارنامه‌ها ثبت شده‌اند اما پروتکل رسمی درگاه هنوز در کد تأیید نشده است؛ تا تکمیل آداپتور، پرداخت آنلاین غیرفعال می‌ماند.';
    }
    return {
      code: definition.code,
      titleFa: PAYMENT_PROVIDER_FA[definition.code],
      state,
      enabled: enabled && missing.length === 0 && state !== 'DISABLED',
      reasonFa,
      missingConfiguration: missing,
      supportsSandbox: definition.supportsSandbox,
      sandboxConfigured: sandbox && missing.length === 0,
    };
  }
}
