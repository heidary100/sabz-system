import {
  validateCampaignLifecycleEligibility,
  type CampaignLifecycleState,
  type CampaignWindowPolicy,
} from './campaign-eligibility';

const NOW = new Date('2026-11-10T12:00:00.000Z');

function state(overrides: Partial<CampaignLifecycleState> = {}): CampaignLifecycleState {
  return {
    isEnabled: true,
    archivedAt: null,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof validateCampaignLifecycleEligibility>): string[] {
  return result.errors.map((error) => error.code);
}

describe('campaign lifecycle eligibility', () => {
  it('accepts an enabled, active campaign', () => {
    const result = validateCampaignLifecycleEligibility(
      state({
        startsAt: new Date('2026-11-01T00:00:00.000Z'),
        endsAt: new Date('2026-12-01T00:00:00.000Z'),
      }),
      'sections[0].settings.campaign',
      NOW,
      'require-active-window',
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects a disabled campaign', () => {
    const result = validateCampaignLifecycleEligibility(
      state({ isEnabled: false }),
      'sections[0].settings.campaign',
      NOW,
      'require-active-window',
    );
    expect(codes(result)).toEqual(['CAMPAIGN_DISABLED']);
    expect(result.errors[0]!.severity).toBe('ERROR');
  });

  it('rejects an archived campaign without also reporting disabled', () => {
    const result = validateCampaignLifecycleEligibility(
      state({ isEnabled: false, archivedAt: new Date('2026-10-01T00:00:00.000Z') }),
      'sections[0].settings.campaign',
      NOW,
      'require-active-window',
    );
    expect(codes(result)).toEqual(['CAMPAIGN_ARCHIVED']);
  });

  it('rejects a not-yet-started campaign at lifecycle evaluation time', () => {
    const result = validateCampaignLifecycleEligibility(
      state({
        startsAt: new Date('2026-11-20T00:00:00.000Z'),
        endsAt: new Date('2026-12-01T00:00:00.000Z'),
      }),
      'sections[0].settings.campaign',
      NOW,
      'require-active-window',
    );
    expect(codes(result)).toEqual(['CAMPAIGN_NOT_STARTED']);
    expect(result.errors[0]!.severity).toBe('ERROR');
    expect(result.warnings).toEqual([]);
  });

  it('warns about a not-yet-started campaign during draft validation', () => {
    const result = validateCampaignLifecycleEligibility(
      state({
        startsAt: new Date('2026-11-20T00:00:00.000Z'),
        endsAt: new Date('2026-12-01T00:00:00.000Z'),
      }),
      'sections[0].settings.campaign',
      NOW,
      'allow-future-start' satisfies CampaignWindowPolicy,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['CAMPAIGN_NOT_STARTED']);
    expect(result.warnings[0]!.severity).toBe('WARNING');
  });

  it('rejects an expired campaign', () => {
    const result = validateCampaignLifecycleEligibility(
      state({
        startsAt: new Date('2026-10-01T00:00:00.000Z'),
        endsAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
      'sections[0].settings.campaign',
      NOW,
      'require-active-window',
    );
    expect(codes(result)).toEqual(['CAMPAIGN_EXPIRED']);
    expect(result.errors[0]!.path).toBe('sections[0].settings.campaign.endsAt');
  });
});
