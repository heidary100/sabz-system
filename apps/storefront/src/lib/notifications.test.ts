import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPE_FA, notificationTypeLabel } from './notifications';

describe('notificationTypeLabel', () => {
  it('labels every known type in Persian', () => {
    for (const type of Object.keys(NOTIFICATION_TYPE_FA)) {
      const label = notificationTypeLabel(
        type as keyof typeof NOTIFICATION_TYPE_FA,
      );
      expect(label).toBeTruthy();
      expect(label).not.toBe(type);
    }
  });

  it('falls back to the raw code for unknown types (stale dist)', () => {
    expect(
      notificationTypeLabel('FUTURE_TYPE' as never),
    ).toBe('FUTURE_TYPE');
  });
});
