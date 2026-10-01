import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_ORDER,
} from './notification-labels'

describe('notification-labels (SS-243)', () => {
  it('covers every notification type with a Persian label', () => {
    expect(NOTIFICATION_TYPE_ORDER).toHaveLength(11)
    for (const type of NOTIFICATION_TYPE_ORDER) {
      expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy()
    }
  })
})
