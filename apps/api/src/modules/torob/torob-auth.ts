import { createPublicKey, verify } from 'node:crypto';

/**
 * Torob Product API v3 JWT verification (SS-239, token guide §5).
 *
 * Torob signs every sync request with its Ed25519 private key; shops
 * verify with the published Torob public key (EdDSA). The pure function
 * below is framework-free so it unit-tests without Nest.
 *
 * Validation requirements (guide §5):
 * 1. Signature verifies against the Torob public key (Ed25519).
 * 2. `exp`: reject when now > exp.
 * 3. `nbf`: reject when now < nbf.
 * 4. `aud`: must exactly match the expected audience (our API hostname).
 *
 * No new dependency: Node's built-in `node:crypto` verifies Ed25519
 * (one-shot `verify(null, …)` — EdDSA takes no digest) and the JWT is
 * parsed as plain base64url (only `alg: EdDSA` accepted).
 */
export const TOROB_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAt6Mu4T0pBORY11W+QeM35UsmLO3vsf+6yKpFDEImFk0=
-----END PUBLIC KEY-----`;

export interface TorobTokenResult {
  ok: true;
}

export interface TorobTokenFailure {
  ok: false;
  reason: 'missing' | 'malformed' | 'algorithm' | 'signature' | 'expired' | 'early' | 'audience';
}

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

export function verifyTorobToken(
  token: string | undefined,
  expectedAudience: string,
  publicKeyPem: string = TOROB_PUBLIC_KEY_PEM,
  nowSeconds = Math.floor(Date.now() / 1000),
): TorobTokenResult | TorobTokenFailure {
  if (!token) {
    return { ok: false, reason: 'missing' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed' };
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof header !== 'object' ||
    header === null ||
    (header as { alg?: unknown }).alg !== 'EdDSA'
  ) {
    return { ok: false, reason: 'algorithm' };
  }
  let signature: Buffer;
  try {
    signature = base64UrlDecode(signatureB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  let key: ReturnType<typeof createPublicKey>;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return { ok: false, reason: 'signature' };
  }
  let valid = false;
  try {
    valid = verify(null, Buffer.from(`${headerB64}.${payloadB64}`), key, signature);
  } catch {
    return { ok: false, reason: 'signature' };
  }
  if (!valid) {
    return { ok: false, reason: 'signature' };
  }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'malformed' };
  }
  const claims = payload as { exp?: unknown; nbf?: unknown; aud?: unknown };
  if (typeof claims.exp !== 'number' || nowSeconds > claims.exp) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof claims.nbf !== 'number' || nowSeconds < claims.nbf) {
    return { ok: false, reason: 'early' };
  }
  if (claims.aud !== expectedAudience) {
    return { ok: false, reason: 'audience' };
  }
  return { ok: true };
}
