import type { HomepageValidationIssue } from '@sabz/types';

/**
 * How a campaign's configured start/end window is treated at the point of
 * evaluation.
 *
 * - `allow-future-start`: draft validation warns when a campaign has not started
 *   yet, because the draft may be published later. This preserves the editor's
 *   existing forward-looking behavior.
 * - `require-active-window`: lifecycle decisions (scheduled activation and
 *   rollback) only permit a campaign whose window is currently active.
 */
export type CampaignWindowPolicy = 'allow-future-start' | 'require-active-window';

export interface CampaignLifecycleState {
  isEnabled: boolean;
  archivedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface CampaignLifecycleValidation {
  errors: HomepageValidationIssue[];
  warnings: HomepageValidationIssue[];
}

function issue(
  path: string,
  code: string,
  message: string,
  severity: HomepageValidationIssue['severity'],
  category: HomepageValidationIssue['category'],
): HomepageValidationIssue {
  return { path, code, message, severity, category };
}

/**
 * Shared lifecycle eligibility rules for campaign references.
 *
 * Draft validation uses `allow-future-start` so operators can prepare content
 * before a campaign window opens. Scheduled activation and rollback use
 * `require-active-window`, so a snapshot can only become current while its
 * source campaign is enabled, not archived, and inside its configured window.
 */
export function validateCampaignLifecycleEligibility(
  state: CampaignLifecycleState,
  path: string,
  now: Date,
  policy: CampaignWindowPolicy,
): CampaignLifecycleValidation {
  const errors: HomepageValidationIssue[] = [];
  const warnings: HomepageValidationIssue[] = [];

  if (state.archivedAt !== null) {
    errors.push(
      issue(
        path,
        'CAMPAIGN_ARCHIVED',
        'کمپین آرشیوشده برای انتشار صفحه اصلی قابل استفاده نیست.',
        'ERROR',
        'INELIGIBLE_REFERENCE',
      ),
    );
  } else if (!state.isEnabled) {
    errors.push(
      issue(
        path,
        'CAMPAIGN_DISABLED',
        'کمپین غیرفعال برای انتشار صفحه اصلی قابل استفاده نیست.',
        'ERROR',
        'INELIGIBLE_REFERENCE',
      ),
    );
  }

  if (state.endsAt !== null && state.endsAt.getTime() < now.getTime()) {
    errors.push(
      issue(
        `${path}.endsAt`,
        'CAMPAIGN_EXPIRED',
        'بازه زمانی کمپین پایان یافته است.',
        'ERROR',
        'INELIGIBLE_REFERENCE',
      ),
    );
  } else if (state.startsAt !== null && state.startsAt.getTime() > now.getTime()) {
    if (policy === 'require-active-window') {
      errors.push(
        issue(
          `${path}.startsAt`,
          'CAMPAIGN_NOT_STARTED',
          'بازه زمانی کمپین هنوز شروع نشده است.',
          'ERROR',
          'INELIGIBLE_REFERENCE',
        ),
      );
    } else {
      warnings.push(
        issue(
          `${path}.startsAt`,
          'CAMPAIGN_NOT_STARTED',
          'بازه زمانی کمپین هنوز شروع نشده است؛ محتوای آن در زمان انتشار نمایش داده می‌شود.',
          'WARNING',
          'WARNING',
        ),
      );
    }
  }

  return { errors, warnings };
}
