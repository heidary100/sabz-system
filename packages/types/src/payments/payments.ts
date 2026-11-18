/**
 * Provider-neutral online payment readiness (SS-900).
 *
 * SnappPay and DigiPay credentials are not available. These contracts model
 * configuration/status only: no endpoint is called and no order is ever
 * marked paid without a verified provider callback.
 */

export type PaymentProviderCode = 'SNAPPAY' | 'DIGIPAY';

export const PAYMENT_PROVIDER_FA: Record<PaymentProviderCode, string> = {
  SNAPPAY: 'اسنپ‌پی',
  DIGIPAY: 'دیجی‌پی',
};

export type PaymentProviderState =
  | 'DISABLED'
  | 'UNCONFIGURED'
  | 'READY'
  | 'SANDBOX_READY';

export interface PaymentProviderStatusDto {
  code: PaymentProviderCode;
  titleFa: string;
  state: PaymentProviderState;
  enabled: boolean;
  /** Safe, non-secret explanation for operators/customers. */
  reasonFa: string;
  missingConfiguration: string[];
  supportsSandbox: boolean;
  sandboxConfigured: boolean;
}

export interface PaymentProvidersResponse {
  providers: PaymentProviderStatusDto[];
  /** True only when at least one provider can safely start a checkout. */
  onlineCheckoutAvailable: boolean;
}

export interface InitiatePaymentInput {
  orderId: string;
  provider: PaymentProviderCode;
}

export interface InitiatePaymentResult {
  provider: PaymentProviderCode;
  /** False when credentials/configuration are absent; never a fake success. */
  initialized: boolean;
  state: PaymentProviderState;
  reasonFa: string;
  attemptId: string | null;
  redirectUrl: string | null;
}

export interface PaymentAttemptDto {
  id: string;
  provider: string;
  status:
    | 'INITIATED'
    | 'REDIRECTED'
    | 'VERIFIED'
    | 'FAILED'
    | 'CANCELLED';
  amount: string;
  providerOrderId: string | null;
  providerReferenceId: string | null;
  createdAt: string;
  verifiedAt: string | null;
  failedReason: string | null;
}
