import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyTorobToken } from './torob-auth';

/**
 * SS-239: tokens are signed with a freshly generated Ed25519 keypair per
 * test run — the verifier only ever sees the matching public PEM, exactly
 * like production (Torob's private key never leaves Torob).
 */
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const AUDIENCE = 'sabzsistem.com';

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(
  payload: Record<string, unknown>,
  overrides: { header?: Record<string, unknown>; signature?: string } = {},
): string {
  const header = overrides.header ?? { alg: 'EdDSA', typ: 'JWT' };
  const head = b64url(header);
  const body = b64url(payload);
  const signature =
    overrides.signature ??
    sign(null, Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
  return `${head}.${body}.${signature}`;
}

function validPayload(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { exp: now + 60, nbf: now - 60, aud: AUDIENCE };
}

describe('verifyTorobToken (SS-239)', () => {
  it('accepts a well-formed, signed, in-window token for the expected audience', () => {
    const token = signToken(validPayload());
    expect(verifyTorobToken(token, AUDIENCE, PUBLIC_PEM)).toEqual({ ok: true });
  });

  it('rejects a missing token', () => {
    expect(verifyTorobToken(undefined, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(verifyTorobToken('', AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects malformed tokens (wrong segment count, undecodable JSON)', () => {
    expect(verifyTorobToken('not-a-jwt', AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    const [head, body, signature] = signToken(validPayload()).split('.');
    expect(
      verifyTorobToken(`${head}.${body}`, AUDIENCE, PUBLIC_PEM),
    ).toEqual({ ok: false, reason: 'malformed' });
    const badBody = Buffer.from('not json').toString('base64url');
    expect(
      verifyTorobToken(`${head}.${badBody}.${signature}`, AUDIENCE, PUBLIC_PEM),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects tokens that are not EdDSA (alg downgrade)', () => {
    const token = signToken(validPayload(), { header: { alg: 'HS256', typ: 'JWT' } });
    expect(verifyTorobToken(token, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'algorithm',
    });
    const tokenNoAlg = signToken(validPayload(), { header: { typ: 'JWT' } });
    expect(verifyTorobToken(tokenNoAlg, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'algorithm',
    });
  });

  it('rejects signatures that do not verify against the given key', () => {
    const token = signToken(validPayload(), { signature: 'A'.repeat(86) });
    expect(verifyTorobToken(token, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'signature',
    });
    const other = generateKeyPairSync('ed25519');
    const wrongKeyPem = other.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    const tokenWrongKey = signToken(validPayload());
    expect(verifyTorobToken(tokenWrongKey, AUDIENCE, wrongKeyPem)).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('rejects expired tokens', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signToken({ exp: now - 1, nbf: now - 60, aud: AUDIENCE });
    expect(verifyTorobToken(token, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects not-yet-valid tokens (nbf in the future)', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signToken({ exp: now + 120, nbf: now + 60, aud: AUDIENCE });
    expect(verifyTorobToken(token, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'early',
    });
  });

  it('rejects tokens for a different audience', () => {
    const token = signToken({ ...validPayload(), aud: 'other.example' });
    expect(verifyTorobToken(token, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'audience',
    });
    expect(verifyTorobToken(signToken(validPayload()), AUDIENCE, PUBLIC_PEM)).toEqual(
      { ok: true },
    );
  });

  it('rejects non-numeric exp/nbf claims', () => {
    const expToken = signToken({ ...validPayload(), exp: 'soon' });
    expect(verifyTorobToken(expToken, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'expired',
    });
    const nbfToken = signToken({ ...validPayload(), nbf: null });
    expect(verifyTorobToken(nbfToken, AUDIENCE, PUBLIC_PEM)).toEqual({
      ok: false,
      reason: 'early',
    });
  });
});
