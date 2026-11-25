import { isAllowedPushEndpoint } from './push.service';

describe('push endpoint allowlist', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-abc.notify.windows.com/w/?token=abc',
  ])('accepts a known browser push endpoint: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://internal.example.com/push',
    'https://fcm.googleapis.com.evil.example/push',
    'not-a-url',
  ])('rejects an unsafe or unknown endpoint: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
